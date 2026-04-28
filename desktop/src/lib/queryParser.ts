import { generateOllamaCompletion } from './llm';
import type { DateRange } from './dateExtractor';
import { extractDateRange } from './dateExtractor';

export interface QueryIntent {
  searchTerms: string[];
  dateRange: DateRange | null;
  sender: string | null;
  isDirectMessageRequest: boolean;
  isAnotherRequest: boolean;
}

interface RawIntent {
  searchTerms?: string[];
  dateRange?: { start?: string; end?: string; ignoreYear?: boolean } | null;
  sender?: string | null;
  isDirectMessageRequest?: boolean;
  isAnotherRequest?: boolean;
}

const INTENT_PROMPT_TEMPLATE = `Sen bir WhatsApp arama asistanısın. Kullanıcının verdiği Türkçe sorgudan arama parametrelerini çıkar.
Bugünün tarihi: {{CURRENT_DATE}}

Kurallar:
1. searchTerms: Mesaj içeriğinde geçmesi gereken kelimeler. "mesaj", "göster", "bul", ay isimleri, zamirler (ben, sen, o) OLMAYACAK.
2. dateRange: Eğer tarih varsa { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "ignoreYear": true/false }. Eğer kullanıcı yıl belirtmemişse (sadece "2 ocak" gibi), "ignoreYear": true yap. "end" tarihi aralığın sonu (exclusive) olmalı; yani tek bir gün için end tarihi ertesi gün olmalı. Yoksa null.
3. sender: Kim göndermiş? "ben", "sevgilim", "Ayşe" vb. ismi tespit et. Yoksa null.
4. isDirectMessageRequest: Kullanıcı tek bir mesajın tam metnini mi istiyor (true), yoksa genel analiz mi (false)?
5. isAnotherRequest: Kullanıcı "başka bir mesaj", "farklı bir tane", "bir sonrakini göster" gibi bir talepte mi bulunuyor (true/false)?

JSON formatında yanıt ver, başka hiçbir şey yazma.

Örnekler:
Sorgu: "Ocak ayında pizza hakkında ne konuştuk?"
{ "searchTerms": ["pizza"], "dateRange": { "start": "2026-01-01", "end": "2026-02-01", "ignoreYear": false }, "sender": null, "isDirectMessageRequest": false, "isAnotherRequest": false }

Sorgu: "Başka bir tane daha göster"
{ "searchTerms": [], "dateRange": null, "sender": null, "isDirectMessageRequest": true, "isAnotherRequest": true }

Sorgu: "2 Ocak'ta ne oldu?"
{ "searchTerms": [], "dateRange": { "start": "2026-01-02", "end": "2026-01-03", "ignoreYear": true }, "sender": null, "isDirectMessageRequest": false, "isAnotherRequest": false }

Şimdi bu sorguyu parse et:
Sorgu: "{{QUERY}}"`;

function isValidDateRange(range: unknown): range is { start: string; end: string; ignoreYear?: boolean } {
  if (!range || typeof range !== 'object') return false;
  const r = range as Record<string, unknown>;
  if (typeof r.start !== 'string' || typeof r.end !== 'string') return false;
  
  // Ensure it's a valid ISO-like date string and not a placeholder like 'YYYY'
  const isoRegex = /^\d{4}-\d{2}-\d{2}/;
  return isoRegex.test(r.start) && isoRegex.test(r.end);
}

function cleanSearchTerms(terms: string[]): string[] {
  // Purely dynamic cleaning: remove only very short tokens and common Turkish numbers
  return terms
    .map(t => t.toLowerCase().trim())
    .filter(t => t.length >= 2)
    .filter(t => !/^\d+$/.test(t));
}

async function parseWithLLM(query: string, model: string): Promise<QueryIntent | null> {
  const currentDate = new Date().toISOString().split('T')[0];
  const prompt = INTENT_PROMPT_TEMPLATE
    .replace('{{QUERY}}', query)
    .replace('{{CURRENT_DATE}}', currentDate);
  
  try {
    const response = await generateOllamaCompletion(prompt, model, "You are a query parsing assistant. Return only valid JSON.");
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]) as RawIntent;
    
    return {
      searchTerms: cleanSearchTerms(parsed.searchTerms || []),
      dateRange: isValidDateRange(parsed.dateRange) 
        ? { start: parsed.dateRange.start, end: parsed.dateRange.end, ignoreYear: parsed.dateRange.ignoreYear }
        : null,
      sender: parsed.sender || null,
      isDirectMessageRequest: parsed.isDirectMessageRequest || false,
      isAnotherRequest: parsed.isAnotherRequest || false,
    };
  } catch (error) {
    console.error('LLM parsing failed:', error);
    return null;
  }
}

function parseFallback(query: string): QueryIntent {
  // Minimal logic-free fallback: just keywords and tokens longer than 3 chars
  const dateRange = extractDateRange(query);
  const normalized = query.toLowerCase();
  
  const tokens = normalized
    .replace(/[^\w\sçğıöşü]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 4);
    
  return {
    searchTerms: [...new Set(tokens)],
    dateRange,
    sender: null, // No hardcoded guessing in fallback
    isDirectMessageRequest: /\bmesaj\b/.test(normalized),
    isAnotherRequest: /\b(?:baska|farkli|sonraki)\b/.test(normalized),
  };
}

export async function parseQueryIntent(query: string, model = 'gemma4'): Promise<QueryIntent> {
  const llmResult = await parseWithLLM(query, model);
  
  if (llmResult) {
    if (!llmResult.dateRange) {
      llmResult.dateRange = extractDateRange(query);
    }
    return llmResult;
  }
  
  return parseFallback(query);
}
