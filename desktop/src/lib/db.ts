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
    filename TEXT,
    total_chunks INTEGER NOT NULL,
    completed_chunks INTEGER DEFAULT 0,
    status TEXT DEFAULT 'in_progress',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    job_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES embedding_jobs(id) ON DELETE CASCADE,
    UNIQUE(session_id, job_id)
  );
`);

initializeWhatsAppFts();

// Migrations — safe to run on every startup
function runMigrations() {
  // Add filename column to embedding_jobs if it doesn't exist (added after initial release)
  const columns = db.pragma('table_info(embedding_jobs)') as { name: string }[];
  const hasFilename = columns.some((col) => col.name === 'filename');
  if (!hasFilename) {
    db.exec('ALTER TABLE embedding_jobs ADD COLUMN filename TEXT;');
  }
}

runMigrations();

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

// Chat document functions
export function getChatDocuments(sessionId: string) {
  return db.prepare(`
    SELECT ej.id, ej.filename, ej.file_hash, ej.total_chunks
    FROM chat_documents cd
    JOIN embedding_jobs ej ON cd.job_id = ej.id
    WHERE cd.session_id = ?
  `).all(sessionId) as { id: number; filename: string | null; file_hash: string; total_chunks: number }[];
}

export function addChatDocument(sessionId: string, jobId: number) {
  try {
    db.prepare('INSERT INTO chat_documents (session_id, job_id) VALUES (?, ?)').run(sessionId, jobId);
    return true;
  } catch {
    return false; // Already exists
  }
}

export function removeChatDocument(sessionId: string, jobId: number) {
  db.prepare('DELETE FROM chat_documents WHERE session_id = ? AND job_id = ?').run(sessionId, jobId);
  return true;
}

export function getAvailableDocuments() {
  return db.prepare(`
    SELECT id, filename, file_hash, total_chunks, completed_chunks, status, created_at
    FROM embedding_jobs
    WHERE status = 'completed'
    ORDER BY created_at DESC
  `).all() as { id: number; filename: string | null; file_hash: string; total_chunks: number; completed_chunks: number; status: string; created_at: string }[];
}

export function updateJobFilename(jobId: number, filename: string) {
  db.prepare('UPDATE embedding_jobs SET filename = ? WHERE id = ?').run(filename, jobId);
}

export default db;
