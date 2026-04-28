import { normalizeSearchText } from './whatsappDate';

const MONTHS: Record<string, number> = {
  ocak: 1,
  subat: 2,
  mart: 3,
  nisan: 4,
  mayis: 5,
  haziran: 6,
  temmuz: 7,
  agustos: 8,
  eylul: 9,
  ekim: 10,
  kasim: 11,
  aralik: 12,
};

export interface DateRange {
  start: string;
  end: string;
  ignoreYear?: boolean;
}

function createDayRange(year: number, month: number, day: number): DateRange | null {
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

// When year is not specified, search across multiple years (last 2 years)
function createDayRangeMultiYear(month: number, day: number): DateRange | null {
  const currentYear = new Date().getFullYear();
  const start = new Date(currentYear, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(currentYear, month - 1, day + 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString(), ignoreYear: true };
}

function createMonthRange(year: number, month: number): DateRange | null {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function extractDateRange(query: string): DateRange | null {
  const normalized = normalizeSearchText(query);
  const currentYear = new Date().getFullYear();

  const isoMatch = normalized.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (isoMatch) {
    return createDayRange(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const numericMatch = normalized.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/);
  if (numericMatch) {
    return createDayRange(Number(numericMatch[3]), Number(numericMatch[2]), Number(numericMatch[1]));
  }

  const dayMonthYearMatch = normalized.match(
    /\b(\d{1,2})\s+(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)(?:\s+(\d{4}))?\b/
  );
  if (dayMonthYearMatch) {
    const [, day, monthName, year] = dayMonthYearMatch;
    if (year) {
      return createDayRange(Number(year), MONTHS[monthName], Number(day));
    }
    // Year not specified - search across multiple years
    return createDayRangeMultiYear(MONTHS[monthName], Number(day));
  }

  // Ay + Gün (e.g., "Nisan 19") - yıl yoksa multiple years
  const monthDayMatch = normalized.match(
    /\b(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\s+(\d{1,2})\b/
  );
  if (monthDayMatch) {
    const [, monthName, day] = monthDayMatch;
    return createDayRangeMultiYear(MONTHS[monthName], Number(day));
  }

  const monthYearMatch = normalized.match(
    /\b(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)(?:\s+(\d{4}))?\b/
  );
  if (monthYearMatch) {
    const [, monthName, year] = monthYearMatch;
    return createMonthRange(Number(year ?? currentYear), MONTHS[monthName]);
  }

  if (normalized.includes('gecen hafta')) {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (normalized.includes('dun')) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (normalized.includes('bugun')) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  return null;
}
