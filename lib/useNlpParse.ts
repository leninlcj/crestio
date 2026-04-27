// Natural-language parser for the inline composer.
//
// Input:  "Diego — math — 4pm Tuesday — 1h"
//         "Ali tomorrow 3pm 30min algebra"
//         "log diego today 4pm"
// Output: { studentMatch?, subject?, when?, durationMinutes? }
//
// The parser is intentionally fuzzy: it returns whatever it can identify,
// leaving gaps for the user to fill. The composer renders chips for each
// extracted field and calls back into the parser when the user types.

export type ParsedSlots = {
  studentName: string | null;
  subject: string | null;
  when: Date | null;
  durationMinutes: number | null;
  remainder: string;
};

const SUBJECT_HINTS = [
  'math', 'maths', 'mathematics', 'algebra', 'geometry', 'calculus',
  'english', 'literature', 'reading', 'writing',
  'science', 'physics', 'chemistry', 'biology',
  'history', 'geography', 'economics', 'business',
  'french', 'spanish', 'mandarin', 'german', 'japanese',
  'piano', 'violin', 'guitar',
  'coding', 'programming', 'computer',
  'hsc', 'sat', 'ielts', 'toefl', 'gre',
];

// Words that should never become the student name even if they're at the
// start. "log diego" → student is "diego" not "log".
const VERBS = new Set([
  'log', 'add', 'create', 'new', 'schedule', 'book', 'plan',
]);

export function parseSession(input: string, knownStudents?: string[]): ParsedSlots {
  let text = input.trim();
  let studentName: string | null = null;
  let subject: string | null = null;
  let when: Date | null = null;
  let durationMinutes: number | null = null;

  // 1. Duration — match "1h", "30m", "30 min", "45min", "1.5h", "90 minutes"
  const durMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minutes)\b/i);
  if (durMatch) {
    const n = parseFloat(durMatch[1]);
    const unit = durMatch[2].toLowerCase();
    durationMinutes = unit.startsWith('h') ? Math.round(n * 60) : Math.round(n);
    text = text.replace(durMatch[0], '').trim();
  }

  // 2. Time + day — combine "4pm tuesday", "tomorrow 3pm", "today 5pm"
  when = parseWhen(text);
  if (when) {
    text = stripWhen(text);
  }

  // 3. Subject — pick a known subject hint
  const subjMatch = text.match(new RegExp(`\\b(${SUBJECT_HINTS.join('|')})\\b`, 'i'));
  if (subjMatch) {
    subject = subjMatch[1].toLowerCase();
    if (subject === 'maths' || subject === 'mathematics') subject = 'math';
    text = text.replace(subjMatch[0], '').trim();
  }

  // 4. Strip dashes/commas left behind, then take the first remaining
  //    word(s) as the student name. Prefer matching against known students.
  text = text.replace(/[—–-]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  // Drop verbs from the start.
  const tokens = text.split(/\s+/).filter(Boolean);
  while (tokens.length > 0 && VERBS.has(tokens[0].toLowerCase())) tokens.shift();
  text = tokens.join(' ').trim();

  if (knownStudents && knownStudents.length > 0) {
    const lower = text.toLowerCase();
    // Prefer the longest matching known-student name.
    let best: string | null = null;
    for (const s of knownStudents) {
      const sLower = s.toLowerCase();
      if (lower.includes(sLower) && (!best || sLower.length > best.length)) best = s;
    }
    if (best) {
      studentName = best;
      text = text.replace(new RegExp(best, 'i'), '').trim();
    }
  }

  if (!studentName && text.length > 0) {
    // Take up to the first 3 capitalized-ish tokens.
    const candidate = text.split(/\s+/).slice(0, 3).join(' ').trim();
    if (candidate.length > 0 && !/^\d+$/.test(candidate)) {
      studentName = candidate;
      text = text.replace(candidate, '').trim();
    }
  }

  return {
    studentName,
    subject,
    when,
    durationMinutes,
    remainder: text.replace(/\s{2,}/g, ' ').trim(),
  };
}

// ----------------------------------------------------------------------
// Time parsing — handles a useful slice of natural language. Not a full
// chrono.js replacement, but covers what tutors actually type.
// ----------------------------------------------------------------------

function parseWhen(text: string): Date | null {
  const lower = text.toLowerCase();
  const now = new Date();
  let day = new Date(now);
  let dayMatched = false;

  // "today" / "tonight"
  if (/\btoday\b|\btonight\b/.test(lower)) dayMatched = true;
  // "tomorrow" / "tmrw"
  else if (/\btomorrow\b|\btmrw\b/.test(lower)) {
    day.setDate(day.getDate() + 1);
    dayMatched = true;
  }
  // weekday name — "monday", "tuesday", ..., "next monday"
  else {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < dayNames.length; i++) {
      const re = new RegExp(`\\b(?:next\\s+)?${dayNames[i]}\\b`, 'i');
      if (re.test(lower)) {
        const target = i;
        const cur = day.getDay();
        let diff = (target - cur + 7) % 7;
        if (diff === 0) diff = 7; // "tuesday" said on tuesday → next tuesday
        if (/\bnext\s+/i.test(lower)) diff = diff === 0 ? 7 : diff < 7 ? diff + 0 : diff;
        day.setDate(day.getDate() + diff);
        dayMatched = true;
        break;
      }
    }
  }

  // Time of day — "4pm", "16:30", "9:00am"
  let hour: number | null = null;
  let minute = 0;
  const ampmMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  const isoMatch = lower.match(/\b(\d{1,2}):(\d{2})\b/);
  if (ampmMatch) {
    hour = parseInt(ampmMatch[1], 10);
    if (ampmMatch[2]) minute = parseInt(ampmMatch[2], 10);
    if (ampmMatch[3] === 'pm' && hour < 12) hour += 12;
    if (ampmMatch[3] === 'am' && hour === 12) hour = 0;
  } else if (isoMatch) {
    hour = parseInt(isoMatch[1], 10);
    minute = parseInt(isoMatch[2], 10);
  }

  if (hour == null && !dayMatched) return null;
  if (hour == null) {
    // Day-only — default to a reasonable time (4pm, common tutor slot).
    hour = 16;
    minute = 0;
  }

  day.setHours(hour, minute, 0, 0);
  // If the result is in the past for "today", shift to tomorrow.
  if (!dayMatched && day.getTime() < now.getTime() - 5 * 60_000) {
    day.setDate(day.getDate() + 1);
  }
  return day;
}

function stripWhen(text: string): string {
  return text
    .replace(/\b(?:today|tonight|tomorrow|tmrw)\b/gi, ' ')
    .replace(/\b(?:next\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, ' ')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\bat\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
