import { NextResponse } from 'next/server';
import db, { getChatDocuments, addChatDocument, removeChatDocument, getAvailableDocuments } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const documents = getChatDocuments(id);
    const available = getAvailableDocuments();
    
    return NextResponse.json({ 
      selected: documents,
      available: available
    });
  } catch (error) {
    console.error('Error fetching chat documents:', error);
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { jobId, action } = await request.json();
    
    if (!jobId || !action) {
      return NextResponse.json({ error: 'Missing jobId or action' }, { status: 400 });
    }
    
    if (action === 'add') {
      const added = addChatDocument(id, jobId);
      return NextResponse.json({ success: added });
    } else if (action === 'remove') {
      removeChatDocument(id, jobId);
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error updating chat documents:', error);
    return NextResponse.json({ error: 'Failed to update documents' }, { status: 500 });
  }
}
