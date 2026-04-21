import { NextResponse } from 'next/server';
import { createEmbedding } from '@/lib/embedding';
import { extractDateRange } from '@/lib/dateExtractor';
import { generateOllamaCompletion, generateOllamaStream } from '@/lib/llm';
import { openWhatsAppTable } from '@/lib/vectorDb';
import {
  findMatchingMessages,
  formatMatchedMessage,
  isDirectMessageRequest,
} from '@/lib/whatsappSearch';

interface VectorSearchRow {
  sessionId: string;
  text: string;
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

async function getVectorContext(superQuery: string, dateRange: ReturnType<typeof extractDateRange>) {
  const queryVector = await createEmbedding(superQuery);
  const table = await openWhatsAppTable();
  if (!table) {
    return null;
  }

  let query = table.search(queryVector).limit(25);
  if (dateRange) {
    const whereClause = `startTime >= '${dateRange.start}' AND startTime < '${dateRange.end}'`;
    query = query.where(whereClause);
  }

  const results = await query.toArray() as VectorSearchRow[];
  return results.filter((row) => row.sessionId !== 'init');
}

export async function POST(request: Request) {
  try {
    const { message, model } = await request.json();
    if (!message) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 });
    }

    const resolvedModel = model || 'gemma4';
    const dateRange = extractDateRange(message);
    const directMessageRequest = isDirectMessageRequest(message);
    const rawMatches = findMatchingMessages(
      message,
      dateRange,
      directMessageRequest ? 5 : 20,
      directMessageRequest ? { requirePrimaryTermHit: true, preferFocusedPhrase: true } : {}
    );

    if (directMessageRequest) {
      if (rawMatches.length === 0) {
        return streamTextResponse('Maalesef bu tarihte/konuda mesaj bulunamadi. Lutfen farkli bir tarih veya anahtar kelime deneyin.');
      }

      return streamTextResponse(formatMatchedMessage(rawMatches[0]));
    }

    let contextText = rawMatches.map(formatMatchedMessage).join('\n');

    if (!contextText) {
      const expansionPrompt = `Kullanici WhatsApp veritabaninda arama yapmak icin su soruyu sordu: "${message}". Bu soruyu semantik aramada daha iyi bulabilmek icin 4-5 Turkce anahtar kelimeyi virgulle yaz. Sadece kelime listesi ver.`;
      let expandedKeywords = '';

      try {
        expandedKeywords = await generateOllamaCompletion(expansionPrompt, resolvedModel);
      } catch {
        expandedKeywords = '';
      }

      const superQuery = `${message} ${expandedKeywords}`.trim();
      const vectorResults = await getVectorContext(superQuery, dateRange);

      if (!vectorResults) {
        return NextResponse.json({ error: 'Index is empty.' }, { status: 404 });
      }

      contextText = vectorResults
        .map((row) => `--- Conversation Context ---\n${row.text}`)
        .join('\n\n');
    }

    if (!contextText.trim()) {
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
