// Minimal RFC5545 iCalendar builder. No npm dep — we only need VEVENT with
// DTSTART/DTEND/SUMMARY/DESCRIPTION/UID/STATUS. Google/Apple/Outlook all
// subscribe happily to this.

export type IcsEvent = {
  uid: string;             // stable id, used by calendar apps to dedupe
  summary: string;
  description?: string | null;
  start: Date;
  end: Date;
  lastModified?: Date;
  status?: 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE';
};

const CRLF = '\r\n';

// RFC5545 requires UTC timestamps formatted as YYYYMMDDTHHMMSSZ.
function formatUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

// Escape per RFC5545 — commas, semicolons, backslashes, newlines need quoting.
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

// Fold long lines at 75 octets per RFC5545 §3.1.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + (i === 0 ? 75 : 74));
    parts.push(i === 0 ? chunk : ' ' + chunk);
    i += (i === 0 ? 75 : 74);
  }
  return parts.join(CRLF);
}

export function buildIcs(args: {
  calendarName: string;
  calendarDescription?: string;
  prodId?: string;
  events: IcsEvent[];
}): string {
  const { calendarName, calendarDescription, events } = args;
  const prodId = args.prodId ?? '-//Crestio//Tutor calendar//EN';

  const header: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  if (calendarDescription) {
    header.push(`X-WR-CALDESC:${escapeText(calendarDescription)}`);
  }

  const body: string[] = [];
  const stamp = formatUtcStamp(new Date());

  for (const e of events) {
    body.push('BEGIN:VEVENT');
    body.push(`UID:${e.uid}@crestio.ai`);
    body.push(`DTSTAMP:${stamp}`);
    body.push(`DTSTART:${formatUtcStamp(e.start)}`);
    body.push(`DTEND:${formatUtcStamp(e.end)}`);
    body.push(foldLine(`SUMMARY:${escapeText(e.summary)}`));
    if (e.description) {
      body.push(foldLine(`DESCRIPTION:${escapeText(e.description)}`));
    }
    if (e.lastModified) {
      body.push(`LAST-MODIFIED:${formatUtcStamp(e.lastModified)}`);
    }
    if (e.status) {
      body.push(`STATUS:${e.status}`);
    }
    body.push('END:VEVENT');
  }

  return [...header, ...body, 'END:VCALENDAR', ''].join(CRLF);
}
