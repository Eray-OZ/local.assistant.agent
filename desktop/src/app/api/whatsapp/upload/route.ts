import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { parseWhatsAppChat } from '@/lib/whatsappParser';
import { chunkWhatsAppMessages } from '@/lib/chunking';
import { createEmbedding } from '@/lib/embedding';
import { getVectorDb, openWhatsAppTable } from '@/lib/vectorDb';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const text = await file.text();
    const messages = parseWhatsAppChat(text);
    
    if (messages.length === 0) {
      return NextResponse.json({ error: 'No messages could be parsed. Please ensure this is a valid WhatsApp .txt export.' }, { status: 400 });
    }

    // 1. Insert into database using a transaction (Raw Data)
    const insert = db.prepare(`
      INSERT INTO whatsapp_messages (message_date, sender, content) 
      VALUES (@date, @sender, @content)
    `);
    
    const insertMany = db.transaction((msgs) => {
      for (const msg of msgs) {
        insert.run(msg);
      }
    });

    insertMany(messages);

    // 2. Break down messages into conversation chunks
    const chunks = chunkWhatsAppMessages(messages, 60);

    // 3. Embed chunks and save to Vector DB (LanceDB)
    const vectorData = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vector = await createEmbedding(chunk.text);
      vectorData.push({
        vector,
        text: chunk.text,
        sessionId: chunk.sessionId,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        messageCount: chunk.messageCount
      });
      // Optionally could chunk database insertion here if vectorData gets too large
    }

    if (vectorData.length > 0) {
      const vectorDb = await getVectorDb();
      const tableNames = await vectorDb.tableNames();
      
      // Her yüklemede eski tabloyu sıfırlayalım ki yeni embedding boyutlarıyla (384, 768, vb.) çakışmasın.
      if (tableNames.includes('whatsapp_chunks')) {
        await vectorDb.dropTable('whatsapp_chunks');
      }
      
      await vectorDb.createTable('whatsapp_chunks', vectorData);
    }

    return NextResponse.json({ 
      success: true, 
      message: `Processed ${messages.length} messages, generated ${chunks.length} AI search blocks using Ollama Gemma 4.` 
    });

  } catch (error: any) {
    console.error('Error processing WhatsApp upload:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
