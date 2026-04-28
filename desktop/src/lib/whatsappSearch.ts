import db, { ensureWhatsAppSearchIndex } from './db';
import type { DateRange } from './dateExtractor';
import { parseWhatsAppDate } from './whatsappDate';
import type { QueryIntent } from './queryParser';

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
  isForwarded: boolean;
}

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
  const normalized = content.toLowerCase().trim();
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
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function isWithinRange(date: Date | null, range: (DateRange & { ignoreYear?: boolean }) | null): boolean {
  if (!range) return true;
  if (!date) return false;
  
  if (range.ignoreYear) {
    const startObj = new Date(range.start);
    const dateMonth = date.getMonth();
    const dateDay = date.getDate();
    const startMonth = startObj.getMonth();
    const startDay = startObj.getDate();
    return dateMonth === startMonth && dateDay === startDay;
  }

  const ts = date.getTime();
  return ts >= Date.parse(range.start) && ts < Date.parse(range.end);
}

function escapeFtsToken(token: string): string {
  return token.replace(/"/g, '""');
}

function buildFtsQuery(searchTerms: string[]): string | null {
  if (searchTerms.length === 0) return null;

  // Build query with prefix wildcards for Turkish suffix handling
  // "pizza" -> "pizza*" (matches "pizza", "pizzayı", "pizzadan")
  const clauses = searchTerms.map((term) => {
    const safe = escapeFtsToken(term);
    return `${safe}*`;
  });

  return clauses.join(' AND ');
}

function fetchFtsCandidates(matchQuery: string, limit: number, offset = 0): FtsCandidate[] {
  ensureWhatsAppSearchIndex();

  const stmt = db.prepare(`
    SELECT
      m.id,
      m.message_date,
      m.sender,
      m.content,
      f.lexical_rank,
      m.is_forwarded
    FROM (
      SELECT
        message_id,
        bm25(whatsapp_messages_fts, 1.0, 1.0) AS lexical_rank
      FROM whatsapp_messages_fts
      WHERE whatsapp_messages_fts MATCH ?
      ORDER BY lexical_rank
      LIMIT ? OFFSET ?
    ) AS f
    JOIN whatsapp_messages AS m ON m.id = f.message_id
    ORDER BY f.lexical_rank, m.id DESC
  `);

  return stmt.all(matchQuery, limit, offset) as (FtsCandidate & { is_forwarded: number })[];
}

function fetchFallbackCandidates(): StoredMessage[] {
  return db
    .prepare('SELECT id, message_date, sender, content, is_forwarded FROM whatsapp_messages ORDER BY id ASC')
    .all() as (StoredMessage & { is_forwarded: number })[];
}

export function formatMatchedMessage(message: Pick<MatchedMessage, 'messageDate' | 'sender' | 'content' | 'isForwarded'>): string {
  const sender = message.sender?.trim() || 'Bilinmeyen';
  const forwardTag = message.isForwarded ? '[İLETİLDİ] ' : '';
  return `[${message.messageDate}] ${sender}: ${forwardTag}${cleanMessageContent(message.content)}`;
}

export async function findMatchingMessages(
  intent: QueryIntent,
  limit = 20,
  offset = 0
): Promise<MatchedMessage[]> {
  const { searchTerms, dateRange, sender } = intent;

  // Build FTS query from search terms
  const ftsQuery = buildFtsQuery(searchTerms);
  const candidateRows = ftsQuery
    ? fetchFtsCandidates(ftsQuery, Math.max(limit * 5, 50), offset)
    : fetchFallbackCandidates();

  const ranked = candidateRows
    .map((row) => {
      const cleanedContent = cleanMessageContent(row.content);
      const contentTokens = tokenize(cleanedContent);
      const parsedDate = parseWhatsAppDate(row.message_date);

      // Calculate term match score
      let termHits = 0;
      if (searchTerms.length > 0) {
        const allText = `${row.sender} ${cleanedContent}`.toLowerCase();
        termHits = searchTerms.reduce((score, term) => {
          // Match whole word or word with suffix (prefix match)
          const regex = new RegExp(`\\b${term}[\\w]*`, 'g');
          const matches = allText.match(regex);
          return score + (matches ? matches.length : 0);
        }, 0);
      }

      // Sender matching
      let senderHit = true;
      if (sender) {
        const normalizedSender = row.sender.toLowerCase().replace(/[^\wçğıöşü]/g, ' ').trim();
        const searchSender = sender.toLowerCase().replace(/[^\wçğıöşü]/g, ' ').trim();

        // If LLM identifies 'me/user' or 'partner', we match by checking substrings
        // No longer limiting to specific names like 'eray'
        const senderWords = searchSender.split(/\s+/);
        senderHit = senderWords.some(word => normalizedSender.includes(word));
      }

      // Date boost
      const dateBoost = dateRange && isWithinRange(parsedDate, dateRange) ? 1000 : 0;

      const lexicalRank =
        'lexical_rank' in row && typeof row.lexical_rank === 'number'
          ? row.lexical_rank
          : Number.POSITIVE_INFINITY;

      return {
        id: row.id,
        messageDate: row.message_date,
        sender: row.sender,
        content: cleanedContent,
        parsedDate,
        score: termHits + dateBoost,
        isForwarded: Boolean((row as any).is_forwarded),
        termHits,
        senderHit,
        lexicalRank,
        contentTokenCount: contentTokens.length,
      };
    })
    .filter((row) => !isIgnoredMessage(row.content))
    .filter((row) => isWithinRange(row.parsedDate, dateRange))
    .filter((row) => (sender ? row.senderHit : true))
    .filter((row) => (searchTerms.length === 0 ? true : row.termHits > 0));

  return ranked
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.lexicalRank !== b.lexicalRank) return a.lexicalRank - b.lexicalRank;
      if (a.contentTokenCount !== b.contentTokenCount) {
        return b.contentTokenCount - a.contentTokenCount;
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

export function isDirectMessageRequest(intent: QueryIntent): boolean {
  return intent.isDirectMessageRequest;
}
