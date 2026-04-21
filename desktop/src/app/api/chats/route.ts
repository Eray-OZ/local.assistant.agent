import { NextResponse } from 'next/server';
import db from '@/lib/db';
import crypto from 'crypto';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const moduleType = searchParams.get('module');

    if (!moduleType) {
      return NextResponse.json({ error: 'Module query parameter is required' }, { status: 400 });
    }

    const stmt = db.prepare('SELECT * FROM chat_sessions WHERE module = ? ORDER BY updated_at DESC');
    const sessions = stmt.all(moduleType);

    return NextResponse.json({ sessions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { module: moduleType, title } = await request.json();

    if (!moduleType || !title) {
      return NextResponse.json({ error: 'Module and title are required' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const stmt = db.prepare('INSERT INTO chat_sessions (id, module, title) VALUES (?, ?, ?)');
    stmt.run(id, moduleType, title);

    const checkStmt = db.prepare('SELECT * FROM chat_sessions WHERE id = ?');
    const newSession = checkStmt.get(id);

    return NextResponse.json({ session: newSession }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/chats error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
