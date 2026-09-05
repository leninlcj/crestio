// Tool schemas + types for the Claude-powered assistant.
// All 13 tools: 6 read (no preview), 7 write (preview + execute). Three write
// tools are high-risk and require typed "confirm" before executing.

// ---------------------------------------------------------------------------
// Schemas (sent to Anthropic)
// ---------------------------------------------------------------------------

const GET_UPCOMING_SESSIONS_TOOL = {
  name: 'get_upcoming_sessions',
  description:
    "List upcoming tutoring sessions in the next N days. Use when the user asks what's on today/tomorrow/this week. Respects role, tutors see only their own sessions.",
  input_schema: {
    type: 'object' as const,
    properties: {
      days_ahead: {
        type: 'integer',
        description: 'How many days ahead to look. 1 to 30. Defaults to 7.',
      },
    },
  },
};

const GET_RECENT_SESSIONS_TOOL = {
  name: 'get_recent_sessions',
  description:
    "List recent completed sessions in the last N days, optionally filtered to one student. Use when the user asks what they did last week / recently.",
  input_schema: {
    type: 'object' as const,
    properties: {
      days_back: {
        type: 'integer',
        description: 'How many days back to look. 1 to 30. Defaults to 7.',
      },
      student_name_or_id: {
        type: 'string',
        description: 'Optional: filter to one student by name (fuzzy) or UUID.',
      },
    },
  },
};

const GET_STUDENT_SUMMARY_TOOL = {
  name: 'get_student_summary',
  description:
    "Get a concise summary of a student: recent + upcoming sessions, outstanding balance, parent contacts. Use when the user asks 'tell me about X' or 'what's X's situation'.",
  input_schema: {
    type: 'object' as const,
    properties: {
      student_name_or_id: {
        type: 'string',
        description: "Student name (fuzzy match) or UUID.",
      },
    },
    required: ['student_name_or_id'],
  },
};

const GET_UNPAID_INVOICES_TOOL = {
  name: 'get_unpaid_invoices',
  description:
    "List invoices where status is not 'paid'. Optionally scope to one student. Use when the user asks who owes them money.",
  input_schema: {
    type: 'object' as const,
    properties: {
      student_name_or_id: {
        type: 'string',
        description: 'Optional: filter to one student.',
      },
    },
  },
};

const GET_EARNINGS_SUMMARY_TOOL = {
  name: 'get_earnings_summary',
  description:
    "Compute earnings across a period: gross, paid, outstanding, hours taught, per-student breakdown. Owners see whole org; tutors see their own teaching only.",
  input_schema: {
    type: 'object' as const,
    properties: {
      period: {
        type: 'string',
        enum: ['this_week', 'last_week', 'this_month', 'last_month', 'custom'],
        description: 'Preset period, or "custom" with from/to dates.',
      },
      from: { type: 'string', description: 'ISO date for custom period start (YYYY-MM-DD).' },
      to: { type: 'string', description: 'ISO date for custom period end (YYYY-MM-DD).' },
    },
    required: ['period'],
  },
};

const SEARCH_STUDENTS_TOOL = {
  name: 'search_students',
  description:
    "Find students by fuzzy match on student name, parent name, or parent email. Returns up to 5 matches.",
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search text.' },
    },
    required: ['query'],
  },
};

export const LOG_SESSION_TOOL = {
  name: 'log_session',
  description:
    "Log a tutoring session that already happened. Use when the user describes a session in the past tense. Do NOT use for scheduling future sessions, say it's not yet supported.",
  input_schema: {
    type: 'object' as const,
    properties: {
      student_name: {
        type: 'string',
        description: "The student's name or partial name. Will be resolved server-side.",
      },
      session_date: {
        type: 'string',
        description:
          'When the session happened. Accepts ISO date (YYYY-MM-DD) or an ISO datetime. Defaults to now if omitted. "Tomorrow at 4pm" should be resolved to an ISO datetime in Australia/Sydney time.',
      },
      duration_minutes: {
        type: 'integer',
        description: 'Duration in minutes. Accepts "an hour" → 60, "90 min" → 90, "1.5 hours" → 90. Defaults to 60.',
      },
      subject: { type: 'string' },
      topic: { type: 'string' },
      notes_internal: {
        type: 'string',
        description: "Raw notes from the tutor's perspective. NOT parent-facing.",
      },
      homework: {
        type: 'string',
        description: 'Optional homework description to assign with this session.',
      },
      homework_due_date: {
        type: 'string',
        description: 'Optional ISO date (YYYY-MM-DD) the homework is due. Defaults to 7 days from the session date.',
      },
      next_session_focus: {
        type: 'string',
        description: 'Optional short note on what to cover in the next session with this student.',
      },
      status: {
        type: 'string',
        description: "Defaults to 'completed' since this logs past sessions.",
      },
    },
    required: ['student_name'],
  },
};

export const POLISH_NOTES_TOOL = {
  name: 'polish_notes',
  description:
    "Generate a parent-facing polished version of a session's internal notes. Use when the user asks to polish, clean up, or rewrite notes.",
  input_schema: {
    type: 'object' as const,
    properties: {
      session_reference: {
        type: 'string',
        description:
          "Either a session UUID or a natural-language reference like 'my last session with Aarav' or 'the session I just logged'.",
      },
    },
    required: ['session_reference'],
  },
};

const CREATE_STUDENT_TOOL = {
  name: 'create_student',
  description:
    "Add a new student. If parent_email is provided, a parent invitation will be sent after confirmation. Owners may assign to a tutor; tutors always self-assign.",
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Full name.' },
      year_level: { type: 'string' },
      subject: { type: 'string', description: 'Primary subject (single).' },
      charge_rate_dollars: {
        type: 'number',
        description: 'Hourly rate in dollars. 0 to 500.',
      },
      parent_name: { type: 'string' },
      parent_email: { type: 'string' },
      primary_tutor_name: {
        type: 'string',
        description: 'Owner-only. Assigns student to this tutor. Omit to default to caller.',
      },
    },
    required: ['name'],
  },
};

const UPDATE_STUDENT_TOOL = {
  name: 'update_student',
  description:
    "Update an existing student's details. Only include fields that are changing. Only owners can change primary_tutor_name.",
  input_schema: {
    type: 'object' as const,
    properties: {
      student_name_or_id: { type: 'string' },
      changes: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' },
          year_level: { type: 'string' },
          subject: { type: 'string' },
          charge_rate_dollars: { type: 'number' },
          primary_tutor_name: { type: 'string', description: 'Owner-only.' },
        },
      },
    },
    required: ['student_name_or_id', 'changes'],
  },
};

const ARCHIVE_STUDENT_TOOL = {
  name: 'archive_student',
  description:
    "Archive a student (hide from main list, keep history). Use when a student is no longer continuing.",
  input_schema: {
    type: 'object' as const,
    properties: {
      student_name_or_id: { type: 'string' },
    },
    required: ['student_name_or_id'],
  },
};

const CREATE_INVOICE_TOOL = {
  name: 'create_invoice',
  description:
    "HIGH-RISK. Create a new invoice for a student. By default includes all unbilled completed sessions in the last 60 days. Confirmation requires typing 'confirm'.",
  input_schema: {
    type: 'object' as const,
    properties: {
      student_name_or_id: { type: 'string' },
      session_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: specific session UUIDs to bill. If omitted, all unbilled completed sessions in the last 60 days.',
      },
      due_date: { type: 'string', description: 'ISO date (YYYY-MM-DD). Defaults to 14 days from today.' },
    },
    required: ['student_name_or_id'],
  },
};

const MARK_INVOICE_PAID_TOOL = {
  name: 'mark_invoice_paid',
  description:
    "HIGH-RISK. Mark an invoice as paid. Confirmation requires typing 'confirm'.",
  input_schema: {
    type: 'object' as const,
    properties: {
      invoice_identifier: {
        type: 'string',
        description: "Invoice number (e.g. 'INV-0014'), or a student name + period hint (e.g. 'Chen family March').",
      },
    },
    required: ['invoice_identifier'],
  },
};

const SEND_PARENT_UPDATE_TOOL = {
  name: 'send_parent_update',
  description:
    "HIGH-RISK. Draft and post a parent-facing update to the portal (no email is sent). Confirmation requires typing 'confirm'.",
  input_schema: {
    type: 'object' as const,
    properties: {
      student_name_or_id: { type: 'string' },
      tone: {
        type: 'string',
        enum: ['warm', 'brief', 'detailed'],
        description: "Voice of the update. Defaults to 'warm'.",
      },
      include_session_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional session UUIDs to reference. Defaults to the last 3 sessions.',
      },
    },
    required: ['student_name_or_id'],
  },
};

const ASSIGN_STUDENT_TO_TUTOR_TOOL = {
  name: 'assign_student_to_tutor',
  description:
    "OWNER ONLY. Assign a student to a different primary tutor in the organisation.",
  input_schema: {
    type: 'object' as const,
    properties: {
      student_name_or_id: { type: 'string' },
      tutor_name_or_email: { type: 'string' },
    },
    required: ['student_name_or_id', 'tutor_name_or_email'],
  },
};

const GET_RECENT_MESSAGES_TOOL = {
  name: 'get_recent_messages',
  description:
    "List recent messages in the thread about a student. Use when the user asks what a parent said, or wants to review the conversation before replying.",
  input_schema: {
    type: 'object' as const,
    properties: {
      student_name_or_id: { type: 'string' },
      limit: { type: 'integer', description: 'Max messages to return. Defaults to 5, capped at 20.' },
    },
    required: ['student_name_or_id'],
  },
};

const SEND_MESSAGE_TOOL = {
  name: 'send_message',
  description:
    "HIGH-RISK. Send a message to a parent about a student. Confirmation requires typing 'confirm'. Urgency can be 'urgent', 'normal' (default), or 'info'.",
  input_schema: {
    type: 'object' as const,
    properties: {
      student_name_or_id: { type: 'string' },
      body: { type: 'string', description: "Message body. 1-5000 chars. Plain text only." },
      urgency: { type: 'string', enum: ['urgent', 'normal', 'info'] },
    },
    required: ['student_name_or_id', 'body'],
  },
};

const GET_RECENT_NOTIFICATIONS_TOOL = {
  name: 'get_recent_notifications',
  description:
    "List the caller's recent in-app notifications with read status. Use when the user asks 'any notifications?' or 'what's new?'.",
  input_schema: {
    type: 'object' as const,
    properties: {
      limit: { type: 'integer', description: 'Max notifications to return. Defaults to 5, capped at 20.' },
    },
  },
};

const GET_STUDENT_HOMEWORK_STATUS_TOOL = {
  name: 'get_student_homework_status',
  description:
    "Get the latest homework assigned to a student, description, due date, completion status. Use when the user asks about a student's homework.",
  input_schema: {
    type: 'object' as const,
    properties: {
      student_name_or_id: { type: 'string', description: 'Student name (fuzzy) or UUID.' },
    },
    required: ['student_name_or_id'],
  },
};

const LIST_PENDING_HOMEWORK_TOOL = {
  name: 'list_pending_homework',
  description:
    "List all students with unmarked homework past or approaching their due date. Returns up to 10 rows ordered by due date. Use when the user asks what homework is pending across students.",
  input_schema: {
    type: 'object' as const,
    properties: {},
  },
};

const GET_UNBILLED_SUMMARY_TOOL = {
  name: 'get_unbilled_summary',
  description:
    "Return household-grouped unbilled completed sessions for a period. Use when the user asks 'what's unbilled this week?' or 'who do I need to invoice?'. Accepts a preset period or explicit ISO date range.",
  input_schema: {
    type: 'object' as const,
    properties: {
      period: {
        type: 'string',
        enum: ['this_week', 'last_week', 'this_month', 'last_month', 'custom'],
      },
      from: { type: 'string', description: 'ISO date (YYYY-MM-DD) for custom period start.' },
      to: { type: 'string', description: 'ISO date (YYYY-MM-DD) for custom period end.' },
    },
    required: ['period'],
  },
};

const CREATE_BATCH_INVOICES_TOOL = {
  name: 'create_batch_invoices',
  description:
    "HIGH-RISK. Create one invoice per household covering their unbilled sessions in a period, sending to primary parents immediately. Typed 'confirm' required. Use when the user says 'invoice everyone for this week' or picks specific households.",
  input_schema: {
    type: 'object' as const,
    properties: {
      period: {
        type: 'string',
        enum: ['this_week', 'last_week', 'this_month', 'last_month', 'custom'],
      },
      from: { type: 'string' },
      to: { type: 'string' },
      household_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional. UUIDs of households to include. If omitted, all households with unbilled work in the period are included.',
      },
      household_names: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional. Household display-name fragments; each is fuzzy-matched. Use this when the user names families like "Chen family".',
      },
    },
    required: ['period'],
  },
};

const GET_HOUSEHOLD_TOOL = {
  name: 'get_household',
  description:
    "Fetch a household by UUID. Returns display name, parents, students, and counts. Use after find_household_by_name resolved an id, or if the user pasted one.",
  input_schema: {
    type: 'object' as const,
    properties: {
      household_id: { type: 'string', description: 'Household UUID.' },
    },
    required: ['household_id'],
  },
};

const LIST_HOUSEHOLDS_TOOL = {
  name: 'list_households',
  description:
    "List households in the caller's organisation. Use when the user asks 'what households do I have?' Up to 20 rows.",
  input_schema: {
    type: 'object' as const,
    properties: {
      limit: { type: 'integer', description: 'Max households. Defaults to 20.' },
    },
  },
};

const FIND_HOUSEHOLD_BY_NAME_TOOL = {
  name: 'find_household_by_name',
  description:
    "Fuzzy-match on household display name. Use when the user references 'the Chen family' or similar. Returns up to 5 matches.",
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Search text (household name or parent name fragment).' },
    },
    required: ['name'],
  },
};

const ADD_STUDENT_TO_HOUSEHOLD_TOOL = {
  name: 'add_student_to_household',
  description:
    "Move a student into a household. Normal-risk, no typed confirmation needed. Resolves the student and household by id or fuzzy name.",
  input_schema: {
    type: 'object' as const,
    properties: {
      student_name_or_id: { type: 'string' },
      household_name_or_id: { type: 'string' },
    },
    required: ['student_name_or_id', 'household_name_or_id'],
  },
};

const CREATE_TEST_ACCOUNT_TOOL = {
  name: 'create_test_account',
  description:
    "OWNER-ONLY. Create a throwaway test account (tutor or parent) inside your own organisation so you can inspect the app from that role. These accounts are marked as test records and hidden from production views. Normal-risk, no typed confirmation.",
  input_schema: {
    type: 'object' as const,
    properties: {
      role: { type: 'string', enum: ['tutor', 'parent'] },
      full_name: { type: 'string' },
      email: { type: 'string', description: 'Optional. Auto-generated as test-[role]-[hex]@crestio.test if omitted.' },
    },
    required: ['role', 'full_name'],
  },
};

const MARK_NOTIFICATIONS_READ_TOOL = {
  name: 'mark_notifications_read',
  description:
    "Mark one or more notifications as read. Pass either a list of notification ids or the string 'all'. Low-risk, no typed confirmation required.",
  input_schema: {
    type: 'object' as const,
    properties: {
      notification_ids: {
        oneOf: [
          { type: 'array', items: { type: 'string' } },
          { type: 'string', enum: ['all'] },
        ],
      },
    },
    required: ['notification_ids'],
  },
};

export const TOOLS = [
  GET_UPCOMING_SESSIONS_TOOL,
  GET_RECENT_SESSIONS_TOOL,
  GET_STUDENT_SUMMARY_TOOL,
  GET_UNPAID_INVOICES_TOOL,
  GET_EARNINGS_SUMMARY_TOOL,
  SEARCH_STUDENTS_TOOL,
  GET_RECENT_MESSAGES_TOOL,
  GET_RECENT_NOTIFICATIONS_TOOL,
  GET_STUDENT_HOMEWORK_STATUS_TOOL,
  LIST_PENDING_HOMEWORK_TOOL,
  GET_HOUSEHOLD_TOOL,
  LIST_HOUSEHOLDS_TOOL,
  FIND_HOUSEHOLD_BY_NAME_TOOL,
  GET_UNBILLED_SUMMARY_TOOL,
  LOG_SESSION_TOOL,
  POLISH_NOTES_TOOL,
  CREATE_STUDENT_TOOL,
  UPDATE_STUDENT_TOOL,
  ARCHIVE_STUDENT_TOOL,
  CREATE_INVOICE_TOOL,
  MARK_INVOICE_PAID_TOOL,
  SEND_PARENT_UPDATE_TOOL,
  SEND_MESSAGE_TOOL,
  MARK_NOTIFICATIONS_READ_TOOL,
  ADD_STUDENT_TO_HOUSEHOLD_TOOL,
  CREATE_BATCH_INVOICES_TOOL,
  CREATE_TEST_ACCOUNT_TOOL,
  ASSIGN_STUDENT_TO_TUTOR_TOOL,
] as const;

// Tools that only the platform owner (by email) sees. We filter before sending
// to Anthropic so non-owner users don't learn these exist.
export const OWNER_ONLY_EMAIL_TOOL_NAMES: ReadonlyArray<string> = [
  'create_test_account',
];

// ---------------------------------------------------------------------------
// Tool name classification
// ---------------------------------------------------------------------------

export type ToolName =
  | 'get_upcoming_sessions'
  | 'get_recent_sessions'
  | 'get_student_summary'
  | 'get_unpaid_invoices'
  | 'get_earnings_summary'
  | 'search_students'
  | 'get_recent_messages'
  | 'get_recent_notifications'
  | 'get_student_homework_status'
  | 'list_pending_homework'
  | 'get_household'
  | 'list_households'
  | 'find_household_by_name'
  | 'get_unbilled_summary'
  | 'log_session'
  | 'polish_notes'
  | 'create_student'
  | 'update_student'
  | 'archive_student'
  | 'create_invoice'
  | 'mark_invoice_paid'
  | 'send_parent_update'
  | 'mark_notifications_read'
  | 'send_message'
  | 'add_student_to_household'
  | 'create_batch_invoices'
  | 'create_test_account'
  | 'assign_student_to_tutor';

const READ_TOOL_NAMES: ReadonlyArray<ToolName> = [
  'get_upcoming_sessions',
  'get_recent_sessions',
  'get_student_summary',
  'get_unpaid_invoices',
  'get_earnings_summary',
  'search_students',
  'get_recent_messages',
  'get_recent_notifications',
  'get_student_homework_status',
  'list_pending_homework',
  'get_household',
  'list_households',
  'find_household_by_name',
  'get_unbilled_summary',
];

const WRITE_TOOL_NAMES: ReadonlyArray<ToolName> = [
  'log_session',
  'polish_notes',
  'create_student',
  'update_student',
  'archive_student',
  'create_invoice',
  'mark_invoice_paid',
  'send_parent_update',
  'send_message',
  'mark_notifications_read',
  'add_student_to_household',
  'create_batch_invoices',
  'create_test_account',
  'assign_student_to_tutor',
];

const HIGH_RISK_TOOL_NAMES: ReadonlyArray<ToolName> = [
  'create_invoice',
  'mark_invoice_paid',
  'send_parent_update',
  'send_message',
  'create_batch_invoices',
];

const OWNER_ONLY_TOOL_NAMES: ReadonlyArray<ToolName> = [
  'assign_student_to_tutor',
];

export function isKnownTool(name: string): name is ToolName {
  return (READ_TOOL_NAMES as readonly string[]).includes(name)
    || (WRITE_TOOL_NAMES as readonly string[]).includes(name);
}

export function isReadTool(name: string): boolean {
  return (READ_TOOL_NAMES as readonly string[]).includes(name);
}

export function isWriteTool(name: string): boolean {
  return (WRITE_TOOL_NAMES as readonly string[]).includes(name);
}

export function isHighRiskTool(name: string): boolean {
  return (HIGH_RISK_TOOL_NAMES as readonly string[]).includes(name);
}

export function isOwnerOnlyTool(name: string): boolean {
  return (OWNER_ONLY_TOOL_NAMES as readonly string[]).includes(name);
}

// ---------------------------------------------------------------------------
// Input types (what Claude sends)
// ---------------------------------------------------------------------------

export type GetUpcomingSessionsInput = { days_ahead?: number };
export type GetRecentSessionsInput = { days_back?: number; student_name_or_id?: string };
export type GetStudentSummaryInput = { student_name_or_id: string };
export type GetUnpaidInvoicesInput = { student_name_or_id?: string };
export type GetEarningsSummaryInput = {
  period: 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';
  from?: string;
  to?: string;
};
export type SearchStudentsInput = { query: string };

export type LogSessionInput = {
  student_name: string;
  session_date?: string;
  duration_minutes?: number;
  subject?: string;
  topic?: string;
  notes_internal?: string;
  homework?: string;
  homework_due_date?: string;
  next_session_focus?: string;
  status?: string;
};

export type GetStudentHomeworkStatusInput = { student_name_or_id: string };
export type ListPendingHomeworkInput = {};
export type GetHouseholdInput = { household_id: string };
export type ListHouseholdsInput = { limit?: number };
export type FindHouseholdByNameInput = { name: string };
export type AddStudentToHouseholdInput = {
  student_name_or_id: string;
  household_name_or_id: string;
};
export type CreateTestAccountInput = {
  role: 'tutor' | 'parent';
  full_name: string;
  email?: string;
};

export type GetUnbilledSummaryInput = {
  period: 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';
  from?: string;
  to?: string;
};

export type CreateBatchInvoicesInput = {
  period: 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';
  from?: string;
  to?: string;
  household_ids?: string[];
  household_names?: string[];
};
export type PolishNotesInput = { session_reference: string };
export type CreateStudentInput = {
  name: string;
  year_level?: string;
  subject?: string;
  charge_rate_dollars?: number;
  parent_name?: string;
  parent_email?: string;
  primary_tutor_name?: string;
};
export type UpdateStudentInput = {
  student_name_or_id: string;
  changes: {
    name?: string;
    year_level?: string;
    subject?: string;
    charge_rate_dollars?: number;
    primary_tutor_name?: string;
  };
};
export type ArchiveStudentInput = { student_name_or_id: string };
export type CreateInvoiceInput = {
  student_name_or_id: string;
  session_ids?: string[];
  due_date?: string;
};
export type MarkInvoicePaidInput = { invoice_identifier: string };
export type SendParentUpdateInput = {
  student_name_or_id: string;
  tone?: 'warm' | 'brief' | 'detailed';
  include_session_ids?: string[];
};
export type GetRecentMessagesInput = {
  student_name_or_id: string;
  limit?: number;
};
export type SendMessageInput = {
  student_name_or_id: string;
  body: string;
  urgency?: 'urgent' | 'normal' | 'info';
};
export type GetRecentNotificationsInput = {
  limit?: number;
};
export type MarkNotificationsReadInput = {
  notification_ids: string[] | 'all';
};
export type AssignStudentToTutorInput = {
  student_name_or_id: string;
  tutor_name_or_email: string;
};

// ---------------------------------------------------------------------------
// Preview types (rendered in the UI before execute)
// ---------------------------------------------------------------------------

export type LogSessionPreview = {
  tool_name: 'log_session';
  student_id: string;
  student_name: string;
  session_date_iso: string;
  session_date_display: string;
  duration_minutes: number;
  subject: string | null;
  topic: string | null;
  notes_internal: string | null;
  homework: string | null;
  homework_due_date: string | null;
  next_session_focus: string | null;
  status: string;
  charge_rate_cents?: number | null;
  pay_rate_cents?: number | null;
  currency?: string;
};

export type PolishNotesPreview = {
  tool_name: 'polish_notes';
  session_id: string;
  student_name: string;
  session_date_display: string;
  original_notes: string;
  polished_notes: string;
};

export type CreateStudentPreview = {
  tool_name: 'create_student';
  name: string;
  year_level: string | null;
  subject: string | null;
  charge_rate_cents: number | null;
  currency: string;
  parent_name: string | null;
  parent_email: string | null;
  primary_tutor_id: string | null;
  primary_tutor_name: string | null;
  will_send_parent_invitation: boolean;
};

export type UpdateStudentChange = {
  field: string;
  field_label: string;
  from: string | null;
  to: string | null;
};

export type UpdateStudentPreview = {
  tool_name: 'update_student';
  student_id: string;
  student_name: string;
  changes: UpdateStudentChange[];
  // Server-resolved values to apply on execute:
  apply: {
    name?: string;
    year_level?: string | null;
    subjects?: string[] | null;
    hourly_rate_cents?: number | null;
    primary_tutor_id?: string | null;
  };
};

export type ArchiveStudentPreview = {
  tool_name: 'archive_student';
  student_id: string;
  student_name: string;
  past_sessions_count: number;
  parent_links_count: number;
};

export type CreateInvoiceLineItem = {
  session_id: string;
  session_date_display: string;
  duration_minutes: number;
  amount_cents: number;
  already_on_invoice: boolean;
};

export type CreateInvoicePreview = {
  tool_name: 'create_invoice';
  student_id: string;
  student_name: string;
  line_items: CreateInvoiceLineItem[];
  total_cents: number;
  currency: string;
  due_date_iso: string;
  due_date_display: string;
  warning: string | null;
};

export type MarkInvoicePaidPreview = {
  tool_name: 'mark_invoice_paid';
  invoice_id: string;
  invoice_number: string;
  student_name: string;
  total_cents: number;
  currency: string;
  current_status: string;
};

export type SendParentUpdatePreview = {
  tool_name: 'send_parent_update';
  student_id: string;
  student_name: string;
  parent_name: string | null;
  parent_has_portal_access: boolean;
  referenced_session_ids: string[];
  draft_content: string;
  tone: 'warm' | 'brief' | 'detailed';
};

export type SendMessagePreview = {
  tool_name: 'send_message';
  student_id: string;
  student_name: string;
  parent_id: string;
  parent_name: string | null;
  body: string;
  urgency: 'urgent' | 'normal' | 'info' | null;
  tutor_user_id: string;
  organization_id: string;
};

export type AssignStudentToTutorPreview = {
  tool_name: 'assign_student_to_tutor';
  student_id: string;
  student_name: string;
  current_tutor_name: string | null;
  new_tutor_id: string;
  new_tutor_name: string;
};

export type AddStudentToHouseholdPreview = {
  tool_name: 'add_student_to_household';
  student_id: string;
  student_name: string;
  household_id: string;
  household_display_name: string;
  moving_from_household_name: string | null;
};

export type CreateTestAccountPreview = {
  tool_name: 'create_test_account';
  role: 'tutor' | 'parent';
  full_name: string;
  email: string; // resolved or auto-generated
};

export type CreateBatchInvoicesPreview = {
  tool_name: 'create_batch_invoices';
  period_label: string;
  period_start_iso: string;
  period_end_iso: string;
  households: Array<{
    household_id: string;
    display_name: string;
    session_count: number;
    total_cents: number;
    session_ids: string[];
  }>;
  total_cents: number;
  currency: string;
};

export type MarkNotificationsReadPreview = {
  tool_name: 'mark_notifications_read';
  target: 'all' | 'ids';
  count: number;
  titles: string[]; // first few titles, for preview text
};

export type AnyPreview =
  | LogSessionPreview
  | PolishNotesPreview
  | CreateStudentPreview
  | UpdateStudentPreview
  | ArchiveStudentPreview
  | CreateInvoicePreview
  | MarkInvoicePaidPreview
  | SendMessagePreview
  | SendParentUpdatePreview
  | MarkNotificationsReadPreview
  | AddStudentToHouseholdPreview
  | CreateTestAccountPreview
  | CreateBatchInvoicesPreview
  | AssignStudentToTutorPreview;
