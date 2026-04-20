import { NextResponse } from 'next/server';
import { createEmbedding } from '@/lib/embedding';
import { openWhatsAppTable } from '@/lib/vectorDb';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = body.query;

    if (!query) {
      return NextResponse.json({ error: 'No query provided' }, { status: 400 });
    }

    const queryVector = await createEmbedding(query);
    const table = await openWhatsAppTable();
    if (!table) return NextResponse.json({ error: 'Index is empty.' }, { status: 404 });

    // Perform semantic vector search
    const results = await table.search(queryVector)
      .limit(5)
      .toArray();

    // Filter out the dummy 'init' row if it appears
    const cleanedResults = results.filter((r: any) => r.sessionId !== 'init');

    return NextResponse.json({ success: true, results: cleanedResults });
  } catch (error: any) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
