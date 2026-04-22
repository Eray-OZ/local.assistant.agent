import db, { ensureWhatsAppSearchIndex } from './db';
import type { DateRange } from './dateExtractor';
import { normalizeSearchText, parseWhatsAppDate } from './whatsappDate';

interface StoredMessage {
  id: number;
  message_date: string;
  sender: string;
  content: string;
}

interface FtsCandidate extends StoredMessage {
  lexical_rank: number;
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

interface RetrievalPreferences {
  minContentTokenCount: number;
  preferLongerContent: boolean;
}

interface SenderConstraint {
  aliases: string[];
  required: boolean;
}

const STOP_WORDS = new Set([
  'acaba', 'ait', 'alakali', 'arama', 'aran', 'ara', 'bahseden', 'bahsettigim',
  'bir', 'bu', 'bul', 'bana', 'de', 'da', 'dedigim', 'diye', 'gibi', 'goster',
  'gosteren', 'gore', 'hakkinda', 'hangi', 'gecen', 'herhangi', 'icinde',
  'icerisinde', 'ile', 'icin', 'icinmi', 'ilgili', 'konu', 'konuda', 'mesaj',
  'mesaji', 'mesajı', 'mesajlar', 'mesajlari', 'mi', 'mu', 'mı', 'ne', 'olan',
  'olur', 'renk', 'saat', 'saatinde', 'sadece', 'sor', 'tarih', 'tarihli',
  'tarihinden', 've', 'veya', 'var', 'yaz', 'yazar', 'yazdir', 'yolla',
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

function tokenize(text: string): string[] {
  return normalizeSearchText(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
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
    /\b(.+?)\s+anlattigim\b/,
    /\b(.+?)\s+bahsettigim\b/,
    /\b(.+?)\s+dedigim\b/,
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

function buildSearchVariants(term: string): string[] {
  const variants = new Set<string>([term]);
  const suffixes = [
    'lerden', 'lardan', 'lerde', 'larda', 'lere', 'lara',
    'lerin', 'larin', 'lerle', 'larla', 'leri', 'lari',
    'den', 'dan', 'ten', 'tan', 'nin', 'nın', 'nun', 'dir',
    'dır', 'dur', 'dür', 'tir', 'tır', 'tur', 'tür', 'lik',
    'lık', 'luk', 'lük', 'li', 'lı', 'lu', 'lü', 'si', 'sı',
    'su', 'sü', 'yi', 'yı', 'yu', 'yü', 'i', 'ı', 'u', 'ü',
    'e', 'a', 'n', 'ler', 'lar', 'le', 'la',
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

  for (const value of Array.from(variants)) {
    if (value.endsWith('iy') && value.length >= 5) {
      variants.add(`${value}e`);
    }
  }

  return Array.from(variants).filter((value) => value.length >= 4);
}

function countTermMatches(tokens: string[], variants: string[]): number {
  return tokens.reduce((count, token) => {
    if (variants.some((variant) => token === variant || token.startsWith(variant))) {
      return count + 1;
    }
    return count;
  }, 0);
}

function isWithinRange(date: Date | null, range: DateRange | null): boolean {
  if (!range) return true;
  if (!date) return false;
  const ts = date.getTime();
  return ts >= Date.parse(range.start) && ts < Date.parse(range.end);
}

function inferRetrievalPreferences(normalizedQuery: string): RetrievalPreferences {
  const prefersLongerContent =
    normalizedQuery.includes('olmasin') ||
    normalizedQuery.includes('tek kelime') ||
    normalizedQuery.includes('anlattigim') ||
    normalizedQuery.includes('bahsettigim');

  return {
    minContentTokenCount: prefersLongerContent ? 2 : 1,
    preferLongerContent: prefersLongerContent,
  };
}

function detectSenderConstraint(normalizedQuery: string): SenderConstraint | null {
  if (
    normalizedQuery.includes('sevgilim tarafindan') ||
    normalizedQuery.includes('sevgilim tarafindan atilmis') ||
    normalizedQuery.includes('sevgilim yazmis')
  ) {
    return { aliases: ['sevgilim'], required: true };
  }

  if (
    normalizedQuery.includes('benim tarafimdan') ||
    normalizedQuery.includes('benim yazdigim') ||
    normalizedQuery.includes('benim attigim') ||
    normalizedQuery.includes('eray tarafindan')
  ) {
    return { aliases: ['eray'], required: true };
  }

  return null;
}

function escapeFtsToken(token: string): string {
  return token.replace(/"/g, '""');
}

function buildFtsQuery(anchorTerms: string[], termVariants: Map<string, string[]>): string | null {
  if (anchorTerms.length === 0) return null;

  const clauses = anchorTerms.map((term) => {
    const variants = (termVariants.get(term) ?? [term]).map((variant) => `${escapeFtsToken(variant)}*`);
    if (variants.length === 1) return variants[0];
    return `(${variants.join(' OR ')})`;
  });

  return clauses.join(' AND ');
}

function fetchFtsCandidates(matchQuery: string, limit: number): FtsCandidate[] {
  ensureWhatsAppSearchIndex();

  const stmt = db.prepare(`
    SELECT
      m.id,
      m.message_date,
      m.sender,
      m.content,
      f.lexical_rank
    FROM (
      SELECT
        message_id,
        bm25(whatsapp_messages_fts, 1.0, 1.0) AS lexical_rank
      FROM whatsapp_messages_fts
      WHERE whatsapp_messages_fts MATCH ?
      ORDER BY lexical_rank
      LIMIT ?
    ) AS f
    JOIN whatsapp_messages AS m ON m.id = f.message_id
    ORDER BY f.lexical_rank, m.id DESC
  `);

  return stmt.all(matchQuery, limit) as FtsCandidate[];
}

function fetchFallbackCandidates(): StoredMessage[] {
  return db
    .prepare('SELECT id, message_date, sender, content FROM whatsapp_messages ORDER BY id ASC')
    .all() as StoredMessage[];
}

export function extractQueryTerms(query: string): string[] {
  const normalized = normalizeSearchText(query);
  const focusedQuery = extractFocusedQuery(normalized);
  return extractTermsFromNormalizedText(focusedQuery ?? normalized);
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
  const anchorTerms = focusedQuery ? extractTermsFromNormalizedText(focusedQuery) : primaryTerms;
  const preferences = inferRetrievalPreferences(normalizedQuery);
  const senderConstraint = detectSenderConstraint(normalizedQuery);

  const ftsQuery = buildFtsQuery(anchorTerms.length > 0 ? anchorTerms : terms, termVariants);
  const candidateRows = ftsQuery
    ? fetchFtsCandidates(ftsQuery, Math.max(limit * 12, 100))
    : fetchFallbackCandidates();

  const ranked = candidateRows
    .map((row) => {
      const cleanedContent = cleanMessageContent(row.content);
      const contentTokens = tokenize(cleanedContent);
      const allTokens = tokenize(`${row.sender} ${cleanedContent}`);
      const normalizedSender = normalizeSearchText(row.sender);
      const parsedDate = parseWhatsAppDate(row.message_date);
      const perTermHits = new Map<string, number>();

      const termHits = terms.reduce((score, term) => {
        const variants = termVariants.get(term) ?? [term];
        const hits = countTermMatches(allTokens, variants);
        perTermHits.set(term, hits);
        return score + hits;
      }, 0);

      const primaryTermHit = primaryTerms.some((term) => (perTermHits.get(term) ?? 0) > 0);
      const focusedPhraseHit = anchorTerms.some((term) => (perTermHits.get(term) ?? 0) > 0);
      const lexicalRank =
        'lexical_rank' in row && typeof row.lexical_rank === 'number'
          ? row.lexical_rank
          : Number.POSITIVE_INFINITY;
      const dateBoost = dateRange && isWithinRange(parsedDate, dateRange) ? 1000 : 0;
      const senderHit = senderConstraint
        ? senderConstraint.aliases.some((alias) => normalizedSender.includes(alias))
        : true;

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
        senderHit,
        lexicalRank,
        contentTokenCount: contentTokens.length,
      };
    })
    .filter((row) => !isIgnoredMessage(row.content))
    .filter((row) => isWithinRange(row.parsedDate, dateRange))
    .filter((row) => (senderConstraint?.required ? row.senderHit : true))
    .filter((row) => (terms.length === 0 ? true : row.termHits > 0))
    .filter((row) => (options.requirePrimaryTermHit && primaryTerms.length > 0 ? row.primaryTermHit : true));

  const constraintSatisfied = ranked.some((row) => row.contentTokenCount >= preferences.minContentTokenCount);
  const constrained = constraintSatisfied
    ? ranked.filter((row) => row.contentTokenCount >= preferences.minContentTokenCount)
    : ranked;

  return constrained
    .sort((a, b) => {
      if (options.preferFocusedPhrase && a.focusedPhraseHit !== b.focusedPhraseHit) {
        return Number(b.focusedPhraseHit) - Number(a.focusedPhraseHit);
      }
      if (b.score !== a.score) return b.score - a.score;
      if (a.lexicalRank !== b.lexicalRank) return a.lexicalRank - b.lexicalRank;
      if (preferences.preferLongerContent && a.contentTokenCount !== b.contentTokenCount) {
        return b.contentTokenCount - a.contentTokenCount;
      }
      if (!preferences.preferLongerContent && a.content.length !== b.content.length) {
        return a.content.length - b.content.length;
      }
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
}

export function isDirectMessageRequest(query: string): boolean {
  const normalized = normalizeSearchText(query);
  const asksForMessage = /\bmesaj(?:i|ı|lari|lari)?\b/.test(normalized);
  const asksToWrite = /\b(yaz|goster|gosterir|bul|paylas)\b/.test(normalized);
  return asksForMessage && asksToWrite;
}
