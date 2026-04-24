// Page-aware starter chips for the assistant panel's empty state. Keep in sync
// with the tool capabilities in /lib/assistantTools.ts.

type ChipSet = string[];

const DEFAULT_CHIPS: ChipSet = [
  "What's on for tomorrow?",
  'How much have I earned this week?',
  'Log a session',
  'What else can you do?',
];

const PAGE_CHIPS: Array<{ match: (path: string) => boolean; chips: ChipSet }> = [
  {
    match: (p) => p === '/app',
    chips: [
      "What's on for tomorrow?",
      'How much have I earned this week?',
      'Log a session',
      'What else can you do?',
    ],
  },
  {
    match: (p) => p.startsWith('/app/students'),
    chips: [
      'Tell me about this student',
      'Create an invoice',
      'Draft a parent update',
      'Update this student',
    ],
  },
  {
    match: (p) => p.startsWith('/app/sessions'),
    chips: [
      'Polish these notes',
      'Log a new session',
      "What's coming up",
      'Recent sessions',
    ],
  },
  {
    match: (p) => p.startsWith('/app/invoices'),
    chips: [
      'Who owes me money?',
      'Mark invoice paid',
      "This week's earnings",
      'Create invoice',
    ],
  },
];

export function getChipsForPath(path: string): ChipSet {
  for (const entry of PAGE_CHIPS) {
    if (entry.match(path)) return entry.chips;
  }
  return DEFAULT_CHIPS;
}

export const WELCOME_CHIPS: ChipSet = [
  "What's on for tomorrow?",
  'How much have I earned this week?',
  'Log today’s session with [student]',
  'Who owes me money?',
  'Tell me about [student]',
  'Polish these notes: [paste notes]',
  'Draft a quick update to [student]’s parent',
  'What else can you do?',
];
