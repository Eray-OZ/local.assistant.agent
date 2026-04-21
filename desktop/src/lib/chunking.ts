import { ParsedMessage } from './whatsappParser';

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
  windowSize = 20, 
  overlapSize = 5
): MessageChunk[] {
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
    const msgDate = parseDate(msg.date);
    
    if (!currentChunkParams) {
      currentChunkParams = { startTime: msgDate, endTime: msgDate, messages: [msg] };
      continue;
    }
    
    const diffMinutes = (msgDate.getTime() - currentChunkParams.endTime.getTime()) / (1000 * 60);
    
    // Eğer zaman boşluktan küçükse VEYA pencere (window) limitine gelmediyse eklemeye devam et.
    if (diffMinutes <= maxGapMinutes && currentChunkParams.messages.length < windowSize) {
      currentChunkParams.messages.push(msg);
      currentChunkParams.endTime = msgDate;
    } else {
      // Sınırı aştık (Ya çok fazla zaman geçti ya da mesaj bloğu çok büyüdü), bloğu kaydet.
      finalizeChunk();
      
      // Eğer zaman limitinden kopmadıysak ve sadece mesaja (windowSize) takıldıysak OVERLAP (Örtüşme) yap.
      if (diffMinutes <= maxGapMinutes) {
        const overlapMsgs = currentChunkParams.messages.slice(-overlapSize);
        // Örtüşen kısımla yeni bloğu başlat
        currentChunkParams = { 
          startTime: parseDate(overlapMsgs[0].date), 
          endTime: msgDate, 
          messages: [...overlapMsgs, msg] 
        };
      } else {
        // Zaman çok geçmiş, sıfırdan yeni blok başlat
        currentChunkParams = { startTime: msgDate, endTime: msgDate, messages: [msg] };
      }
    }
  }

  if (currentChunkParams && currentChunkParams.messages.length > 0) {
     finalizeChunk();
  }

  return chunks;
}
