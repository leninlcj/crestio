// Fake data for the /sandbox demo. Deterministic by design — every visitor
// sees the same Hector, Mia, Diego on the same days, so screenshots posted
// to the internet remain coherent over time.
//
// All times are anchored to "now" so the dashboard always shows realistic
// past + future sessions. The anchor uses local time of the visitor.

export type SandboxStudent = {
  id: string;
  name: string;
  year_level: string;
  subject: string;
  parent_name: string;
  parent_email: string;
  hourly_rate_cents: number;
};

export type SandboxSession = {
  id: string;
  student_id: string;
  scheduled_at: string;       // ISO
  duration_minutes: number;
  subject: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes_internal?: string;
  notes_polished?: string;
  is_polished: boolean;
  is_sent_to_parent: boolean;
};

export type SandboxInvoice = {
  id: string;
  number: string;
  student_id: string;
  parent_name: string;
  total_cents: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  issued_on: string;
  due_on: string;
  paid_on?: string;
  session_count: number;
};

export type SandboxThread = {
  id: string;
  parent_name: string;
  preview: string;
  unread: number;
  last_at: string;
};

export type SandboxData = {
  students: SandboxStudent[];
  sessions: SandboxSession[];
  invoices: SandboxInvoice[];
  threads: SandboxThread[];
};

const STUDENT_DATA = [
  { id: 'stu-hector', name: 'Hector P.',  year_level: 'Year 11', subject: 'HSC English',  parent_name: 'Priya Patel',     parent_email: 'priya@example.com',     hourly_rate_cents: 8500 },
  { id: 'stu-mia',    name: 'Mia L.',     year_level: 'Year 12', subject: 'HSC Adv Eng',  parent_name: 'Mei Liu',         parent_email: 'mei.liu@example.com',   hourly_rate_cents: 9000 },
  { id: 'stu-diego',  name: 'Diego R.',   year_level: 'Year 10', subject: 'Mathematics',  parent_name: 'Ana Rivera',      parent_email: 'ana@example.com',       hourly_rate_cents: 7500 },
  { id: 'stu-aiden',  name: 'Aiden M.',   year_level: 'Year 11', subject: 'HSC Std Eng',  parent_name: 'Robert Mancini',  parent_email: 'rob@example.com',       hourly_rate_cents: 8500 },
  { id: 'stu-lily',   name: 'Lily T.',    year_level: 'Year 9',  subject: 'English',      parent_name: 'Sarah Tao',       parent_email: 'sarah.tao@example.com', hourly_rate_cents: 7000 },
  { id: 'stu-theo',   name: 'Theo K.',    year_level: 'Year 12', subject: 'HSC Ext 1',    parent_name: 'Christine Kim',   parent_email: 'christine@example.com', hourly_rate_cents: 10000 },
];

// Polish samples — pre-written rough → polished pairs. Deterministic per session.
export const SANDBOX_POLISH_SAMPLES: Record<string, { rough: string; polished: string }> = {
  'sess-pp-1': {
    rough: 'Hector — went over Handmaids Tale ch 23-24, did colour symbolism. Topic sentence good, link sentences need work. HW: paragraph on the Aunts as control mechanism. Re-read 23/24 bring 2 quotes.',
    polished: `Hector came in well-prepared with his annotations on chapters 23-24 of "The Handmaid's Tale." We focused the session on colour symbolism — he identified four distinct functions of the colour red across the novel and we built an analytical paragraph linking two of them to the broader argument about female autonomy.\n\nHis topic sentences are sharp and confident. The link sentences between evidence and analysis still need work — they tend to restate the quote rather than develop the argument.\n\nFor next session, Hector is drafting an analytical paragraph on the Aunts as a control mechanism. He's also re-reading chapters 23 and 24 and bringing two quotes he'd like to discuss.`,
  },
  'sess-pp-2': {
    rough: 'Mia — Module B Cassandra. Strong essay structure, transitions weak. Need to work on contextual analysis. Practiced exam writing 40 min, decent.',
    polished: `Mia delivered a focused session on Module B's Cassandra. Her essay structure is strong — clear thesis, considered evidence, controlled argument. The transitions between paragraphs are still soft, sometimes restating rather than building.\n\nWe spent forty minutes on timed exam writing. She produced a respectable response under pressure, with the introduction and second body paragraph coming through clearly.\n\nThe area to develop next is contextual analysis — weaving the historical and literary context into the argument rather than treating it as a separate paragraph. We'll focus on this approach next session.`,
  },
  'sess-pp-3': {
    rough: 'Diego — linear eqs done, word problems w/ rates and ratios. Misses units check at end. Did 3 problems together with deliberate pause for units, caught his own mistake on the third one. HW: 5.3 1-8 + recipe scaling problem.',
    polished: `Diego is comfortable with linear equations now. We spent most of the hour on word problems involving rates and ratios. He gets the setup quickly but has been losing marks by skipping the units check at the end.\n\nWe worked through three problems together with a deliberate pause after each to verify units. By the third problem, he caught his own mistake without prompting — a clear sign the habit is forming.\n\nHomework is exercises 5.3 questions 1-8, plus an extension problem about recipe scaling. We'll move on to inequalities next week.`,
  },
};

let _data: SandboxData | null = null;

export function getSandboxData(): SandboxData {
  if (_data) return _data;

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const sessions: SandboxSession[] = [];
  // 2 past sessions today (already happened)
  sessions.push(
    {
      id: 'sess-today-1',
      student_id: 'stu-aiden',
      scheduled_at: dateAt(today, -2, 11, 0).toISOString(),
      duration_minutes: 60,
      subject: 'HSC Std Eng',
      status: 'completed',
      notes_internal: 'Aiden worked on Module C creative writing piece. Strong opening, narrative voice consistent.',
      is_polished: false,
      is_sent_to_parent: false,
    },
    {
      id: 'sess-today-2',
      student_id: 'stu-lily',
      scheduled_at: dateAt(today, 0, 14, 0).toISOString(),
      duration_minutes: 60,
      subject: 'English',
      status: 'completed',
      notes_internal: 'Lily covered persuasive techniques in advertising. Good engagement, some new vocab introduced.',
      is_polished: false,
      is_sent_to_parent: false,
    },
  );

  // 4 upcoming sessions today + tomorrow
  sessions.push(
    {
      id: 'sess-today-3',
      student_id: 'stu-hector',
      scheduled_at: dateAt(today, 0, atMostFutureHour(now), 0).toISOString(),
      duration_minutes: 60,
      subject: 'HSC English',
      status: 'scheduled',
      is_polished: false,
      is_sent_to_parent: false,
    },
    {
      id: 'sess-today-4',
      student_id: 'stu-mia',
      scheduled_at: dateAt(today, 0, atMostFutureHour(now) + 1, 30).toISOString(),
      duration_minutes: 60,
      subject: 'HSC Adv Eng',
      status: 'scheduled',
      is_polished: false,
      is_sent_to_parent: false,
    },
    {
      id: 'sess-tom-1',
      student_id: 'stu-theo',
      scheduled_at: dateAt(today, 1, 10, 0).toISOString(),
      duration_minutes: 60,
      subject: 'HSC Ext 1',
      status: 'scheduled',
      is_polished: false,
      is_sent_to_parent: false,
    },
    {
      id: 'sess-tom-2',
      student_id: 'stu-diego',
      scheduled_at: dateAt(today, 1, 16, 0).toISOString(),
      duration_minutes: 60,
      subject: 'Mathematics',
      status: 'scheduled',
      is_polished: false,
      is_sent_to_parent: false,
    },
  );

  // Polish queue — 3 sessions from past few days that haven't been polished
  sessions.push(
    {
      id: 'sess-pp-1',
      student_id: 'stu-hector',
      scheduled_at: dateAt(today, -1, 16, 0).toISOString(),
      duration_minutes: 60,
      subject: 'HSC English',
      status: 'completed',
      notes_internal: SANDBOX_POLISH_SAMPLES['sess-pp-1'].rough,
      is_polished: false,
      is_sent_to_parent: false,
    },
    {
      id: 'sess-pp-2',
      student_id: 'stu-mia',
      scheduled_at: dateAt(today, -2, 17, 30).toISOString(),
      duration_minutes: 60,
      subject: 'HSC Adv Eng',
      status: 'completed',
      notes_internal: SANDBOX_POLISH_SAMPLES['sess-pp-2'].rough,
      is_polished: false,
      is_sent_to_parent: false,
    },
    {
      id: 'sess-pp-3',
      student_id: 'stu-diego',
      scheduled_at: dateAt(today, -3, 16, 0).toISOString(),
      duration_minutes: 60,
      subject: 'Mathematics',
      status: 'completed',
      notes_internal: SANDBOX_POLISH_SAMPLES['sess-pp-3'].rough,
      is_polished: false,
      is_sent_to_parent: false,
    },
  );

  // 3 historic sessions further in the past, already polished + sent
  for (let i = 0; i < 3; i++) {
    const stu = STUDENT_DATA[i];
    sessions.push({
      id: `sess-old-${i + 1}`,
      student_id: stu.id,
      scheduled_at: dateAt(today, -(7 + i * 2), 16, 0).toISOString(),
      duration_minutes: 60,
      subject: stu.subject,
      status: 'completed',
      notes_internal: 'Polished and sent.',
      notes_polished: 'Polished and sent.',
      is_polished: true,
      is_sent_to_parent: true,
    });
  }

  const invoices: SandboxInvoice[] = [
    {
      id: 'inv-1',
      number: 'INV-0042',
      student_id: 'stu-hector',
      parent_name: 'Priya Patel',
      total_cents: 34000,
      status: 'paid',
      issued_on: dateAt(today, -10, 9, 0).toISOString().slice(0, 10),
      due_on: dateAt(today, -3, 9, 0).toISOString().slice(0, 10),
      paid_on: dateAt(today, -8, 14, 22).toISOString(),
      session_count: 4,
    },
    {
      id: 'inv-2',
      number: 'INV-0043',
      student_id: 'stu-mia',
      parent_name: 'Mei Liu',
      total_cents: 27000,
      status: 'sent',
      issued_on: dateAt(today, -2, 9, 0).toISOString().slice(0, 10),
      due_on: dateAt(today, 5, 9, 0).toISOString().slice(0, 10),
      session_count: 3,
    },
    {
      id: 'inv-3',
      number: 'INV-0044',
      student_id: 'stu-diego',
      parent_name: 'Ana Rivera',
      total_cents: 22500,
      status: 'sent',
      issued_on: dateAt(today, -4, 9, 0).toISOString().slice(0, 10),
      due_on: dateAt(today, -1, 9, 0).toISOString().slice(0, 10),
      session_count: 3,
    },
    {
      id: 'inv-4',
      number: 'INV-0045',
      student_id: 'stu-theo',
      parent_name: 'Christine Kim',
      total_cents: 40000,
      status: 'draft',
      issued_on: dateAt(today, 0, 9, 0).toISOString().slice(0, 10),
      due_on: dateAt(today, 7, 9, 0).toISOString().slice(0, 10),
      session_count: 4,
    },
  ];

  const threads: SandboxThread[] = [
    {
      id: 'thread-1',
      parent_name: 'Priya Patel',
      preview: 'Thanks for the notes on Hector — the analysis on the Aunts was so clear. Quick question about exam prep…',
      unread: 1,
      last_at: dateAt(today, 0, 10, 30).toISOString(),
    },
  ];

  _data = {
    students: STUDENT_DATA,
    sessions,
    invoices,
    threads,
  };
  return _data;
}

function dateAt(base: Date, dayOffset: number, hour: number, minute: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function atMostFutureHour(now: Date): number {
  const h = now.getHours();
  return Math.min(20, Math.max(h + 1, 16));
}
