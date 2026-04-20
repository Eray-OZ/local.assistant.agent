import { ParsedMessage } from './whatsappParser';

export interface MessageChunk {
  sessionId: string;
  startTime: string;
  endTime: string;
  text: string;
  messageCount: number;
}

export function chunkWhatsAppMessages(messages: ParsedMessage[], maxGapMinutes = 60): MessageChunk[] {
  if (messages.length === 0) return [];

  const chunks: MessageChunk[] = [];
  let currentChunkParams: { startTime: Date, endTime: Date, messages: ParsedMessage[] } | null = null;
  
  // Helper to parse dates like "23.12.2023 14:30:15" vs "1/23/24, 10:15 AM"
  const parseDate = (dateStr: string) => {
    let normalized = dateStr.replace(/\./g, '/').replace(/ -/g, '');
    const ts = Date.parse(normalized);
    if (!isNaN(ts)) return new Date(ts);
    return new Date(); // fallback
  };

  for (const msg of messages) {
    const msgDate = parseDate(msg.date);
    
    if (!currentChunkParams) {
      currentChunkParams = { startTime: msgDate, endTime: msgDate, messages: [msg] };
      continue;
    }
    
    const diffMinutes = (msgDate.getTime() - currentChunkParams.endTime.getTime()) / (1000 * 60);
    
    if (diffMinutes <= maxGapMinutes) {
      currentChunkParams.messages.push(msg);
      currentChunkParams.endTime = msgDate;
    } else {
      chunks.push({
        sessionId: `session_${currentChunkParams.startTime.getTime()}`,
        startTime: currentChunkParams.startTime.toISOString(),
        endTime: currentChunkParams.endTime.toISOString(),
        text: currentChunkParams.messages.map(m => `[${m.date}] ${m.sender}: ${m.content}`).join('\n'),
        messageCount: currentChunkParams.messages.length
      });
      currentChunkParams = { startTime: msgDate, endTime: msgDate, messages: [msg] };
    }
  }

  if (currentChunkParams) {
     chunks.push({
      sessionId: `session_${currentChunkParams.startTime.getTime()}`,
      startTime: currentChunkParams.startTime.toISOString(),
      endTime: currentChunkParams.endTime.toISOString(),
      text: currentChunkParams.messages.map(m => `[${m.date}] ${m.sender}: ${m.content}`).join('\n'),
      messageCount: currentChunkParams.messages.length
    });
  }

  return chunks;
}
