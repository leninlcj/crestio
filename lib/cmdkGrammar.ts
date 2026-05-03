// Quick-action grammar for the Cmd+K palette.
//
// Parses inputs of the form "<verb> [entity] [modifiers]" into a structured
// command. Verbs and modifiers are tolerant of synonyms and word order.
//
// Supported verbs:
//   log session, log, schedule, book, new session
//   invoice, bill
//   polish
//   add student, new student, add parent, new parent
//   today, this week, tomorrow
//
// Modifier grammar:
//   * a student name token matches the supplied roster (substring match)
//   * a duration token matches "30m", "45m", "1h", "1.5h", "90m"
//   * a time token matches "4pm", "4:30pm", "16:00", "9am"
//
// On parse failure the caller falls back to plain fuzzy search; the parser
// never throws.

export type StudentLite = { id: string; name: string };

export type ParsedAction =
  | { kind: 'log_session'; studentId: string | null; studentName: string | null;
      durationMinutes: number | null; timeIso: string | null; raw: string }
  | { kind: 'invoice'; studentId: string | null; studentName: string | null; raw: string }
  | { kind: 'polish'; studentId: string | null; studentName: string | null; raw: string }
  | { kind: 'add_student'; raw: string }
  | { kind: 'add_parent'; raw: string }
  | { kind: 'today'; raw: string }
  | { kind: 'this_week'; raw: string }
  | { kind: 'tomorrow'; raw: string }
  | { kind: 'no_match' };

const DURATION_RE = /^(\d+(?:\.\d+)?)(m|h|min|mins|hr|hrs)$/i;
const TIME_RE = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;
const TIME_24H_RE = /^(\d{1,2}):(\d{2})$/;

function parseDuration(token: string): number | null {
  const m = DURATION_RE.exec(token);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  if (unit.startsWith('h')) return Math.round(n * 60);
  return Math.round(n);
}

function parseTimeToday(token: string): string | null {
  // "4pm", "4:30pm", "9am", "16:00".
  const now = new Date();
  let hours = -1;
  let minutes = 0;

  const m24 = TIME_24H_RE.exec(token);
  if (m24) {
    hours = Number(m24[1]);
    minutes = Number(m24[2]);
  } else {
    const m = TIME_RE.exec(token);
    if (!m) return null;
    hours = Number(m[1]);
    if (m[2]) minutes = Number(m[2]);
    const ampm = (m[3] ?? '').toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    if (!ampm && hours <= 7) hours += 12; // bare "4" → 4pm during the day
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  const d = new Date(now);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

// Match the longest student name that the input contains.
// Returns the matched record + the residual string with the name removed.
function matchStudent(input: string, students: StudentLite[]):
  { student: StudentLite; rest: string } | null {
  const lower = input.toLowerCase();
  let best: { student: StudentLite; idx: number; len: number } | null = null;
  for (const s of students) {
    if (!s.name) continue;
    const tokens = s.name.toLowerCase().split(/\s+/).filter(Boolean);
    for (const tok of tokens) {
      if (tok.length < 3) continue;
      const idx = lower.indexOf(tok);
      if (idx >= 0) {
        if (!best || tok.length > best.len) {
          best = { student: s, idx, len: tok.length };
        }
      }
    }
    // Also try the full name.
    const idxFull = lower.indexOf(s.name.toLowerCase());
    if (idxFull >= 0 && (!best || s.name.length > best.len)) {
      best = { student: s, idx: idxFull, len: s.name.length };
    }
  }
  if (!best) return null;
  const rest = (input.slice(0, best.idx) + ' ' + input.slice(best.idx + best.len))
    .trim().replace(/\s+/g, ' ');
  return { student: best.student, rest };
}

export function parseQuickAction(input: string, students: StudentLite[]): ParsedAction {
  const trimmed = (input || '').trim();
  if (!trimmed) return { kind: 'no_match' };
  const lower = trimmed.toLowerCase();

  // Page jumps — single-word verbs.
  if (/^today$/.test(lower)) return { kind: 'today', raw: trimmed };
  if (/^this\s*week$/.test(lower)) return { kind: 'this_week', raw: trimmed };
  if (/^tomorrow$/.test(lower)) return { kind: 'tomorrow', raw: trimmed };

  if (/^add\s+student$|^new\s+student$/.test(lower)) {
    return { kind: 'add_student', raw: trimmed };
  }
  if (/^add\s+parent$|^new\s+parent$/.test(lower)) {
    return { kind: 'add_parent', raw: trimmed };
  }

  // Verb routing.
  let verb: 'log_session' | 'invoice' | 'polish' | null = null;
  let body = lower;
  const verbMap: Array<[RegExp, 'log_session' | 'invoice' | 'polish']> = [
    [/^(?:log\s+session|log|schedule|book|new\s+session)\b/, 'log_session'],
    [/^(?:invoice|bill)\b/, 'invoice'],
    [/^polish\b/, 'polish'],
  ];
  for (const [re, v] of verbMap) {
    if (re.test(body)) {
      verb = v;
      body = body.replace(re, '').trim();
      break;
    }
  }
  if (!verb) return { kind: 'no_match' };

  const matched = matchStudent(body, students);
  const studentId = matched?.student.id ?? null;
  const studentName = matched?.student.name ?? null;
  const remainder = matched ? matched.rest : body;

  if (verb === 'invoice') {
    return { kind: 'invoice', studentId, studentName, raw: trimmed };
  }
  if (verb === 'polish') {
    return { kind: 'polish', studentId, studentName, raw: trimmed };
  }

  // log_session: parse remaining tokens for duration + time.
  let durationMinutes: number | null = null;
  let timeIso: string | null = null;
  for (const tok of remainder.split(/\s+/).filter(Boolean)) {
    if (durationMinutes == null) {
      const d = parseDuration(tok);
      if (d != null) { durationMinutes = d; continue; }
    }
    if (timeIso == null) {
      const t = parseTimeToday(tok);
      if (t != null) { timeIso = t; continue; }
    }
  }
  return {
    kind: 'log_session',
    studentId, studentName,
    durationMinutes, timeIso,
    raw: trimmed,
  };
}

// Render a human-readable summary of the parsed action — used for the palette
// hint label so the user sees what would happen on Enter.
export function describeAction(a: ParsedAction): string {
  switch (a.kind) {
    case 'log_session': {
      const parts: string[] = [];
      if (a.studentName) parts.push(a.studentName);
      else parts.push('student');
      if (a.timeIso) {
        const d = new Date(a.timeIso);
        parts.push(d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      } else {
        parts.push('today');
      }
      if (a.durationMinutes) parts.push(`${a.durationMinutes} min`);
      return `Log session — ${parts.join(', ')}`;
    }
    case 'invoice':
      return a.studentName ? `New invoice for ${a.studentName}` : 'New invoice';
    case 'polish':
      return a.studentName ? `Polish queue · ${a.studentName}` : 'Polish queue';
    case 'add_student': return 'Add student';
    case 'add_parent':  return 'Add parent';
    case 'today':       return "Today's sessions";
    case 'this_week':   return 'Sessions this week';
    case 'tomorrow':    return "Tomorrow's sessions";
    case 'no_match':    return '';
  }
}

// Build the URL the parsed action should route to. Returns null when the
// action cannot be expressed as a URL alone (e.g. "polish queue, filtered").
export function actionToHref(a: ParsedAction): string | null {
  switch (a.kind) {
    case 'log_session': {
      const params = new URLSearchParams();
      if (a.studentId) params.set('student', a.studentId);
      if (a.timeIso) params.set('at', a.timeIso);
      if (a.durationMinutes) params.set('duration', String(a.durationMinutes));
      const q = params.toString();
      return q ? `/app/sessions/new?${q}` : '/app/sessions/new';
    }
    case 'invoice': {
      const params = new URLSearchParams();
      if (a.studentId) params.set('student', a.studentId);
      const q = params.toString();
      return q ? `/app/invoices/new?${q}` : '/app/invoices/new';
    }
    case 'polish': {
      const params = new URLSearchParams();
      if (a.studentId) params.set('student', a.studentId);
      const q = params.toString();
      return q ? `/app/sessions/polish-queue?${q}` : '/app/sessions/polish-queue';
    }
    case 'add_student': return '/app/students/new';
    case 'add_parent':  return '/app/students/new?focus=parent';
    case 'today':       return '/app/sessions?tab=today';
    case 'this_week':   return '/app/sessions?tab=upcoming&view=week';
    case 'tomorrow':    return '/app/sessions?tab=upcoming&view=tomorrow';
    case 'no_match':    return null;
  }
}
