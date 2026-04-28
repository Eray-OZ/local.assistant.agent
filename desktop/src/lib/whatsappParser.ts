export interface ParsedMessage {
  date: string;
  sender: string;
  content: string;
  isForwarded?: boolean;
}

// WhatsApp mesaj formatlarını tanıma
const DATE_PATTERN = /^(\[?\d{1,4}[\.\/\-]\d{1,2}[\.\/\-]\d{1,4}[\s,]*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?\]?)[\s\-]*(.+?)[\s]*:[\s]*(.*)$/i;

const FORWARD_PATTERNS = [
  /^[\u200E\u200F]*İletildi$/i,
  /^[\u200E\u200F]*Forwarded$/i,
];

// Medya mesajları - bunları filtreleyeceğiz
const MEDIA_PATTERNS = [
  /<media omitted>/i,
  /<dosya dahil edilmedi>/i,
  /\(dosya dahil edilmedi\)/i,
  /<file attached>/i,
  /^(?:resim|video|ses|dosya|belge|kişi kartı|konum|pdf|doc|jpg|png|gif|mp4|webm|opus|weba|mp3|m4a|vcard|vcf)(?:\s+dahil\s+edilmedi)?$/i,
  /^\[(?:resim|video|ses|dosya|belge)\]$/i,
  /\u200E?\u200F?\[(?:Resim|Video|Ses|Dosya|Belge|PDF|Sticker|GIF)\]$/i,
];

function isMediaMessage(content: string): boolean {
  if (!content || content.trim().length === 0) return true;
  return MEDIA_PATTERNS.some(pattern => pattern.test(content.trim()));
}

function isValidSender(sender: string): boolean {
  if (!sender || sender.trim().length === 0) return false;
  if (/^\d{1,4}[\.\/\-]\d{1,2}[\.\/\-]\d{1,4}/.test(sender)) return false;
  return true;
}

export function parseWhatsAppChat(text: string): ParsedMessage[] {
  const lines = text.split('\n');
  const messages: ParsedMessage[] = [];
  
  let currentMessage: ParsedMessage | null = null;
  let lineNumber = 0;
  
  for (const rawLine of lines) {
    lineNumber++;
    const line = rawLine.trim();
    if (!line) continue;
    
    const match = line.match(DATE_PATTERN);
    
    if (match) {
      if (currentMessage) {
        if (!isMediaMessage(currentMessage.content) && isValidSender(currentMessage.sender)) {
          messages.push(currentMessage);
        }
      }
      
      const date = match[1].replace(/[\[\]]/g, '').trim();
      const sender = match[2].trim();
      const content = match[3].trim();
      
      currentMessage = { date, sender, content, isForwarded: false };
    } else if (currentMessage) {
      // Check if this line is just a "Forwarded" marker
      const isForwardMarker = FORWARD_PATTERNS.some(p => p.test(line));
      if (isForwardMarker) {
        currentMessage.isForwarded = true;
      } else {
        currentMessage.content += (currentMessage.content ? '\n' : '') + line;
      }
    }
  }
  
  if (currentMessage) {
    if (!isMediaMessage(currentMessage.content) && isValidSender(currentMessage.sender)) {
      messages.push(currentMessage);
    }
  }
  
  return messages;
}
