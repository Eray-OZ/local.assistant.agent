import { generateOllamaCompletion } from './llm';
import type { DateRange } from './dateExtractor';
import { extractDateRange } from './dateExtractor';

export interface QueryIntent {
  searchTerms: string[];
  dateRange: DateRange | null;
  sender: string | null;
  isDirectMessageRequest: boolean;
}

interface RawIntent {
  searchTerms?: string[];
  dateRange?: { start?: string; end?: string } | null;
  sender?: string | null;
  isDirectMessageRequest?: boolean;
}

const INTENT_PROMPT_TEMPLATE = `Sen bir WhatsApp arama asistanısın. Kullanıcının verdiği Türkçe sorgudan arama parametrelerini çıkar.

Kurallar:
1. searchTerms: Mesaj içeriğinde geçmesi gereken kelimeler. "mesaj", "göster", "bul", ay isimleri (ocak, şubat vb.), zamirler (ben, sen, o) OLMAYACAK. Sadece arama içeriği olan kelimeler.
2. dateRange: Eğer tarih varsa { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, yoksa null. Tarihler ISO 8601 formatında, saat 00:00:00.
3. sender: Kim göndermiş? "ben", "sevgilim", "ahmet" vb. gibi isimleri tespit et. "ben" diyorsa kullanıcı kendini kastediyor. Yoksa null.
4. isDirectMessageRequest: Kullanıcı tek bir mesajın tam metnini mi istiyor (true: "mesajı göster", "ne yazdı"), yoksa genel konu analizi mi (false: "ne konuştuk", "hakkında ne dedik")?

Örnekler:
Sorgu: "Ocak ayında pizza hakkında ne konuştuk?"
{ "searchTerms": ["pizza"], "dateRange": { "start": "2026-01-01", "end": "2026-02-01" }, "sender": null, "isDirectMessageRequest": false }

Sorgu: "Sevgilimin bana attığı son mesaj neydi?"
{ "searchTerms": [], "dateRange": null, "sender": "sevgilim", "isDirectMessageRequest": true }

Sorgu: "En sevdiğim renk ne?"
{ "searchTerms": ["renk", "sevdiğim"], "dateRange": null, "sender": "ben", "isDirectMessageRequest": false }

Sorgu: "Geçen hafta eray ile yemek planı yaptığımız mesajlar"
{ "searchTerms": ["yemek", "plan"], "dateRange": { "start": "2026-04-15", "end": "2026-04-22" }, "sender": "eray", "isDirectMessageRequest": false }

Şimdi bu sorguyu parse et:
Sorgu: "{{QUERY}}"

JSON yanıt (başka hiçbir şey yazma):`;

function isValidDateRange(range: unknown): range is { start: string; end: string } {
  if (!range || typeof range !== 'object') return false;
  const r = range as Record<string, unknown>;
  return typeof r.start === 'string' && typeof r.end === 'string';
}

function cleanSearchTerms(terms: string[]): string[] {
  // Remove stop words and normalize
  const STOP_WORDS = new Set([
    'mesaj', 'goster', 'bul', 'ara', 'nedir', 'ne', 'hangi',
    'ben', 'sen', 'o', 'biz', 'siz', 'onlar',
    'bu', 'su', 'o', 'bunu', 'sunu', 'onu',
    'icin', 'ile', 've', 'veya', 'de', 'da',
    'mi', 'mu', 'mı', 'mü',
    'acaba', 'belki', 'herhalde',
  ]);
  
  const MONTHS = new Set([
    'ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran',
    'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik',
    'gun', 'hafta', 'ay', 'yil', 'dun', 'bugun', 'yarin'
  ]);
  
  return terms
    .map(t => t.toLowerCase().trim())
    .filter(t => t.length >= 2)
    .filter(t => !STOP_WORDS.has(t))
    .filter(t => !MONTHS.has(t))
    .filter(t => !/^\d+$/.test(t));
}

async function parseWithLLM(query: string, model: string): Promise<QueryIntent | null> {
  const prompt = INTENT_PROMPT_TEMPLATE.replace('{{QUERY}}', query);
  
  try {
    const response = await generateOllamaCompletion(prompt, model, "You are a query parsing assistant. Return only valid JSON.");
    
    // Extract JSON from response (LLM might wrap it in markdown or add extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('LLM did not return valid JSON:', response);
      return null;
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as RawIntent;
    
    const intent: QueryIntent = {
      searchTerms: cleanSearchTerms(parsed.searchTerms || []),
      dateRange: isValidDateRange(parsed.dateRange) 
        ? { start: parsed.dateRange.start, end: parsed.dateRange.end }
        : null,
      sender: parsed.sender || null,
      isDirectMessageRequest: parsed.isDirectMessageRequest || false,
    };
    
    return intent;
  } catch (error) {
    console.error('LLM parsing failed:', error);
    return null;
  }
}

function parseFallback(query: string): QueryIntent {
  // Simple fallback when LLM fails
  const dateRange = extractDateRange(query);
  
  // Basic tokenization - just split and filter obvious junk
  const tokens = query
    .toLowerCase()
    .replace(/[^\w\sçğıöşü]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3);
  
  const STOP_WORDS = new Set([
    'mesaj', 'goster', 'bul', 'ara', 'nedir', 'ne', 'hangi',
    'icin', 'ile', 've', 'veya', 'de', 'da', 'ki',
    'acaba', 'belki', 'herhalde', 'tam', 'sadece',
    'hakkinda', 'konusunda', 'ilgili', 'alakali',
    'dedigim', 'yazdigim', 'attigim', 'gonderdigim',
  ]);
  
  const searchTerms = tokens.filter(t => !STOP_WORDS.has(t));
  
  // Detect sender hints
  let sender: string | null = null;
  const normalized = query.toLowerCase();
  if (normalized.includes('sevgilim') || normalized.includes('sevgili')) {
    sender = 'sevgilim';
  } else if (normalized.includes('benim') || normalized.includes('ben ')) {
    sender = 'ben';
  }
  
  // Detect direct message request
  const isDirectMessageRequest = 
    /\bmesaj[ıi]?(?:[ıi]n)?\b/.test(normalized) && 
    /\b(?:goster|bul|yaz|at|gonder)\b/.test(normalized);
  
  return {
    searchTerms: [...new Set(searchTerms)],
    dateRange,
    sender,
    isDirectMessageRequest,
  };
}

export async function parseQueryIntent(query: string, model = 'gemma4'): Promise<QueryIntent> {
  // Try LLM first
  const llmResult = await parseWithLLM(query, model);
  
  if (llmResult) {
    // If LLM didn't find a date range, try our reliable regex fallback
    if (!llmResult.dateRange) {
      llmResult.dateRange = extractDateRange(query);
    }
    return llmResult;
  }
  
  // Full fallback
  console.warn('LLM parsing failed, using fallback');
  return parseFallback(query);
}
