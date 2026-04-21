import { NextResponse } from 'next/server';
import { openWhatsAppTable } from '@/lib/vectorDb';
import db from '@/lib/db';

export async function GET() {
  try {
    // Check SQLite checkpoint first (fast, no LanceDB overhead)
    const job = db.prepare("SELECT * FROM embedding_jobs WHERE status = 'done' ORDER BY id DESC LIMIT 1").get() as any;

    // Also try LanceDB
    let lanceRows = 0;
    try {
      const table = await openWhatsAppTable();
      if (table) {
        lanceRows = await table.countRows();
      }
    } catch (_) {}

    const rows = lanceRows || (job?.total_chunks ?? 0);
    const loaded = rows > 0;

    return NextResponse.json({ loaded, rows });
  } catch (error) {
    return NextResponse.json({ loaded: false, rows: 0, error: 'Failed to verify database status.' });
  }
}
