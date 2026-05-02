// Client-safe polish demo: regex-extract fragments from rough notes, then
// fill a templated parent-update string. NO API call, NO auth — runs entirely
// in the browser. The disclaimer next to the demo makes it clear this is a
// fixed templated rewrite, not the real Anthropic-Claude-powered polish.

export type PolishStyle = 'warm' | 'concise' | 'detailed';

export type ParsedNotes = {
  student: string | null;
  topic: string | null;
  struggle: string | null;
  confidence: string | null;
  homework: string | null;
  durationMin: number | null;
  pronoun: 'they' | 'she' | 'he';
  pronounPossessive: 'their' | 'her' | 'his';
};

const STOPWORDS = new Set([
  'i', 'we', 'the', 'they', 'today', 'after', 'before', 'last', 'next',
  'but', 'and', 'a', 'an', 'covered', 'worked', 'did', 'completed', 'on',
  'with', 'in', 'at', 'for', 'of', 'to', 'this', 'that', 'over', 'session',
  'lesson', 'class',
]);

const FEMALE_NAMES = new Set([
  'mei', 'olivia', 'sarah', 'chloe', 'amelia', 'nina', 'lily', 'emma', 'isla', 'ava', 'sophia', 'mia', 'grace', 'ruby', 'jasmine',
]);
const MALE_NAMES = new Set([
  'hector', 'james', 'diego', 'liam', 'leo', 'ethan', 'sam', 'tom', 'daniel', 'noah', 'ben', 'oliver', 'jack', 'hugo', 'theo',
]);

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function trimSentence(s: string): string {
  return s.replace(/[.!?,;:]+$/, '').trim();
}

function looksLikeName(token: string): boolean {
  const t = token.toLowerCase();
  if (STOPWORDS.has(t)) return false;
  if (t.length < 2 || t.length > 14) return false;
  if (!/^[a-z]+$/.test(t)) return false;
  return true;
}

function findStudent(text: string): string | null {
  // Pattern 1: "[Name] struggled / did / completed / is / was / seemed"
  const m1 = text.match(/\b([A-Z][a-z]{1,13}|[a-z]{2,13})\s+(?:struggled|did|completed|finished|nailed|got|worked|is|was|seemed|loved|hated|enjoyed|breezed|zoomed|cracked|aced)\b/i);
  if (m1 && looksLikeName(m1[1])) return titleCase(m1[1]);

  // Pattern 2: "with [Name]"
  const m2 = text.match(/\bwith\s+([A-Z][a-z]{1,13}|[a-z]{2,13})\b/i);
  if (m2 && looksLikeName(m2[1])) return titleCase(m2[1]);

  // Pattern 3: known student names from the seeded sandbox
  const m3 = text.match(/\b(mei|hector|james|olivia|diego|sarah|liam|chloe|leo|amelia|ethan|nina|sam|lily|tom|daniel|emma|noah|isla|ben)\b/i);
  if (m3) return titleCase(m3[1]);

  return null;
}

function findFragment(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const fragment = trimSentence(m[1].trim());
      if (fragment.length >= 2 && fragment.length <= 80) return fragment;
    }
  }
  return null;
}

function findDuration(text: string): number | null {
  const m1 = text.match(/(\d+)\s*(?:min|minutes|mins)\b/i);
  if (m1) return parseInt(m1[1], 10);
  const m2 = text.match(/(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours|h)\b/i);
  if (m2) return Math.round(parseFloat(m2[1]) * 60);
  return null;
}

export function parseNotes(input: string): ParsedNotes | null {
  const text = input.trim();
  if (text.length < 8) return null;

  const student = findStudent(text);
  const lower = text.toLowerCase();

  const pronoun = student && FEMALE_NAMES.has(student.toLowerCase())
    ? 'she'
    : student && MALE_NAMES.has(student.toLowerCase())
    ? 'he'
    : 'they';
  const pronounPossessive = pronoun === 'she' ? 'her' : pronoun === 'he' ? 'his' : 'their';

  const topic = findFragment(text, [
    /\bcovered\s+([^.,;\n]+)/i,
    /\bworked on\s+([^.,;\n]+)/i,
    /\bworking on\s+([^.,;\n]+)/i,
    /\btopic[s]?:?\s+([^.,;\n]+)/i,
    /\bdid\s+([^.,;\n]+)/i,
    /\bgone over\s+([^.,;\n]+)/i,
    /\blesson on\s+([^.,;\n]+)/i,
  ]);

  const struggle = findFragment(text, [
    /\bstruggled (?:with|on)\s+([^.,;\n]+)/i,
    /\bshaky (?:on|with)\s+([^.,;\n]+)/i,
    /\bneeds work on\s+([^.,;\n]+)/i,
    /\bdifficulty with\s+([^.,;\n]+)/i,
    /\bcouldn['']?t (?:get|do|crack|see)\s+([^.,;\n]+)/i,
    /\btripped (?:up )?on\s+([^.,;\n]+)/i,
    /\bgot stuck (?:on|with)\s+([^.,;\n]+)/i,
  ]);

  const confidence = findFragment(text, [
    /\bconfident (?:on|with|about)\s+([^.,;\n]+)/i,
    /\bstrong on\s+([^.,;\n]+)/i,
    /\bsolid on\s+([^.,;\n]+)/i,
    /\bnailed\s+([^.,;\n]+)/i,
    /\baced\s+([^.,;\n]+)/i,
    /\bcomfortable with\s+([^.,;\n]+)/i,
    /\bfine on\s+([^.,;\n]+)/i,
  ]);

  const homework = findFragment(text, [
    /\bhw\s+(?:pages?\s+)?([\w\d\s-]+?)(?:\s*[.,;\n]|$)/i,
    /\bhomework[:.]?\s+([^.;\n]+)/i,
    /\bset\s+([^.,;\n]*page[s]?\s*[\d-]+[^.,;\n]*)/i,
    /\bpages?\s+(\d+(?:[-–]\d+)?)/i,
    /\bfor next (?:time|session|week)[:,]?\s+([^.;\n]+)/i,
  ]);

  const durationMin = findDuration(text);

  // If absolutely nothing parsed, treat as gibberish.
  if (!topic && !struggle && !confidence && !homework && !student) return null;

  return { student, topic, struggle, confidence, homework, durationMin, pronoun, pronounPossessive };
}

const TEMPLATES: Record<PolishStyle, ((p: ParsedNotes) => string)[]> = {
  warm: [
    (p) => {
      const name = p.student ?? 'Your child';
      const sessionFocus = p.topic ? `${p.topic}` : `today's content`;
      const conf = p.confidence ? `${titleCase(p.pronoun)} showed real fluency on ${p.confidence}` : `${titleCase(p.pronoun)} brought genuine focus`;
      const strug = p.struggle ? ` and we worked through ${p.struggle} together — that piece is starting to click` : '';
      const hw = p.homework ? `For homework, ${p.homework}.` : '';
      return `${name} and I covered ${sessionFocus} this session. ${conf}${strug}. ${hw} Looking forward to the next one.`.trim();
    },
    (p) => {
      const name = p.student ?? 'Your child';
      const focus = p.topic ?? 'the planned material';
      const intro = `Today's lesson focused on ${focus} with ${name}.`;
      const conf = p.confidence ? ` ${titleCase(p.pronoun)} is confident with ${p.confidence}` : '';
      const strug = p.struggle ? `${conf ? ' and' : ` ${titleCase(p.pronoun)} is`} working through ${p.struggle} — exactly where we want to be at this stage` : conf ? '.' : '.';
      const hw = p.homework ? ` Homework: ${p.homework}.` : '';
      return `${intro}${conf}${strug}.${hw} Will pick up from there next time.`.replace(/\.\.+/g, '.');
    },
    (p) => {
      const name = p.student ?? 'Your child';
      const focus = p.topic ? ` on ${p.topic}` : '';
      const conf = p.confidence ? ` — particularly with ${p.confidence}` : '';
      const strug = p.struggle ? ` The ${p.struggle} piece needs a bit more attention, which we'll keep returning to.` : '';
      const hw = p.homework ? ` Homework set: ${p.homework}.` : '';
      return `Strong session with ${name} today. We made good headway${focus}${conf}.${strug}${hw} See ${p.pronoun === 'they' ? 'them' : p.pronoun === 'she' ? 'her' : 'him'} next week.`.trim();
    },
  ],
  concise: [
    (p) => {
      const parts: string[] = [];
      if (p.topic) parts.push(`Covered ${p.topic}.`);
      if (p.student && p.confidence) parts.push(`${p.student} confident on ${p.confidence};`);
      else if (p.confidence) parts.push(`Confident on ${p.confidence};`);
      if (p.struggle) parts.push(`still working ${p.struggle}.`);
      if (p.homework) parts.push(`Homework: ${p.homework}.`);
      return parts.join(' ').trim() || 'Session complete. More notes next time.';
    },
    (p) => {
      const opener = p.student ? `${p.student} today:` : 'Today:';
      const focus = p.topic ?? 'planned material';
      const conf = p.confidence ? ` Strong on ${p.confidence}.` : '';
      const strug = p.struggle ? ` Shaky on ${p.struggle}.` : '';
      const hw = p.homework ? ` HW ${p.homework}.` : '';
      return `${opener} ${focus}.${conf}${strug}${hw}`.trim();
    },
    (p) => {
      const lesson = p.topic ? `Lesson: ${p.topic}.` : 'Lesson complete.';
      const conf = p.confidence ? ` ${titleCase(p.confidence)} solid.` : '';
      const strug = p.struggle ? ` ${titleCase(p.struggle)} revisited.` : '';
      const hw = p.homework ? ` Homework ${p.homework}.` : '';
      return `${lesson}${conf}${strug}${hw}`.trim();
    },
  ],
  detailed: [
    (p) => {
      const name = p.student ?? 'Your child';
      const focus = p.topic ?? 'today\'s content';
      const conf = p.confidence
        ? `The win: ${p.confidence} is locked in, which matters because that's the foundation everything else builds on.`
        : `${titleCase(p.pronoun)} brought consistent focus throughout, which always lifts what's possible in 60 minutes.`;
      const strug = p.struggle
        ? ` The frontier: ${p.struggle} — ${p.pronoun} ${p.pronoun === 'they' ? 'have' : 'has'} the language but not yet the reflex, which is normal at this stage.`
        : '';
      const hw = p.homework ? ` Homework: ${p.homework}.` : '';
      const close = p.struggle
        ? ` Next session, we'll work through one or two practice problems on that exact piece before moving on.`
        : ` Next session we'll keep building on what landed today.`;
      return `Today's session with ${name} was on ${focus}. ${conf}${strug}${hw}${close}`.trim();
    },
    (p) => {
      const name = p.student ?? 'Your child';
      const focus = p.topic ?? 'the planned content';
      const intro = `I worked with ${name} today on ${focus}. There were a couple of clear takeaways.`;
      const a = p.confidence
        ? ` First, ${p.pronoun} ${p.pronoun === 'they' ? 'have' : 'has'} internalised ${p.confidence} — the kind of thing that doesn't need re-teaching, just maintenance.`
        : ` First, ${p.pronoun} ${p.pronoun === 'they' ? 'are' : 'is'} engaging directly with the material rather than pattern-matching, which is the whole game.`;
      const b = p.struggle
        ? ` Second, ${p.struggle} is genuinely the next thing — the conceptual scaffolding is right, the execution is half a beat behind.`
        : '';
      const hw = p.homework ? ` We agreed on homework: ${p.homework}.` : '';
      return `${intro}${a}${b}${hw} I'll come into next session with the mid-step that always trips students up.`.trim();
    },
    (p) => {
      const name = p.student ?? 'Your child';
      const focus = p.topic ?? 'today\'s topic';
      const strengths = p.confidence ? `Strengths: ${p.confidence} is consistent, even with the harder examples.` : `Strengths: ${p.pronoun === 'they' ? 'their' : p.pronoun === 'she' ? 'her' : 'his'} thinking is clear when ${p.pronoun} ${p.pronoun === 'they' ? 'work' : 'works'} through problems aloud.`;
      const areas = p.struggle ? ` Areas: ${p.struggle} still needs one more pass — the framework is there, the execution is half a beat behind.` : '';
      const hw = p.homework ? ` For homework, ${p.homework}.` : '';
      return `${name} and ${focus} today. ${strengths}${areas}${hw} I'll come in next time with a couple of warm-up problems on the trickier part and we'll keep moving.`.trim();
    },
  ],
};

export function polish(input: string, style: PolishStyle, seed: number = 0): { ok: false; message: string } | { ok: true; output: string } {
  const parsed = parseNotes(input);
  if (!parsed) {
    return {
      ok: false,
      message: 'Add a few notes about what you covered, and Crestio will rewrite them.',
    };
  }
  const list = TEMPLATES[style];
  const idx = ((seed | 0) % list.length + list.length) % list.length;
  return { ok: true, output: list[idx](parsed) };
}

export const POLISH_DEMO_PLACEHOLDER =
  'covered photosynthesis. mei struggled with the light reaction. hw pages 142-145. confident on chloroplasts.';

export const POLISH_TYPING_DELAY_MS = 600;
// Per spec: 40ms per char. ~400 chars output = ~16s. If too slow in practice,
// adjust here. Keep ratio: longer = more "writing" feel; shorter = snappier.
export const POLISH_TYPING_CHAR_MS = 40;
