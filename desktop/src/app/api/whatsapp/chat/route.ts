import { NextResponse } from 'next/server';
import { createEmbedding } from '@/lib/embedding';
import { openWhatsAppTable } from '@/lib/vectorDb';
import { generateOllamaStream } from '@/lib/llm';

export async function POST(request: Request) {
  try {
    const { message, model } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 });
    }

    // 1. Search for relevant Context in LanceDB
    const queryVector = await createEmbedding(message);
    const table = await openWhatsAppTable();
    if (!table) return NextResponse.json({ error: 'Index is empty.' }, { status: 404 });
    const searchResults = await table.search(queryVector)
      .limit(15)
      .toArray();

    const cleanedResults = searchResults.filter(r => r.sessionId !== 'init');
    const contextText = cleanedResults.map(r => `--- Conversation Context ---\n${r.text}`).join('\n\n');

    // 2. Generate Prompt with retrieved context
    const prompt = `Context Information (Past WhatsApp Messages):\n${contextText}\n\nUser Question:\n${message}\n\nPlease respond naturally to the user based ONLY on the context information above. If the context does not contain the answer, say you don't know based on the provided messages.`;

    // 3. Connect to local Ollama and Stream response
    try {
        const stream = await generateOllamaStream(prompt, model || 'gemma4');
        return new Response(stream, {
            headers: { 'Content-Type': 'application/x-ndjson' }
        });
    } catch (ollamaErr: any) {
        console.error("Ollama connection failed", ollamaErr);
        return NextResponse.json({ error: 'Failed to connect to local Ollama.', details: ollamaErr.message }, { status: 502 });
    }

  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
