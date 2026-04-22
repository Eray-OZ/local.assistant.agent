import db from './db';
import { normalizeSearchText } from './whatsappDate';

interface StoredMessageRow {
  id: number;
  message_date: string;
  sender: string;
  content: string;
}

interface PreferenceIntent {
  attribute: 'favorite_color';
  targetAlias: string | null;
}

interface PreferenceAnswer {
  answer: string;
  evidence: Array<{
    messageDate: string;
    sender: string;
    content: string;
  }>;
}

const COLOR_TERMS = [
  'mavi',
  'mor',
  'pembe',
  'siyah',
  'beyaz',
  'gri',
  'kirmizi',
  'yesil',
  'sari',
  'turuncu',
  'lacivert',
  'bordo',
  'bej',
  'kahverengi',
];

function extractColor(content: string): string | null {
  const normalized = normalizeSearchText(content);
  for (const color of COLOR_TERMS) {
    if (normalized.split(/\s+/).includes(color)) {
      return color;
    }
  }
  return null;
}

function titleCaseColor(color: string): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

function getTargetAlias(normalizedQuery: string): string | null {
  if (normalizedQuery.includes('sevgilim')) return 'sevgilim';
  if (normalizedQuery.includes('askim')) return 'askim';
  return null;
}

export function detectPreferenceIntent(query: string): PreferenceIntent | null {
  const normalized = normalizeSearchText(query);
  const asksFavorite = normalized.includes('en sevdigi') || normalized.includes('en sevdigim');
  const asksColor = normalized.includes('renk');

  if (asksFavorite && asksColor) {
    return {
      attribute: 'favorite_color',
      targetAlias: getTargetAlias(normalized),
    };
  }

  return null;
}

function getPromptCandidates(): StoredMessageRow[] {
  const rows = db.prepare(
    `SELECT id, message_date, sender, content
     FROM whatsapp_messages
     WHERE lower(content) LIKE '%en sevdigim renk%'
        OR lower(content) LIKE '%en sevdiğim renk%'
     ORDER BY id ASC`
  ).all() as StoredMessageRow[];

  return rows;
}

function getFollowingMessages(id: number, count = 4): StoredMessageRow[] {
  return db.prepare(
    `SELECT id, message_date, sender, content
     FROM whatsapp_messages
     WHERE id > ? AND id <= ?
     ORDER BY id ASC`
  ).all(id, id + count) as StoredMessageRow[];
}

export function answerFavoriteColor(targetAlias: string | null): PreferenceAnswer | null {
  const prompts = getPromptCandidates();

  for (const prompt of prompts) {
    const normalizedSender = normalizeSearchText(prompt.sender);
    if (targetAlias && !normalizedSender.includes(targetAlias)) {
      continue;
    }

    const following = getFollowingMessages(prompt.id, 5);
    const answerRow = following.find((row) => {
      if (row.sender === prompt.sender) return false;
      return extractColor(row.content) !== null;
    });

    if (!answerRow) continue;

    const color = extractColor(answerRow.content);
    if (!color) continue;

    return {
      answer: titleCaseColor(color),
      evidence: [
        {
          messageDate: prompt.message_date,
          sender: prompt.sender,
          content: prompt.content,
        },
        {
          messageDate: answerRow.message_date,
          sender: answerRow.sender,
          content: answerRow.content,
        },
      ],
    };
  }

  return null;
}
