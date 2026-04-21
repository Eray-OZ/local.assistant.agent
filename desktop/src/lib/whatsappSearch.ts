import db from './db';
import type { DateRange } from './dateExtractor';
import { normalizeSearchText, parseWhatsAppDate } from './whatsappDate';

interface StoredMessage {
  id: number;
  message_date: string;
  sender: string;
  content: string;
}

export interface MatchedMessage {
  id: number;
  messageDate: string;
  sender: string;
  content: string;
  parsedDate: Date | null;
  score: number;
}

interface MatchOptions {
  requirePrimaryTermHit?: boolean;
  preferFocusedPhrase?: boolean;
}

const STOP_WORDS = new Set([
  'acaba', 'ait', 'alakali', 'arama', 'aran', 'ara', 'bir', 'bu', 'bul', 'bana',
  'de', 'da', 'diye', 'gibi', 'goster', 'gosteren', 'gore', 'hakkinda', 'hangi',
  'gecen', 'herhangi', 'icinde', 'icerisinde', 'ile', 'icin', 'icinmi', 'ilgili', 'konu', 'konuda', 'mesaj', 'mesaji',
  'mesajı', 'mesajlar', 'mesajlari', 'mesajlari', 'mi', 'mu', 'mı', 'muğlak', 'ne',
  'olan', 'olur', 'saat', 'saatinde', 'sor', 'tarih', 'tarihli', 'tarihinden',
  've', 'veya', 'var', 'yaz', 'yazar', 'yazar misin', 'yazdir', 'yolla',
]);

const MONTH_TERMS = new Set([
  'ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran',
  'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik',
  'bugun', 'dun', 'gecen', 'hafta',
]);

const IGNORED_MESSAGE_PATTERNS = [
  /^you deleted this message$/i,
  /^this message was deleted$/i,
  /^mesaj silindi$/i,
  /^bu mesaj silindi$/i,
  /^null$/i,
];

const EDIT_MARKER_PATTERNS = [
  /\s*<this message was edited>\s*$/i,
  /\s*<mesaj duzenlendi>\s*$/i,
  /\s*<bu mesaj duzenlendi>\s*$/i,
];

function isIgnoredMessage(content: string): boolean {
  const normalized = normalizeSearchText(content);
  if (!normalized) return true;
  return IGNORED_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function cleanMessageContent(content: string): string {
  return EDIT_MARKER_PATTERNS.reduce(
    (value, pattern) => value.replace(pattern, '').trim(),
    content.trim()
  );
}

function extractTermsFromNormalizedText(normalized: string): string[] {
  return Array.from(new Set(
    normalized
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean)
      .filter((term) => term.length >= 2)
      .filter((term) => !/^\d+$/.test(term))
      .filter((term) => !STOP_WORDS.has(term))
      .filter((term) => !MONTH_TERMS.has(term))
  ));
}

function extractFocusedQuery(normalized: string): string | null {
  const patterns = [
    /\bicinde\s+(.+?)\s+gecen\b/,
    /\bicinde\s+(.+?)\s+olan\b/,
    /\b(.+?)\s+ile\s+alakali\b/,
    /\b(.+?)\s+ile\s+ilgili\b/,
    /\b(.+?)\s+hakkinda\b/,
    /\b(.+?)\s+konusunda\b/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;

    const candidateTerms = extractTermsFromNormalizedText(match[1]);
    if (candidateTerms.length === 0) continue;
    return candidateTerms.join(' ');
  }

  return null;
}

function stripTurkishSuffixes(term: string): string[] {
  const variants = new Set<string>([term]);
  const suffixes = [
    'lerden', 'lardan', 'lerdir', 'lardir', 'lerde', 'larda', 'lere', 'lara',
    'lerin', 'larin', 'lerden', 'lardan', 'lerle', 'larla', 'lerin', 'larin',
    'lerin', 'larin', 'leri', 'lari', 'lerin', 'larin', 'lerin', 'larin',
    'den', 'dan', 'ten', 'tan', 'nin', 'nin', 'nın', 'nin', 'nun', 'nun',
    'dir', 'dır', 'dur', 'dür', 'tir', 'tır', 'tur', 'tür', 'lik', 'lık',
    'luk', 'lük', 'li', 'lı', 'lu', 'lü', 'si', 'sı', 'su', 'sü',
    'yi', 'yı', 'yu', 'yü', 'i', 'ı', 'u', 'ü', 'e', 'a', 'n',
    'ler', 'lar', 'le', 'la',
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const value of Array.from(variants)) {
      for (const suffix of suffixes) {
        if (value.length - suffix.length < 4) continue;
        if (!value.endsWith(suffix)) continue;
        const stripped = value.slice(0, -suffix.length);
        if (!variants.has(stripped)) {
          variants.add(stripped);
          changed = true;
        }
      }
    }
  }

  return Array.from(variants).filter((value) => value.length >= 4);
}

function buildSearchVariants(term: string): string[] {
  const variants = new Set<string>();
  for (const variant of stripTurkishSuffixes(term)) {
    variants.add(variant);
    if (variant.endsWith('iy') && variant.length >= 5) {
      variants.add(`${variant}e`);
    }
  }
  return Array.from(variants);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    index = haystack.indexOf(needle, index);
    if (index === -1) return count;
    count += 1;
    index += needle.length;
  }
}

function tokenize(text: string): string[] {
  return normalizeSearchText(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function tokenMatchesVariant(token: string, variant: string): boolean {
  if (token === variant) return true;
  if (token.startsWith(`${variant}'`)) return true;
  if (token.startsWith(variant) && token.length - variant.length <= 6) return true;
  return false;
}

function countTokenMatches(tokens: string[], variants: string[]): number {
  let hits = 0;
  for (const token of tokens) {
    if (variants.some((variant) => tokenMatchesVariant(token, variant))) {
      hits += 1;
    }
  }
  return hits;
}

export function extractQueryTerms(query: string): string[] {
  const normalized = normalizeSearchText(query);
  const focusedQuery = extractFocusedQuery(normalized);
  return extractTermsFromNormalizedText(focusedQuery ?? normalized);
}

function isWithinRange(date: Date | null, range: DateRange | null): boolean {
  if (!range) return true;
  if (!date) return false;
  const ts = date.getTime();
  return ts >= Date.parse(range.start) && ts < Date.parse(range.end);
}

export function formatMatchedMessage(message: Pick<MatchedMessage, 'messageDate' | 'sender' | 'content'>): string {
  return `[${message.messageDate}] ${message.sender}: ${cleanMessageContent(message.content)}`;
}

export function findMatchingMessages(
  query: string,
  dateRange: DateRange | null,
  limit = 20,
  options: MatchOptions = {}
): MatchedMessage[] {
  const normalizedQuery = normalizeSearchText(query);
  const focusedQuery = extractFocusedQuery(normalizedQuery);
  const terms = extractTermsFromNormalizedText(focusedQuery ?? normalizedQuery);
  const termVariants = new Map(terms.map((term) => [term, buildSearchVariants(term)]));
  const primaryTerms = terms.length === 0
    ? []
    : terms.filter((term) => term.length === Math.max(...terms.map((value) => value.length)));
  const focusedVariants = focusedQuery
    ? extractTermsFromNormalizedText(focusedQuery).flatMap((term) => termVariants.get(term) ?? [term])
    : [];
  const rows = db
    .prepare('SELECT id, message_date, sender, content FROM whatsapp_messages ORDER BY id ASC')
    .all() as StoredMessage[];

  const matched = rows
    .map((row) => {
      const cleanedContent = cleanMessageContent(row.content);
      const normalizedContent = normalizeSearchText(`${row.sender} ${cleanedContent}`);
      const normalizedTokens = tokenize(`${row.sender} ${cleanedContent}`);
      const parsedDate = parseWhatsAppDate(row.message_date);
      const perTermHits = new Map<string, number>();
      const termHits = terms.reduce((score, term) => {
        const variants = termVariants.get(term) ?? [term];
        const tokenHits = countTokenMatches(normalizedTokens, variants);
        const substringHits = variants.reduce(
          (maxHit, variant) => Math.max(maxHit, countOccurrences(normalizedContent, variant)),
          0
        );
        const bestHit = tokenHits > 0 ? tokenHits : substringHits;
        perTermHits.set(term, bestHit);
        return score + bestHit;
      }, 0);
      const primaryTermHit = primaryTerms.some((term) => (perTermHits.get(term) ?? 0) > 0);
      const focusedPhraseHit = focusedVariants.length > 0 && focusedVariants.some((variant) =>
        countTokenMatches(normalizedTokens, [variant]) > 0
      );
      const dateBoost = dateRange && isWithinRange(parsedDate, dateRange) ? 1000 : 0;
      return {
        id: row.id,
        messageDate: row.message_date,
        sender: row.sender,
        content: cleanedContent,
        parsedDate,
        score: termHits + dateBoost,
        termHits,
        primaryTermHit,
        focusedPhraseHit,
      };
    })
    .filter((row) => !isIgnoredMessage(row.content))
    .filter((row) => isWithinRange(row.parsedDate, dateRange))
    .filter((row) => (terms.length === 0 ? true : row.termHits > 0))
    .filter((row) => (options.requirePrimaryTermHit ? row.primaryTermHit : true))
    .sort((a, b) => {
      if (options.preferFocusedPhrase && a.focusedPhraseHit !== b.focusedPhraseHit) {
        return Number(b.focusedPhraseHit) - Number(a.focusedPhraseHit);
      }
      if (b.score !== a.score) return b.score - a.score;
      if (a.content.length !== b.content.length) return a.content.length - b.content.length;
      if (a.parsedDate && b.parsedDate) return a.parsedDate.getTime() - b.parsedDate.getTime();
      return a.id - b.id;
    })
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      messageDate: row.messageDate,
      sender: row.sender,
      content: row.content,
      parsedDate: row.parsedDate,
      score: row.score,
    }));

  return matched;
}

export function isDirectMessageRequest(query: string): boolean {
  const normalized = normalizeSearchText(query);
  const asksForMessage = /\bmesaj(?:i|ı|lari|lari)?\b/.test(normalized);
  const asksToWrite = /\b(yaz|goster|gosterir|bul|paylas)\b/.test(normalized);
  return asksForMessage && asksToWrite;
}
