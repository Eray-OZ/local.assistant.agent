import Database from 'better-sqlite3';
import path from 'path';

// Create or connect to the database in the root of the desktop project
const dbPath = path.resolve(process.cwd(), 'assistant.db');
const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_date TEXT,
    sender TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export default db;
