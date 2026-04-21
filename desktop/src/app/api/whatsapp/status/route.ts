import { NextResponse } from 'next/server';
import { openWhatsAppTable } from '@/lib/vectorDb';

export async function GET() {
  try {
    const table = await openWhatsAppTable();
    if (!table) {
      return NextResponse.json({ loaded: false });
    }
    
    const count = await table.countRows();
    return NextResponse.json({ loaded: true, rows: count });
  } catch (error) {
    return NextResponse.json({ loaded: false, error: 'Failed to verify database status.' });
  }
}
