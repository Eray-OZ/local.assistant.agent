import * as lancedb from '@lancedb/lancedb';
import path from 'path';

let _db: lancedb.Connection | null = null;

export async function getVectorDb() {
  if (!_db) {
    const dbPath = path.resolve(process.cwd(), '.lancedb');
    _db = await lancedb.connect(dbPath);
  }
  return _db;
}

export async function openWhatsAppTable() {
  const db = await getVectorDb();
  const tableNames = await db.tableNames();
  
  if (!tableNames.includes('whatsapp_chunks')) {
    return null; // Table not created yet
  }
  
  return await db.openTable('whatsapp_chunks');
}
