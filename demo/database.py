import sqlite3
from datetime import datetime

DB_PATH = "emails.db"


def init_db():
    """Create the processed_emails table if it does not already exist."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS processed_emails (
                email_id    TEXT PRIMARY KEY,
                category    TEXT NOT NULL,
                processed_at TEXT NOT NULL
            )
        """)
        conn.commit()


def is_processed(email_id: str) -> bool:
    """Return True if the given email ID has already been processed."""
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT 1 FROM processed_emails WHERE email_id = ?", (email_id,)
        ).fetchone()
    return row is not None


def mark_as_processed(email_id: str, category: str):
    """Insert an email record into the database, marking it as processed."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO processed_emails (email_id, category, processed_at) VALUES (?, ?, ?)",
            (email_id, category, datetime.utcnow().isoformat()),
        )
        conn.commit()


def get_all_processed():
    """Return all rows from the processed_emails table."""
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT email_id, category, processed_at FROM processed_emails ORDER BY processed_at DESC"
        ).fetchall()
    return rows
