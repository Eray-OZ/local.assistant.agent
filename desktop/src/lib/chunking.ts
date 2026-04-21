import { ParsedMessage } from './whatsappParser';
import { parseWhatsAppDate } from './whatsappDate';

export interface MessageChunk {
  sessionId: string;
  startTime: string;
  endTime: string;
  text: string;
  messageCount: number;
}

export function chunkWhatsAppMessages(
  messages: ParsedMessage[], 
  maxGapMinutes = 60, 
  windowSize = 10,     // Max message count per chunk
  overlapSize = 2,
  maxCharsPerChunk = 600  // ~100-150 tokens — optimal RAG sweet spot
): MessageChunk[] {
  if (messages.length === 0) return [];

  const chunks: MessageChunk[] = [];
  let currentChunkParams: { startTime: Date, endTime: Date, messages: ParsedMessage[] } | null = null;
  
  const finalizeChunk = () => {
    if (!currentChunkParams || currentChunkParams.messages.length === 0) return;
    chunks.push({
      sessionId: `session_${currentChunkParams.startTime.getTime()}`,
      startTime: currentChunkParams.startTime.toISOString(),
      endTime: currentChunkParams.endTime.toISOString(),
      text: currentChunkParams.messages.map(m => `[${m.date}] ${m.sender}: ${m.content}`).join('\n'),
      messageCount: currentChunkParams.messages.length
    });
  };

  for (const msg of messages) {
    const msgDate = parseWhatsAppDate(msg.date) ?? new Date(0);
    const msgText = `[${msg.date}] ${msg.sender}: ${msg.content}`;
    
    if (!currentChunkParams) {
      currentChunkParams = { startTime: msgDate, endTime: msgDate, messages: [msg] };
      continue;
    }
    
    const diffMinutes = (msgDate.getTime() - currentChunkParams.endTime.getTime()) / (1000 * 60);
    const currentChars = currentChunkParams.messages.reduce((sum, m) =>
      sum + `[${m.date}] ${m.sender}: ${m.content}`.length, 0
    );

    const withinTime    = diffMinutes <= maxGapMinutes;
    const withinMsgCnt  = currentChunkParams.messages.length < windowSize;
    const withinChars   = (currentChars + msgText.length) <= maxCharsPerChunk;

    // Append to chunk — all three conditions must hold
    if (withinTime && withinMsgCnt && withinChars) {
      currentChunkParams.messages.push(msg);
      currentChunkParams.endTime = msgDate;
    } else {
      // Chunk size exceeded: finalize current chunk
      finalizeChunk();
      
      // If still within time window (only size exceeded), apply overlap so context isn't lost
      if (withinTime) {
        const overlapMsgs = currentChunkParams.messages.slice(-overlapSize);
        currentChunkParams = { 
          startTime: parseWhatsAppDate(overlapMsgs[0].date) ?? new Date(0), 
          endTime: msgDate, 
          messages: [...overlapMsgs, msg] 
        };
      } else {
        // Time gap too large: start fresh chunk with no overlap
        currentChunkParams = { startTime: msgDate, endTime: msgDate, messages: [msg] };
      }
    }
  }

  if (currentChunkParams && currentChunkParams.messages.length > 0) {
     finalizeChunk();
  }

  return chunks;
}
