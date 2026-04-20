export interface ParsedMessage {
  date: string;
  sender: string;
  content: string;
}

export function parseWhatsAppChat(text: string): ParsedMessage[] {
  const lines = text.split('\n');
  const messages: ParsedMessage[] = [];
  
  // Regex that captures typical WhatsApp export formats:
  // Format 1: [23.12.2023 14:30:15] Sender Name: Message content
  // Format 2: 23/12/2023, 14:30 - Sender Name: Message content
  const regex = /^\[?(.*?)(?:\]| -) (.*?): (.*)/;
  
  let currentMessage: ParsedMessage | null = null;
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    // Check if system message (often doesn't match the standard "[Date] Sender:" pattern properly if it's an alert)
    // We try to match our primary regex
    const match = line.match(regex);
    if (match) {
      if (currentMessage) {
        messages.push(currentMessage);
      }
      currentMessage = {
        date: match[1].trim(),
        sender: match[2].trim(),
        content: match[3].trim()
      };
    } else if (currentMessage) {
      // Continuation of previous message (multi-line)
      currentMessage.content += '\n' + line.trim();
    }
  }
  
  if (currentMessage) {
    messages.push(currentMessage);
  }
  
  return messages;
}
