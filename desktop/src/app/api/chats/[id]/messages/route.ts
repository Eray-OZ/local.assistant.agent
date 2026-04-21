import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    
    // First confirm session exists
    const sessionCheck = db.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(id);
    if (!sessionCheck) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const stmt = db.prepare('SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id ASC');
    const messages = stmt.all(id);

    return NextResponse.json({ messages });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { role, content } = await request.json();

    if (!role || !content) {
      return NextResponse.json({ error: 'Role and content are required' }, { status: 400 });
    }

    // Insert message
    const stmt = db.prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)');
    stmt.run(id, role, content);

    // Update the session's updated_at timestamp to bubble it up in the UI
    const updateStmt = db.prepare('UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    updateStmt.run(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST messages error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
