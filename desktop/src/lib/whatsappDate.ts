const TURKISH_ASCII_MAP: Record<string, string> = {
  c: 'c',
  C: 'c',
  g: 'g',
  G: 'g',
  i: 'i',
  I: 'i',
  o: 'o',
  O: 'o',
  s: 's',
  S: 's',
  u: 'u',
  U: 'u',
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
};

export function normalizeSearchText(text: string): string {
  return text
    .trim()
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (char) => TURKISH_ASCII_MAP[char] ?? char)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s:/.-]+/gu, ' ')
    .replace(/\s+/g, ' ');
}

function parseSlashDate(
  first: string,
  second: string,
  year: string,
  hour = '0',
  minute = '0',
  secondValue = '0',
  ampm?: string
): Date | null {
  const a = Number(first);
  const b = Number(second);
  const y = Number(year);

  let month: number;
  let day: number;

  if (ampm) {
    month = a;
    day = b;
  } else if (a > 12 && b <= 12) {
    day = a;
    month = b;
  } else if (b > 12 && a <= 12) {
    month = a;
    day = b;
  } else {
    day = a;
    month = b;
  }

  let parsedHour = Number(hour);
  if (ampm) {
    const upper = ampm.toUpperCase();
    if (upper === 'PM' && parsedHour !== 12) parsedHour += 12;
    if (upper === 'AM' && parsedHour === 12) parsedHour = 0;
  }

  const date = new Date(y, month - 1, day, parsedHour, Number(minute), Number(secondValue));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseWhatsAppDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim().length === 0) {
    return null;
  }

  const trimmed = dateStr.trim();

  const isoMatch = trimmed.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[\sT,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (isoMatch) {
    const [, y, m, d, h = '0', min = '0', s = '0'] = isoMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const euroDotMatch = trimmed.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (euroDotMatch) {
    const [, d, m, y, h = '0', min = '0', s = '0'] = euroDotMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const slashMatch = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i
  );
  if (slashMatch) {
    const [, first, second, rawYear, hour = '0', minute = '0', secondValue = '0', ampm] = slashMatch;
    let year = rawYear;
    if (year.length === 2) {
      year = `20${year}`;
    }
    const date = parseSlashDate(first, second, year, hour, minute, secondValue, ampm);
    if (date) return date;
  }

  const ts = Date.parse(trimmed.replace(',', ''));
  if (!Number.isNaN(ts)) {
    return new Date(ts);
  }

  return null;
}
