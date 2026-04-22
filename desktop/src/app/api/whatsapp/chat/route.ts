import { NextResponse } from 'next/server';
import { createEmbedding } from '@/lib/embedding';
import { generateOllamaCompletion, generateOllamaStream } from '@/lib/llm';
import { openWhatsAppTable } from '@/lib/vectorDb';
import { getChatDocuments } from '@/lib/db';
import { parseQueryIntent } from '@/lib/queryParser';
import type { QueryIntent } from '@/lib/queryParser';
import {
  findMatchingMessages,
  formatMatchedMessage,
  isDirectMessageRequest,
} from '@/lib/whatsappSearch';

interface VectorSearchRow {
  sessionId: string;
  text: string;
  fileHash: string;
}

function streamTextResponse(text: string) {
  const encoder = new TextEncoder();
  const payload = `${JSON.stringify({ response: text })}\n`;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

async function getVectorContext(
  superQuery: string, 
  dateRange: QueryIntent['dateRange'],
  fileHashes: string[]
) {
  const queryVector = await createEmbedding(superQuery);
  const table = await openWhatsAppTable();
  if (!table) {
    return null;
  }

  let query = table.search(queryVector).limit(50);
  
  // Build where clause with date range and file hash filter
  const conditions: string[] = [];
  
  if (dateRange) {
    conditions.push(`startTime >= '${dateRange.start}' AND startTime < '${dateRange.end}'`);
  }
  
  if (fileHashes.length > 0) {
    const hashList = fileHashes.map(h => `'${h}'`).join(',');
    conditions.push(`fileHash IN (${hashList})`);
  }
  
  if (conditions.length > 0) {
    query = query.where(conditions.join(' AND '));
  }

  const results = await query.toArray() as VectorSearchRow[];
  return results
    .filter((row) => row.sessionId !== 'init')
    .filter((row) => fileHashes.length === 0 || fileHashes.includes(row.fileHash))
    .slice(0, 25);
}

export async function POST(request: Request) {
  try {
    const { message, model, sessionId } = await request.json();
    if (!message) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 });
    }

    // Get selected documents for this chat session
    let selectedFileHashes: string[] = [];
    if (sessionId) {
      const docs = getChatDocuments(sessionId);
      selectedFileHashes = docs.map(d => d.file_hash);
    }

    const resolvedModel = model || 'gemma4';
    
    // Parse query intent using LLM
    const intent = await parseQueryIntent(message, resolvedModel);
    const directMessageRequest = isDirectMessageRequest(intent);

    // Search with parsed intent
    const rawMatches = await findMatchingMessages(
      intent,
      directMessageRequest ? 5 : 20
    );

    if (directMessageRequest) {
      if (rawMatches.length === 0) {
        return streamTextResponse('Maalesef bu tarihte/konuda mesaj bulunamadi. Lutfen farkli bir tarih veya anahtar kelime deneyin.');
      }

      return streamTextResponse(formatMatchedMessage(rawMatches[0]));
    }

    let contextText = rawMatches.map(formatMatchedMessage).join('\n');

    // Fallback to vector search if no FTS results
    if (!contextText) {
      // Build super query from intent search terms
      const superQuery = [message, ...intent.searchTerms].join(' ').trim();
      const vectorResults = await getVectorContext(superQuery, intent.dateRange, selectedFileHashes);

      if (!vectorResults) {
        return NextResponse.json({ error: 'Index is empty.' }, { status: 404 });
      }

      contextText = vectorResults
        .map((row) => `--- Conversation Context ---\n${row.text}`)
        .join('\n\n');
    }

    if (!contextText.trim()) {
      if (selectedFileHashes.length === 0) {
        return streamTextResponse('Once sohbet icin belge secin. Sag panelden "Documents" bolumunden yuklenen dosyalari secin.');
      }
      return streamTextResponse('Maalesef bu tarihte/konuda mesaj bulunamadi. Lutfen farkli bir tarih veya anahtar kelime deneyin.');
    }

    const systemPrompt = `Sen, kullanicinin kisisel WhatsApp mesajlarini analiz eden bir asistansin.
Kurallar:
1. Sadece verilen baglamdaki mesaji veya mesajlari kullan.
2. Baglamda olmayan tarih, saat, icerik veya kisi uydurma.
3. Mesaj satirlarini aynen aktar; ozetleme veya yeniden yazma yapma.
4. Kullanici tek bir mesaj istiyorsa, sadece en uygun tek satiri don.`;

    const userPrompt = `WhatsApp baglami:
${contextText}

Kullanici sorusu: ${message}

Sadece baglamdaki satirlari kullanarak cevap ver. Eger uygun mesaj yoksa "Maalesef bu tarihte/konuda mesaj bulunamadi." de.`;

    try {
      const stream = await generateOllamaStream(userPrompt, resolvedModel, systemPrompt);
      return new Response(stream, {
        headers: { 'Content-Type': 'application/x-ndjson' },
      });
    } catch (error: unknown) {
      return NextResponse.json(
        {
          error: 'Failed to connect to local Ollama.',
          details: error instanceof Error ? error.message : 'Unknown Ollama error',
        },
        { status: 502 }
      );
    }
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : 'Unknown server error',
      },
      { status: 500 }
    );
  }
}
