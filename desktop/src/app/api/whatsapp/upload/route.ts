import { NextResponse } from 'next/server';
import crypto from 'crypto';
import db from '@/lib/db';
import { parseWhatsAppChat } from '@/lib/whatsappParser';
import { chunkWhatsAppMessages } from '@/lib/chunking';
import { createEmbedding } from '@/lib/embedding';
import { getVectorDb } from '@/lib/vectorDb';

const BATCH_SIZE = 500;

// Retry wrapper: if Ollama crashes temporarily, retry up to 3 times
async function createEmbeddingWithRetry(text: string, retries = 3): Promise<number[]> {
  const MAX_EMBED_CHARS = 800;
  const safeText = text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) + '...' : text;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await createEmbedding(safeText);
    } catch (err: any) {
      if (attempt === retries) throw err;
      const waitMs = attempt * 2000;
      console.warn(`\n  ⚠️  Embedding error (attempt ${attempt}/${retries}), waiting ${waitMs/1000}s...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw new Error('Embedding failed after all retries');
}

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

    // Compute file hash for checkpoint tracking
    const fileHash = crypto.createHash('md5').update(text).digest('hex');

    // Parse into chunks
    const chunks = chunkWhatsAppMessages(messages, 60, 10, 2, 600);

    // --- CHECKPOINT LOGIC ---
    const existingJob = db.prepare('SELECT * FROM embedding_jobs WHERE file_hash = ?').get(fileHash) as any;

    let startChunkIndex = 0;
    let dropExistingTable = true;

    if (existingJob && existingJob.status === 'in_progress' && existingJob.completed_chunks > 0) {
      // Resume from last saved checkpoint
      startChunkIndex = existingJob.completed_chunks;
      dropExistingTable = false;
      console.log(`\n🔄 Checkpoint found! Resuming from chunk ${startChunkIndex}/${chunks.length} (${Math.round(startChunkIndex/chunks.length*100)}% already done)...\n`);
    } else {
      // Fresh start — insert or replace job record
      db.prepare('INSERT OR REPLACE INTO embedding_jobs (file_hash, total_chunks, completed_chunks, status) VALUES (?, ?, 0, \'in_progress\')').run(fileHash, chunks.length);
      console.log(`\n📦 Fresh start: ${chunks.length} chunks to embed...\n`);
    }

    // 1. Insert raw messages into SQLite
    if (startChunkIndex === 0) {
      // Only insert raw messages on a fresh start (not resume)
      db.prepare('DELETE FROM whatsapp_messages').run();
      const insert = db.prepare('INSERT INTO whatsapp_messages (message_date, sender, content) VALUES (@date, @sender, @content)');
      const insertMany = db.transaction((msgs: any[]) => { for (const msg of msgs) insert.run(msg); });
      insertMany(messages);
    }

    // 2. Setup vector DB
    const vectorDb = await getVectorDb();
    const tableNames = await vectorDb.tableNames();
    if (dropExistingTable && tableNames.includes('whatsapp_chunks')) {
      await vectorDb.dropTable('whatsapp_chunks');
    }
    let tableCreated = !dropExistingTable && tableNames.includes('whatsapp_chunks');

    // 3. Embed chunks and save — batched every BATCH_SIZE chunks
    const startTime = Date.now();
    let totalEmbedded = startChunkIndex; // Count already embedded from checkpoint
    const updateProgress = db.prepare('UPDATE embedding_jobs SET completed_chunks = ?, updated_at = CURRENT_TIMESTAMP WHERE file_hash = ?');

    console.log(`📦 Embedding started: processing chunks ${startChunkIndex + 1} → ${chunks.length}...\n`);

    for (let i = startChunkIndex; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, Math.min(i + BATCH_SIZE, chunks.length));
      const batchData = [];

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const vector = await createEmbeddingWithRetry(chunk.text);
        batchData.push({
          vector,
          text: chunk.text,
          sessionId: chunk.sessionId,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          messageCount: chunk.messageCount
        });

        const done = i + j + 1;
        const pct = Math.round((done / chunks.length) * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        const msPerChunk = (Date.now() - startTime) / (done - startChunkIndex);
        const remaining = Math.round(((chunks.length - done) * msPerChunk) / 1000);
        const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
        process.stdout.write(`\r  [${bar}] ${pct}%  (${done}/${chunks.length} chunks)  ⏱ ${elapsed.toFixed(0)}s  ~${remaining}s left   `);
      }

      // Save batch to LanceDB
      if (batchData.length > 0) {
        if (!tableCreated) {
          await vectorDb.createTable('whatsapp_chunks', batchData);
          tableCreated = true;
        } else {
          const table = await vectorDb.openTable('whatsapp_chunks');
          await table.add(batchData);
        }
        totalEmbedded += batchData.length;

        // ✅ Update checkpoint in SQLite
        updateProgress.run(totalEmbedded, fileHash);
        console.log(`\n  💾 Checkpoint saved: ${totalEmbedded}/${chunks.length} chunks in LanceDB.`);
      }
    }

    // Mark job as done
    db.prepare('UPDATE embedding_jobs SET status = \'done\', completed_chunks = ?, updated_at = CURRENT_TIMESTAMP WHERE file_hash = ?').run(chunks.length, fileHash);
    console.log(`\n\n✅ Embedding complete! ${totalEmbedded} chunks embedded and saved.\n`);

    return NextResponse.json({ 
      success: true, 
      message: `Processed ${messages.length} messages into ${totalEmbedded} searchable chunks.`
    });

  } catch (error: any) {
    console.error('\nError processing WhatsApp upload:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
