import { callAI } from '../ai/router';
import type {
  LogSessionInput,
  PolishNotesInput,
  CreateStudentInput,
  UpdateStudentInput,
  ArchiveStudentInput,
  CreateInvoiceInput,
  MarkInvoicePaidInput,
  SendParentUpdateInput,
  AssignStudentToTutorInput,
  SendMessageInput,
  AddStudentToHouseholdInput,
  AddStudentToHouseholdPreview,
  CreateTestAccountInput,
  CreateTestAccountPreview,
  CreateBatchInvoicesInput,
  CreateBatchInvoicesPreview,
  LogSessionPreview,
  PolishNotesPreview,
  CreateStudentPreview,
  UpdateStudentPreview,
  UpdateStudentChange,
  ArchiveStudentPreview,
  CreateInvoicePreview,
  CreateInvoiceLineItem,
  MarkInvoicePaidPreview,
  SendParentUpdatePreview,
  SendMessagePreview,
  AssignStudentToTutorPreview,
} from '../assistantTools';
import {
  ToolCallerContext,
  ToolResult,
  resolveStudent,
  resolveTutor,
  formatAuDate,
  formatAuDateShort,
  formatAuDateTime,
  formatCentsAud,
  firstName,
  UUID_RE,
} from './shared';

type Result<T> = ToolResult<T>;

// ---------------------------------------------------------------------------
// log_session (existing, audited)
// ---------------------------------------------------------------------------

export async function previewLogSession(
  ctx: ToolCallerContext,
  input: LogSessionInput,
): Promise<Result<LogSessionPreview>> {
  const { client, membership } = ctx;
  const raw = (input.student_name ?? '').trim();
  if (!raw) return { kind: 'failure', message: 'student_name is required.' };

  if (membership.role === 'tutor' && !membership.tutor_id) {
    return {
      kind: 'failure',
      message: "You don't have a tutor record yet, so you can't log sessions via the assistant. Ask your owner to finish setting you up.",
    };
  }

  const r = await resolveStudent(ctx, raw);
  if (r.kind === 'none') {
    const sample = r.suggestions.join(', ');
    return {
      kind: 'failure',
      message: `No student found matching "${raw}".${sample ? ` Students available: ${sample}.` : ''}`,
    };
  }
  if (r.kind === 'many') {
    return {
      kind: 'failure',
      message: `Multiple students match "${raw}": ${r.students.map((s) => s.name).join(', ')}. Please be more specific.`,
    };
  }
  const student = r.student;

  const { iso, display } = parseSessionDate(input.session_date);
  const durationMinutes = parseDurationMinutes(input.duration_minutes);

  const homeworkText = input.homework?.trim() || null;
  let homeworkDueDate: string | null = null;
  if (homeworkText) {
    const rawDue = input.homework_due_date?.trim();
    if (rawDue) {
      const m = /^(\d{4}-\d{2}-\d{2})/.exec(rawDue);
      if (m) homeworkDueDate = m[1];
    }
    if (!homeworkDueDate) {
      const d = new Date(iso);
      d.setDate(d.getDate() + 7);
      homeworkDueDate = d.toISOString().slice(0, 10);
    }
  }

  const preview: LogSessionPreview = {
    tool_name: 'log_session',
    student_id: student.id,
    student_name: student.name,
    session_date_iso: iso,
    session_date_display: display,
    duration_minutes: durationMinutes,
    subject: (input.subject?.trim() || (student.subjects && student.subjects[0]) || null),
    topic: input.topic?.trim() || null,
    notes_internal: input.notes_internal?.trim() || null,
    homework: homeworkText,
    homework_due_date: homeworkDueDate,
    next_session_focus: input.next_session_focus?.trim() || null,
    status: (input.status || 'completed').trim(),
  };

  if (membership.role === 'owner') {
    preview.charge_rate_cents = student.hourly_rate_cents ?? null;
    preview.pay_rate_cents = null;
    const { data: profile } = await client
      .from('profiles')
      .select('currency')
      .eq('id', membership.user_id)
      .maybeSingle();
    preview.currency = profile?.currency ?? 'AUD';
  }

  return { kind: 'success', value: preview };
}

function parseSessionDate(raw: string | undefined): { iso: string; display: string } {
  const now = new Date();
  if (!raw) {
    return { iso: now.toISOString(), display: 'today' };
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return { iso: now.toISOString(), display: 'today' };
  }
  return { iso: d.toISOString(), display: formatAuDateTime(d.toISOString()) };
}

function parseDurationMinutes(raw: number | undefined): number {
  if (typeof raw === 'number' && raw > 0 && raw < 600) return Math.round(raw);
  return 60;
}

// ---------------------------------------------------------------------------
// polish_notes (existing, audited)
// ---------------------------------------------------------------------------

export async function previewPolishNotes(
  ctx: ToolCallerContext,
  input: PolishNotesInput,
): Promise<Result<PolishNotesPreview>> {
  const { client, membership } = ctx;
  const ref = (input.session_reference ?? '').trim();
  if (!ref) return { kind: 'failure', message: 'session_reference is required.' };

  let sessionRow: any = null;
  if (UUID_RE.test(ref)) {
    const { data } = await client
      .from('sessions')
      .select('id, student_id, scheduled_at, duration_minutes, subject, topic, notes_internal, tutor_user_id, organization_id')
      .eq('id', ref)
      .eq('organization_id', membership.organization_id)
      .maybeSingle();
    if (!data) return { kind: 'failure', message: 'No session found with that id in your organisation.' };
    if (membership.role === 'tutor' && data.tutor_user_id !== membership.user_id) {
      return { kind: 'failure', message: 'You can only polish your own sessions.' };
    }
    sessionRow = data;
  } else {
    const m = ref.match(/with\s+([\w'\-\s]+?)(?:\.|$|,|'|")/i);
    const studentHint = m ? m[1].trim() : ref;
    let q = client
      .from('sessions')
      .select('id, student_id, scheduled_at, duration_minutes, subject, topic, notes_internal, tutor_user_id, organization_id, student:students!inner(id,name)')
      .eq('organization_id', membership.organization_id)
      .order('scheduled_at', { ascending: false })
      .limit(1);
    if (membership.role === 'tutor') q = q.eq('tutor_user_id', membership.user_id);
    if (studentHint) q = q.ilike('student.name', `%${studentHint}%`);
    const { data } = await q;
    if (!data || data.length === 0) {
      return { kind: 'failure', message: `No session found matching "${ref}". Log the session first, or reference it by id.` };
    }
    sessionRow = data[0];
  }

  const { data: student } = await client
    .from('students')
    .select('name, year_level')
    .eq('id', sessionRow.student_id)
    .maybeSingle();
  const studentName = student?.name ?? 'the student';
  const studentFirst = firstName(studentName) || 'the student';

  const raw = sessionRow.notes_internal ?? '';
  if (!raw.trim()) {
    return { kind: 'failure', message: 'This session has no internal notes yet. Ask the user to add some notes first.' };
  }

  const polished = await callPolishLLM({
    rawNotes: raw,
    studentFirstName: studentFirst,
    yearLevel: student?.year_level ?? null,
    subject: sessionRow.subject ?? null,
    durationMinutes: sessionRow.duration_minutes ?? 60,
    userId: membership.user_id,
    organizationId: membership.organization_id,
  });
  if (!polished.ok || !polished.polishedNotes) {
    return { kind: 'failure', message: polished.error ?? 'The polish step failed. Try again in a moment.' };
  }

  try {
    await client.from('notes_polish_log').insert({
      organization_id: membership.organization_id,
      user_id: membership.user_id,
      session_id: sessionRow.id,
    });
  } catch { /* ignore */ }

  return {
    kind: 'success',
    value: {
      tool_name: 'polish_notes',
      session_id: sessionRow.id,
      student_name: studentName,
      session_date_display: formatAuDate(sessionRow.scheduled_at),
      original_notes: raw,
      polished_notes: polished.polishedNotes,
    },
  };
}

async function callPolishLLM(args: {
  rawNotes: string;
  studentFirstName: string;
  yearLevel: string | null;
  subject: string | null;
  durationMinutes: number;
  userId: string;
  organizationId: string;
}): Promise<{ ok: boolean; polishedNotes?: string; error?: string }> {
  const { rawNotes, studentFirstName, yearLevel, subject, durationMinutes, userId, organizationId } = args;
  const studentLine = [
    `Student: ${studentFirstName}`,
    yearLevel ? `Year ${yearLevel}` : '',
    subject || '',
  ].filter(Boolean).join(', ');

  const prompt = `You are a professional tutor polishing rough session notes into a clear report for the student's parent. Parents skim — they want to know what happened, whether their child is progressing, and what's next.

Write in flowing prose. Short paragraphs (2-4 sentences). No bullets, no headings, no numbered lists. Do not invent details not present in the source notes.

Voice: confident, warm, specific. You are not a customer service email. You are a tutor who cares about the student and is reporting honestly to a parent who is paying for your expertise.

Structure:
- First paragraph (1-3 sentences): what the session covered and the student's overall engagement.
- Second paragraph if warranted (1-3 sentences): specific strengths or struggles observed.
- Third paragraph if warranted (1-2 sentences): homework, next session focus, or anything the parent should know.

Length: 60-140 words for typical input. Never exceed 180 words. If the input is very short (one line), the output is also short (1-2 sentences).

Australian English. No em-dashes (use commas or periods). Avoid AI tells like 'engaged well', 'made excellent progress', 'demonstrated strong understanding'. Use specific observations from the notes.

Do NOT start with 'In today's session' or 'Today we covered'. Vary sentence openings naturally.

Context:
${studentLine}
Session length: ${durationMinutes} minutes

Tutor's rough notes:
${rawNotes}

Output only the polished notes. No preamble.`;

  try {
    const result = await callAI({
      task: 'polish',
      userPrompt: prompt,
      maxTokens: 800,
      userId,
      organizationId,
    });
    if (!result.text) return { ok: false, error: 'Empty response from polish model.' };
    return { ok: true, polishedNotes: result.text };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Polish call failed.' };
  }
}

// ---------------------------------------------------------------------------
// create_student
// ---------------------------------------------------------------------------

export async function previewCreateStudent(
  ctx: ToolCallerContext,
  input: CreateStudentInput,
): Promise<Result<CreateStudentPreview>> {
  const { client, membership } = ctx;
  const name = (input.name ?? '').trim();
  if (!name) return { kind: 'failure', message: 'Student name is required.' };

  // Rate validation
  let rateCents: number | null = null;
  if (input.charge_rate_dollars != null) {
    const n = Number(input.charge_rate_dollars);
    if (!Number.isFinite(n) || n < 0 || n > 500) {
      return { kind: 'failure', message: 'Rate must be between $0 and $500/hr.' };
    }
    rateCents = Math.round(n * 100);
  }

  const parentEmail = (input.parent_email ?? '').trim().toLowerCase();
  if (parentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
    return { kind: 'failure', message: 'Parent email is not a valid email address.' };
  }

  // Resolve currency for display
  const { data: profile } = await client
    .from('profiles')
    .select('currency, default_rate_cents')
    .eq('id', membership.user_id)
    .maybeSingle();
  const currency = profile?.currency ?? 'AUD';

  // Resolve tutor assignment
  let primaryTutorId: string | null = null;
  let primaryTutorName: string | null = null;
  if (membership.role === 'tutor') {
    primaryTutorId = membership.tutor_id;
    if (membership.tutor_id) {
      const { data: t } = await client.from('tutors').select('name').eq('id', membership.tutor_id).maybeSingle();
      primaryTutorName = t?.name ?? null;
    }
  } else if (input.primary_tutor_name) {
    const r = await resolveTutor(ctx, input.primary_tutor_name);
    if (r.kind === 'none') return { kind: 'failure', message: `No tutor matching "${input.primary_tutor_name}".` };
    if (r.kind === 'many') return { kind: 'failure', message: `Multiple tutors match "${input.primary_tutor_name}". Be more specific.` };
    primaryTutorId = r.tutor.id;
    primaryTutorName = r.tutor.name;
  }

  return {
    kind: 'success',
    value: {
      tool_name: 'create_student',
      name,
      year_level: input.year_level?.trim() || null,
      subject: input.subject?.trim() || null,
      charge_rate_cents: rateCents,
      currency,
      parent_name: input.parent_name?.trim() || null,
      parent_email: parentEmail || null,
      primary_tutor_id: primaryTutorId,
      primary_tutor_name: primaryTutorName,
      will_send_parent_invitation: !!parentEmail,
    },
  };
}

// ---------------------------------------------------------------------------
// update_student
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  year_level: 'Year level',
  subject: 'Subject',
  charge_rate_dollars: 'Rate',
  primary_tutor_name: 'Primary tutor',
};

export async function previewUpdateStudent(
  ctx: ToolCallerContext,
  input: UpdateStudentInput,
): Promise<Result<UpdateStudentPreview>> {
  const { membership, client } = ctx;
  const changes = input.changes ?? {};
  if (Object.keys(changes).length === 0) {
    return { kind: 'failure', message: 'No changes specified.' };
  }

  if (changes.primary_tutor_name !== undefined && membership.role !== 'owner') {
    return {
      kind: 'failure',
      message: 'Only the organisation owner can reassign a student to a different tutor.',
    };
  }

  const r = await resolveStudent(ctx, input.student_name_or_id);
  if (r.kind === 'none') return { kind: 'failure', message: `No student matching "${input.student_name_or_id}".` };
  if (r.kind === 'many') {
    return { kind: 'failure', message: `Multiple students match "${input.student_name_or_id}". Be more specific.` };
  }
  const student = r.student;

  const diff: UpdateStudentChange[] = [];
  const apply: UpdateStudentPreview['apply'] = {};

  if (changes.name !== undefined && changes.name !== null) {
    const newName = String(changes.name).trim();
    if (newName && newName !== student.name) {
      diff.push({ field: 'name', field_label: FIELD_LABELS.name, from: student.name, to: newName });
      apply.name = newName;
    }
  }
  if (changes.year_level !== undefined) {
    const newY = String(changes.year_level ?? '').trim() || null;
    if (newY !== (student.year_level ?? null)) {
      diff.push({ field: 'year_level', field_label: FIELD_LABELS.year_level, from: student.year_level ?? null, to: newY });
      apply.year_level = newY;
    }
  }
  if (changes.subject !== undefined) {
    const newSubject = String(changes.subject ?? '').trim() || null;
    const currentFirst = student.subjects && student.subjects.length > 0 ? student.subjects[0] : null;
    if (newSubject !== currentFirst) {
      diff.push({ field: 'subject', field_label: FIELD_LABELS.subject, from: currentFirst, to: newSubject });
      apply.subjects = newSubject ? [newSubject] : [];
    }
  }
  if (changes.charge_rate_dollars !== undefined) {
    const n = Number(changes.charge_rate_dollars);
    if (!Number.isFinite(n) || n < 0 || n > 500) {
      return { kind: 'failure', message: 'Rate must be between $0 and $500/hr.' };
    }
    const newCents = Math.round(n * 100);
    if (newCents !== (student.hourly_rate_cents ?? null)) {
      diff.push({
        field: 'charge_rate_cents',
        field_label: FIELD_LABELS.charge_rate_dollars,
        from: student.hourly_rate_cents != null ? formatCentsAud(student.hourly_rate_cents) + '/hr' : null,
        to: formatCentsAud(newCents) + '/hr',
      });
      apply.hourly_rate_cents = newCents;
    }
  }
  if (changes.primary_tutor_name !== undefined) {
    const newTutorName = String(changes.primary_tutor_name ?? '').trim();
    if (!newTutorName) {
      return { kind: 'failure', message: 'primary_tutor_name cannot be empty.' };
    }
    const rt = await resolveTutor(ctx, newTutorName);
    if (rt.kind === 'none') return { kind: 'failure', message: `No tutor matching "${newTutorName}".` };
    if (rt.kind === 'many') return { kind: 'failure', message: `Multiple tutors match "${newTutorName}". Be more specific.` };
    const newTutorId = rt.tutor.id;
    if (newTutorId !== (student.primary_tutor_id ?? null)) {
      let currentTutorName: string | null = null;
      if (student.primary_tutor_id) {
        const { data: t } = await client.from('tutors').select('name').eq('id', student.primary_tutor_id).maybeSingle();
        currentTutorName = t?.name ?? null;
      }
      diff.push({
        field: 'primary_tutor_id',
        field_label: FIELD_LABELS.primary_tutor_name,
        from: currentTutorName,
        to: rt.tutor.name,
      });
      apply.primary_tutor_id = newTutorId;
    }
  }

  if (diff.length === 0) {
    return { kind: 'failure', message: 'Nothing to change — those values already match.' };
  }

  return {
    kind: 'success',
    value: {
      tool_name: 'update_student',
      student_id: student.id,
      student_name: student.name,
      changes: diff,
      apply,
    },
  };
}

// ---------------------------------------------------------------------------
// archive_student
// ---------------------------------------------------------------------------

export async function previewArchiveStudent(
  ctx: ToolCallerContext,
  input: ArchiveStudentInput,
): Promise<Result<ArchiveStudentPreview>> {
  const { client } = ctx;
  const r = await resolveStudent(ctx, input.student_name_or_id);
  if (r.kind === 'none') return { kind: 'failure', message: `No student matching "${input.student_name_or_id}".` };
  if (r.kind === 'many') return { kind: 'failure', message: `Multiple students match "${input.student_name_or_id}". Be more specific.` };
  const student = r.student;

  const { count: pastCount } = await client
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id);

  const { count: linksCount } = await client
    .from('parent_student_links')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
    .is('revoked_at', null);

  return {
    kind: 'success',
    value: {
      tool_name: 'archive_student',
      student_id: student.id,
      student_name: student.name,
      past_sessions_count: pastCount ?? 0,
      parent_links_count: linksCount ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// create_invoice [HIGH-RISK]
// ---------------------------------------------------------------------------

export async function previewCreateInvoice(
  ctx: ToolCallerContext,
  input: CreateInvoiceInput,
): Promise<Result<CreateInvoicePreview>> {
  const { client, membership } = ctx;

  const r = await resolveStudent(ctx, input.student_name_or_id);
  if (r.kind === 'none') return { kind: 'failure', message: `No student matching "${input.student_name_or_id}".` };
  if (r.kind === 'many') return { kind: 'failure', message: `Multiple students match. Be more specific.` };
  const student = r.student;

  // Determine which sessions to include.
  let sessionRows: any[] = [];
  if (input.session_ids && input.session_ids.length > 0) {
    const { data } = await client
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, charge_rate_cents, invoice_id, status')
      .eq('organization_id', membership.organization_id)
      .eq('student_id', student.id)
      .in('id', input.session_ids);
    sessionRows = data ?? [];
    if (sessionRows.length === 0) {
      return { kind: 'failure', message: "Those sessions don't exist or aren't for this student." };
    }
  } else {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const { data } = await client
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, charge_rate_cents, invoice_id, status')
      .eq('organization_id', membership.organization_id)
      .eq('student_id', student.id)
      .eq('status', 'completed')
      .is('invoice_id', null)
      .gte('scheduled_at', sixtyDaysAgo)
      .order('scheduled_at', { ascending: true });
    sessionRows = data ?? [];
    if (sessionRows.length === 0) {
      return { kind: 'failure', message: `No unbilled completed sessions for ${student.name} in the last 60 days.` };
    }
  }

  const lineItems: CreateInvoiceLineItem[] = sessionRows.map((s) => ({
    session_id: s.id,
    session_date_display: formatAuDate(s.scheduled_at),
    duration_minutes: s.duration_minutes,
    amount_cents: Math.round(((s.charge_rate_cents ?? 0) * (s.duration_minutes ?? 0)) / 60),
    already_on_invoice: !!s.invoice_id,
  }));
  const total = lineItems.reduce((a, l) => a + l.amount_cents, 0);

  const warning = lineItems.some((l) => l.already_on_invoice)
    ? 'One or more sessions are already attached to another invoice. Confirming will overwrite that link.'
    : null;

  const { data: profile } = await client
    .from('profiles').select('currency').eq('id', membership.user_id).maybeSingle();
  const currency = profile?.currency ?? 'AUD';

  let dueIso: string;
  if (input.due_date) {
    const d = new Date(input.due_date);
    if (Number.isNaN(d.getTime())) return { kind: 'failure', message: 'due_date is invalid.' };
    dueIso = d.toISOString().slice(0, 10);
  } else {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    dueIso = d.toISOString().slice(0, 10);
  }

  return {
    kind: 'success',
    value: {
      tool_name: 'create_invoice',
      student_id: student.id,
      student_name: student.name,
      line_items: lineItems,
      total_cents: total,
      currency,
      due_date_iso: dueIso,
      due_date_display: formatAuDate(dueIso),
      warning,
    },
  };
}

// ---------------------------------------------------------------------------
// mark_invoice_paid [HIGH-RISK]
// ---------------------------------------------------------------------------

export async function previewMarkInvoicePaid(
  ctx: ToolCallerContext,
  input: MarkInvoicePaidInput,
): Promise<Result<MarkInvoicePaidPreview>> {
  const { client, membership } = ctx;
  const raw = (input.invoice_identifier ?? '').trim();
  if (!raw) return { kind: 'failure', message: 'invoice_identifier is required.' };

  // Try by invoice number first (case-insensitive).
  let q = client
    .from('invoices')
    .select('id, number, status, total_cents, issued_on, student:students!inner(id, name)')
    .eq('organization_id', membership.organization_id)
    .ilike('number', raw)
    .limit(5);
  let { data: matches } = await q;
  let list = (matches ?? []) as any[];

  // Fall back to student-name search (unpaid invoices only).
  if (list.length === 0) {
    const { data: studentMatches } = await client
      .from('students')
      .select('id, name')
      .eq('organization_id', membership.organization_id)
      .ilike('name', `%${raw}%`)
      .limit(5);
    const studentIds = (studentMatches ?? []).map((s: any) => s.id);
    if (studentIds.length > 0) {
      const { data: invs } = await client
        .from('invoices')
        .select('id, number, status, total_cents, issued_on, student:students!inner(id, name)')
        .eq('organization_id', membership.organization_id)
        .neq('status', 'paid')
        .neq('status', 'void')
        .in('student_id', studentIds)
        .order('issued_on', { ascending: false })
        .limit(5);
      list = (invs ?? []) as any[];
    }
  }

  if (list.length === 0) {
    return { kind: 'failure', message: `No invoice matching "${raw}".` };
  }
  if (list.length > 1) {
    const summary = list
      .map((i: any) => `${i.number} (${i.student?.name}, ${formatCentsAud(i.total_cents ?? 0)})`)
      .join('; ');
    return { kind: 'failure', message: `Multiple invoices match: ${summary}. Please specify the invoice number.` };
  }

  const inv = list[0];
  if (inv.status === 'paid') {
    return { kind: 'failure', message: `${inv.number} is already marked paid.` };
  }

  const { data: profile } = await client
    .from('profiles').select('currency').eq('id', membership.user_id).maybeSingle();

  return {
    kind: 'success',
    value: {
      tool_name: 'mark_invoice_paid',
      invoice_id: inv.id,
      invoice_number: inv.number,
      student_name: inv.student?.name ?? 'Unknown',
      total_cents: inv.total_cents ?? 0,
      currency: profile?.currency ?? 'AUD',
      current_status: inv.status,
    },
  };
}

// ---------------------------------------------------------------------------
// send_parent_update [HIGH-RISK]
// ---------------------------------------------------------------------------

export async function previewSendParentUpdate(
  ctx: ToolCallerContext,
  input: SendParentUpdateInput,
): Promise<Result<SendParentUpdatePreview>> {
  const { client, membership } = ctx;

  const r = await resolveStudent(ctx, input.student_name_or_id);
  if (r.kind === 'none') return { kind: 'failure', message: `No student matching "${input.student_name_or_id}".` };
  if (r.kind === 'many') return { kind: 'failure', message: 'Multiple students match. Be more specific.' };
  const student = r.student;

  const tone = (input.tone && ['warm', 'brief', 'detailed'].includes(input.tone)) ? input.tone : 'warm';

  // Parent contact — prefer portal-linked parent; fall back to student.parent_name
  const { data: links } = await client
    .from('parent_student_links')
    .select('parent:parents!inner(name, email)')
    .eq('student_id', student.id)
    .is('revoked_at', null)
    .limit(1);
  const linkedParent = ((links ?? []) as any[])[0]?.parent ?? null;
  const parentName = linkedParent?.name ?? student.parent_name ?? null;
  const parentHasPortalAccess = !!linkedParent;

  // Pull sessions to reference.
  let sessionsToReference: any[] = [];
  if (input.include_session_ids && input.include_session_ids.length > 0) {
    const { data } = await client
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, subject, topic, notes_internal, notes_parent_facing')
      .eq('organization_id', membership.organization_id)
      .eq('student_id', student.id)
      .in('id', input.include_session_ids);
    sessionsToReference = data ?? [];
  } else {
    const { data } = await client
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, subject, topic, notes_internal, notes_parent_facing')
      .eq('organization_id', membership.organization_id)
      .eq('student_id', student.id)
      .eq('status', 'completed')
      .order('scheduled_at', { ascending: false })
      .limit(3);
    sessionsToReference = data ?? [];
  }
  if (sessionsToReference.length === 0) {
    return { kind: 'failure', message: `No sessions available to reference for ${student.name}.` };
  }

  const draft = await draftParentUpdate({
    studentFirstName: firstName(student.name) || 'your child',
    yearLevel: student.year_level,
    tone,
    sessions: sessionsToReference.map((s) => ({
      date: formatAuDate(s.scheduled_at),
      subject: s.subject,
      topic: s.topic,
      notes: s.notes_parent_facing || s.notes_internal || '',
      duration: s.duration_minutes,
    })),
    userId: membership.user_id,
    organizationId: membership.organization_id,
  });
  if (!draft.ok || !draft.content) {
    return { kind: 'failure', message: draft.error ?? 'Could not draft the update.' };
  }

  return {
    kind: 'success',
    value: {
      tool_name: 'send_parent_update',
      student_id: student.id,
      student_name: student.name,
      parent_name: parentName,
      parent_has_portal_access: parentHasPortalAccess,
      referenced_session_ids: sessionsToReference.map((s: any) => s.id),
      draft_content: draft.content,
      tone,
    },
  };
}

async function draftParentUpdate(args: {
  studentFirstName: string;
  yearLevel: string | null;
  tone: 'warm' | 'brief' | 'detailed';
  sessions: Array<{ date: string; subject: string | null; topic: string | null; notes: string; duration: number }>;
  userId: string;
  organizationId: string;
}): Promise<{ ok: boolean; content?: string; error?: string }> {
  const { studentFirstName, yearLevel, tone, sessions, userId, organizationId } = args;

  const toneGuide = {
    warm: 'Warm and personal. Two short paragraphs. Reference one or two specifics.',
    brief: 'Brief and factual. One short paragraph, 2–3 sentences.',
    detailed: 'Detailed. Three short paragraphs. Cover progress, current focus, and what to watch next.',
  }[tone];

  const sessionsBlock = sessions.map((s, i) => {
    const header = `#${i + 1} ${s.date}${s.subject ? ` · ${s.subject}` : ''}${s.topic ? ` · ${s.topic}` : ''} · ${s.duration} min`;
    return header + (s.notes ? `\nNotes: ${s.notes}` : '\nNotes: (none)');
  }).join('\n\n');

  const prompt = `You are writing a short parent portal update from a tutor. Use Australian English (mum, maths, colour). The parent will read this on the portal.

Style: ${toneGuide} No emoji. No salutation ("Hi there") and no sign-off ("Cheers, [name]") — the portal already shows who it's from. Refer to the student by first name. Plain, observational. No fillers like "productive session" or "solid foundation". Never invent specifics.

Student: ${studentFirstName}${yearLevel ? `, Year ${yearLevel}` : ''}
Recent sessions:
${sessionsBlock}

Output only the update body. No preamble.`;

  try {
    const result = await callAI({
      task: 'session_summary',
      userPrompt: prompt,
      maxTokens: 600,
      userId,
      organizationId,
    });
    if (!result.text) return { ok: false, error: 'Empty response.' };
    return { ok: true, content: result.text };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Draft call failed.' };
  }
}

// ---------------------------------------------------------------------------
// assign_student_to_tutor [owner only]
// ---------------------------------------------------------------------------

export async function previewAssignStudentToTutor(
  ctx: ToolCallerContext,
  input: AssignStudentToTutorInput,
): Promise<Result<AssignStudentToTutorPreview>> {
  const { client, membership } = ctx;
  if (membership.role !== 'owner') {
    return { kind: 'failure', message: 'Only the organisation owner can reassign students.' };
  }

  const rs = await resolveStudent(ctx, input.student_name_or_id);
  if (rs.kind === 'none') return { kind: 'failure', message: `No student matching "${input.student_name_or_id}".` };
  if (rs.kind === 'many') return { kind: 'failure', message: 'Multiple students match. Be more specific.' };
  const student = rs.student;

  const rt = await resolveTutor(ctx, input.tutor_name_or_email);
  if (rt.kind === 'none') return { kind: 'failure', message: `No tutor matching "${input.tutor_name_or_email}".` };
  if (rt.kind === 'many') return { kind: 'failure', message: 'Multiple tutors match. Be more specific.' };
  const tutor = rt.tutor;

  if (student.primary_tutor_id === tutor.id) {
    return { kind: 'failure', message: `${student.name} is already assigned to ${tutor.name}.` };
  }

  let currentTutorName: string | null = null;
  if (student.primary_tutor_id) {
    const { data } = await client.from('tutors').select('name').eq('id', student.primary_tutor_id).maybeSingle();
    currentTutorName = data?.name ?? null;
  }

  return {
    kind: 'success',
    value: {
      tool_name: 'assign_student_to_tutor',
      student_id: student.id,
      student_name: student.name,
      current_tutor_name: currentTutorName,
      new_tutor_id: tutor.id,
      new_tutor_name: tutor.name,
    },
  };
}

// ---------------------------------------------------------------------------
// send_message [HIGH-RISK]
// ---------------------------------------------------------------------------

export async function previewSendMessage(
  ctx: ToolCallerContext,
  input: SendMessageInput,
): Promise<Result<SendMessagePreview>> {
  const { client, membership } = ctx;
  if (!membership) return { kind: 'failure', message: 'Only tutors can send messages via the assistant.' };

  const body = (input.body ?? '').trim();
  if (!body) return { kind: 'failure', message: 'Message body is empty.' };
  if (body.length > 5000) return { kind: 'failure', message: 'Message exceeds 5000 characters.' };

  const urgency = input.urgency && ['urgent', 'normal', 'info'].includes(input.urgency) ? input.urgency : 'normal';

  const r = await resolveStudent(ctx, input.student_name_or_id);
  if (r.kind === 'none') return { kind: 'failure', message: `No student matching "${input.student_name_or_id}".` };
  if (r.kind === 'many') return { kind: 'failure', message: 'Multiple students match. Be more specific.' };
  const student = r.student;

  // Resolve the assigned tutor for the student. If the caller is a tutor,
  // they must also be that tutor. Owners are allowed to message any student.
  const { data: studentRow } = await client
    .from('students')
    .select('primary_tutor_id, organization_id')
    .eq('id', student.id)
    .maybeSingle();
  if (!studentRow || studentRow.organization_id !== membership.organization_id) {
    return { kind: 'failure', message: 'Student is not in your organisation.' };
  }
  let tutorUserId: string | null = null;
  if (studentRow.primary_tutor_id) {
    const { data: t } = await client
      .from('tutors').select('auth_user_id').eq('id', studentRow.primary_tutor_id).maybeSingle();
    tutorUserId = t?.auth_user_id ?? null;
  }
  if (!tutorUserId) tutorUserId = membership.user_id;

  if (membership.role === 'tutor' && tutorUserId !== membership.user_id) {
    return { kind: 'failure', message: "You're not this student's assigned tutor." };
  }

  // Find a parent linked to the student. If more than one, pick the most
  // recently-created and mention it in the preview so the tutor knows.
  const { data: links } = await client
    .from('parent_student_links')
    .select('parent:parents!inner(id, name)')
    .eq('student_id', student.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  const linkedParents = ((links ?? []) as any[]).map((l) => l.parent).filter(Boolean);
  if (linkedParents.length === 0) {
    return { kind: 'failure', message: `${student.name} has no portal-linked parent to message yet.` };
  }
  const parent = linkedParents[0];

  return {
    kind: 'success',
    value: {
      tool_name: 'send_message',
      student_id: student.id,
      student_name: student.name,
      parent_id: parent.id,
      parent_name: parent.name ?? null,
      body,
      urgency: urgency === 'normal' ? null : urgency,
      tutor_user_id: tutorUserId,
      organization_id: studentRow.organization_id,
    },
  };
}

// ---------------------------------------------------------------------------
// mark_notifications_read — low-risk, one-click confirm.
// ---------------------------------------------------------------------------

export async function previewMarkNotificationsRead(
  ctx: ToolCallerContext,
  input: { notification_ids: string[] | 'all' },
): Promise<Result<import('../assistantTools').MarkNotificationsReadPreview>> {
  const { client } = ctx;
  if (input.notification_ids === 'all') {
    const { data } = await client
      .from('notifications')
      .select('title')
      .is('read_at', null)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(20);
    const rows = (data ?? []) as Array<{ title: string }>;
    if (rows.length === 0) return { kind: 'failure', message: 'No unread notifications to mark.' };
    return {
      kind: 'success',
      value: {
        tool_name: 'mark_notifications_read',
        target: 'all',
        count: rows.length,
        titles: rows.slice(0, 3).map((r) => r.title),
      },
    };
  }
  const ids = Array.isArray(input.notification_ids) ? input.notification_ids : [];
  if (ids.length === 0) return { kind: 'failure', message: 'No notification ids supplied.' };
  const { data } = await client
    .from('notifications')
    .select('id, title')
    .in('id', ids);
  const rows = (data ?? []) as Array<{ id: string; title: string }>;
  if (rows.length === 0) return { kind: 'failure', message: 'Those notifications were not found.' };
  return {
    kind: 'success',
    value: {
      tool_name: 'mark_notifications_read',
      target: 'ids',
      count: rows.length,
      titles: rows.slice(0, 3).map((r) => r.title),
    },
  };
}

// ---------------------------------------------------------------------------
// add_student_to_household
// ---------------------------------------------------------------------------

export async function previewAddStudentToHousehold(
  ctx: ToolCallerContext,
  input: AddStudentToHouseholdInput,
): Promise<Result<AddStudentToHouseholdPreview>> {
  const { client, membership } = ctx;
  const studentRaw = (input.student_name_or_id ?? '').trim();
  const householdRaw = (input.household_name_or_id ?? '').trim();
  if (!studentRaw) return { kind: 'failure', message: 'student_name_or_id is required.' };
  if (!householdRaw) return { kind: 'failure', message: 'household_name_or_id is required.' };

  const r = await resolveStudent(ctx, studentRaw);
  if (r.kind === 'none') {
    return { kind: 'failure', message: `No student found matching "${studentRaw}".` };
  }
  if (r.kind === 'many') {
    return { kind: 'failure', message: `Multiple students match "${studentRaw}": ${r.students.map((s) => s.name).join(', ')}.` };
  }
  const student = r.student;

  let household: { id: string; display_name: string } | null = null;
  if (UUID_RE.test(householdRaw)) {
    const { data } = await client
      .from('households')
      .select('id, display_name')
      .eq('id', householdRaw)
      .eq('organization_id', membership.organization_id)
      .is('archived_at', null)
      .maybeSingle();
    household = data ?? null;
  }
  if (!household) {
    const { data } = await client
      .from('households')
      .select('id, display_name')
      .eq('organization_id', membership.organization_id)
      .is('archived_at', null)
      .ilike('display_name', `%${householdRaw}%`)
      .limit(2);
    const rows = (data ?? []) as any[];
    if (rows.length === 0) {
      return { kind: 'failure', message: `No household found matching "${householdRaw}".` };
    }
    if (rows.length > 1) {
      return {
        kind: 'failure',
        message: `Multiple households match "${householdRaw}": ${rows.map((x) => x.display_name).join(', ')}.`,
      };
    }
    household = rows[0];
  }

  if (!household) {
    return { kind: 'failure', message: `Could not resolve household "${householdRaw}".` };
  }

  let movingFrom: string | null = null;
  const { data: currentStudent } = await client
    .from('students')
    .select('household_id')
    .eq('id', student.id)
    .maybeSingle();
  if (currentStudent?.household_id && currentStudent.household_id !== household.id) {
    const { data: current } = await client
      .from('households')
      .select('display_name')
      .eq('id', currentStudent.household_id)
      .maybeSingle();
    movingFrom = current?.display_name ?? null;
  }

  return {
    kind: 'success',
    value: {
      tool_name: 'add_student_to_household',
      student_id: student.id,
      student_name: student.name,
      household_id: household.id,
      household_display_name: household.display_name,
      moving_from_household_name: movingFrom,
    },
  };
}

// ---------------------------------------------------------------------------
// create_test_account (owner-only tool — gating done when filtering TOOLS array)
// ---------------------------------------------------------------------------

export async function previewCreateTestAccount(
  _ctx: ToolCallerContext,
  input: CreateTestAccountInput,
): Promise<Result<CreateTestAccountPreview>> {
  const role = input.role;
  if (role !== 'tutor' && role !== 'parent') {
    return { kind: 'failure', message: 'role must be "tutor" or "parent".' };
  }
  const fullName = (input.full_name ?? '').trim();
  if (!fullName) return { kind: 'failure', message: 'full_name is required.' };
  const email = (input.email ?? '').trim().toLowerCase()
    || `test-${role}-pending@crestio.test`; // real email picked server-side on execute
  return {
    kind: 'success',
    value: {
      tool_name: 'create_test_account',
      role,
      full_name: fullName,
      email,
    },
  };
}

// ---------------------------------------------------------------------------
// create_batch_invoices
// ---------------------------------------------------------------------------

export async function previewCreateBatchInvoices(
  ctx: ToolCallerContext,
  input: CreateBatchInvoicesInput,
): Promise<Result<CreateBatchInvoicesPreview>> {
  const { client, membership } = ctx;
  const { getUnbilledSessions } = await import('../billing/unbilledSessions');
  const { groupSessionsByHousehold, periodPreset } = await import('../billing/groupSessionsByHousehold');

  let start: Date, end: Date;
  let label: string;
  if (input.period === 'custom') {
    if (!input.from || !input.to) {
      return { kind: 'failure', message: 'from and to dates are required for a custom period.' };
    }
    start = new Date(`${input.from}T00:00:00`);
    end = new Date(`${input.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    label = `${input.from} to ${input.to}`;
  } else {
    const p = periodPreset(input.period);
    start = p.start; end = p.end;
    label = input.period.replace('_', ' ');
  }

  const tutorUserId = membership.role === 'tutor' ? membership.user_id : null;
  const sessions = await getUnbilledSessions(client, {
    organizationId: membership.organization_id,
    periodStart: start,
    periodEnd: end,
    tutorUserId,
  });
  const groups = await groupSessionsByHousehold(client, sessions);

  // Filter by requested ids or name fragments.
  let filtered = groups.filter((g) => g.household_id);
  if (input.household_ids && input.household_ids.length > 0) {
    const ids = new Set(input.household_ids);
    filtered = filtered.filter((g) => ids.has(g.household_id!));
  } else if (input.household_names && input.household_names.length > 0) {
    const needles = input.household_names.map((n) => n.toLowerCase().trim()).filter(Boolean);
    filtered = filtered.filter((g) =>
      needles.some((n) => g.household_display_name.toLowerCase().includes(n)),
    );
  }

  if (filtered.length === 0) {
    return { kind: 'failure', message: 'No households with unbilled sessions match.' };
  }

  const { data: profile } = await client
    .from('profiles').select('currency').eq('id', membership.user_id).maybeSingle();

  return {
    kind: 'success',
    value: {
      tool_name: 'create_batch_invoices',
      period_label: label,
      period_start_iso: start.toISOString(),
      period_end_iso: end.toISOString(),
      households: filtered.map((g) => ({
        household_id: g.household_id!,
        display_name: g.household_display_name,
        session_count: g.session_count,
        total_cents: g.total_cents,
        session_ids: g.students.flatMap((s) => s.sessions.map((x) => x.session_id)),
      })),
      total_cents: filtered.reduce((a, g) => a + g.total_cents, 0),
      currency: profile?.currency ?? 'AUD',
    },
  };
}
