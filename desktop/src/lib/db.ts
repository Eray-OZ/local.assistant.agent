import Database from 'better-sqlite3';
import path from 'path';

// Create or connect to the database in the root of the desktop project
const dbPath = path.resolve(process.cwd(), 'assistant.db');
const db = new Database(dbPath);

function initializeWhatsAppFts() {
  const existing = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'whatsapp_messages_fts'")
    .get() as { sql?: string } | undefined;

  const currentSql = existing?.sql ?? '';
  const needsReset =
    !currentSql ||
    currentSql.includes("content='whatsapp_messages'") ||
    !currentSql.includes('message_id UNINDEXED');

  if (needsReset) {
    db.exec(`
      DROP TRIGGER IF EXISTS whatsapp_messages_ai;
      DROP TRIGGER IF EXISTS whatsapp_messages_ad;
      DROP TRIGGER IF EXISTS whatsapp_messages_au;
      DROP TABLE IF EXISTS whatsapp_messages_fts;
    `);

    db.exec(`
      CREATE VIRTUAL TABLE whatsapp_messages_fts USING fts5(
        message_id UNINDEXED,
        sender,
        content,
        message_date UNINDEXED,
        tokenize='unicode61 remove_diacritics 2'
      );
    `);
  }
}

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_date TEXT,
    sender TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    module TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS embedding_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_hash TEXT NOT NULL UNIQUE,
    total_chunks INTEGER NOT NULL,
    completed_chunks INTEGER DEFAULT 0,
    status TEXT DEFAULT 'in_progress',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

initializeWhatsAppFts();

export function rebuildWhatsAppSearchIndex() {
  db.exec('DELETE FROM whatsapp_messages_fts;');
  db.prepare(`
    INSERT INTO whatsapp_messages_fts (message_id, sender, content, message_date)
    SELECT id, sender, content, message_date
    FROM whatsapp_messages
  `).run();
}

export function ensureWhatsAppSearchIndex() {
  const messageCount = (db.prepare('SELECT COUNT(*) AS count FROM whatsapp_messages').get() as { count: number }).count;
  const indexCount = (db.prepare('SELECT COUNT(*) AS count FROM whatsapp_messages_fts').get() as { count: number }).count;

  if (messageCount > 0 && indexCount !== messageCount) {
    rebuildWhatsAppSearchIndex();
  }
}

export default db;
