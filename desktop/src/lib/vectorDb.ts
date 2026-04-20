import * as lancedb from '@lancedb/lancedb';
import path from 'path';

let _db: lancedb.Connection | null = null;
let _table: any = null;

export async function getVectorDb() {
  if (!_db) {
    const dbPath = path.resolve(process.cwd(), '.lancedb');
    _db = await lancedb.connect(dbPath);
  }
  return _db;
}

export async function getWhatsAppTable() {
  if (_table) return _table;
  
  const db = await getVectorDb();
  const tableNames = await db.tableNames();
  
  if (!tableNames.includes('whatsapp_chunks')) {
    // Initializing schema with a dummy record
    const emptyData = [
      { 
        vector: Array(384).fill(0), 
        text: 'init', 
        sessionId: 'init', 
        startTime: 'init', 
        endTime: 'init', 
        messageCount: 0 
      }
    ];
    _table = await db.createTable('whatsapp_chunks', emptyData);
  } else {
    _table = await db.openTable('whatsapp_chunks');
  }
  
  return _table;
}
