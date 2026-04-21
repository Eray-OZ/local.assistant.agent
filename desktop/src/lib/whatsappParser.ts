export interface ParsedMessage {
  date: string;
  sender: string;
  content: string;
}

// WhatsApp mesaj formatlarını tanıma
// Format 1 (iOS/Turkish): [23.12.2023 14:30:15] Sender Name: Message content
// Format 2 (Android/US): 12/23/2023, 2:30 PM - Sender Name: Message content
// Format 3 (European):   23.12.2023, 14:30 - Sender Name: Message content

const DATE_PATTERN = /^(\[?\d{1,4}[\.\/\-]\d{1,2}[\.\/\-]\d{1,4}[\s,]*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?\]?)[\s\-]*(.+?)[\s]*:[\s]*(.*)$/i;

// Medya mesajları - bunları filtreleyeceğiz
const MEDIA_PATTERNS = [
  /<media omitted>/i,
  /<dosya dahil edilmedi>/i,
  /\(dosya dahil edilmedi\)/i,
  /<file attached>/i,
  /^(?:resim|video|ses|dosya|belge|kişi kartı|konum|pdf|doc|jpg|png|gif|mp4|webm|opus|weba|mp3|m4a|vcard|vcf)(?:\s+dahil\s+edilmedi)?$/i,
  /^\[(?:resim|video|ses|dosya|belge)\]$/i,
  /\u200E?\u200F?\[(?:Resim|Video|Ses|Dosya|Belge|PDF|Sticker|GIF)\]$/i, // Unicode direction markers + [Resim]
];

function isMediaMessage(content: string): boolean {
  if (!content || content.trim().length === 0) return true;
  return MEDIA_PATTERNS.some(pattern => pattern.test(content.trim()));
}

function isValidSender(sender: string): boolean {
  if (!sender || sender.trim().length === 0) return false;
  // Tarih formatları sender olarak yanlış parse edilmiş olabilir
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
    
    // Yeni mesaj başlangıcı mı?
    const match = line.match(DATE_PATTERN);
    
    if (match) {
      // Önceki mesajı kaydet
      if (currentMessage) {
        // Medya mesajı veya geçersiz mesajları filtrele
        if (!isMediaMessage(currentMessage.content) && isValidSender(currentMessage.sender)) {
          messages.push(currentMessage);
        } else if (!isValidSender(currentMessage.sender)) {
          console.warn(`[whatsappParser] Line ${lineNumber}: Invalid sender "${currentMessage.sender}", skipping`);
        }
      }
      
      // Yeni mesaj oluştur
      const date = match[1].replace(/[\[\]]/g, '').trim(); // Köşeli parantezleri kaldır
      const sender = match[2].trim();
      const content = match[3].trim();
      
      currentMessage = { date, sender, content };
    } else if (currentMessage) {
      // Çok satırlı mesajın devamı
      currentMessage.content += '\n' + line;
    } else {
      // İlk satır parse edilemedi - muhtemelen sistem mesajı veya boş satır
      // console.warn(`[whatsappParser] Line ${lineNumber}: Could not parse "${line.slice(0, 50)}..."`);
    }
  }
  
  // Son mesajı kaydet
  if (currentMessage) {
    if (!isMediaMessage(currentMessage.content) && isValidSender(currentMessage.sender)) {
      messages.push(currentMessage);
    }
  }
  
  console.log(`[whatsappParser] Parsed ${messages.length} valid messages from ${lineNumber} lines`);
  
  return messages;
}
