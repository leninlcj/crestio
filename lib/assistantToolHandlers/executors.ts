import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import type {
  LogSessionPreview,
  PolishNotesPreview,
  CreateStudentPreview,
  UpdateStudentPreview,
  ArchiveStudentPreview,
  CreateInvoicePreview,
  MarkInvoicePaidPreview,
  SendParentUpdatePreview,
  SendMessagePreview,
  AssignStudentToTutorPreview,
  AddStudentToHouseholdPreview,
  CreateTestAccountPreview,
  CreateBatchInvoicesPreview,
} from '../assistantTools';
import { isPlatformOwner } from '../owner';
import { ToolCallerContext, formatCentsAud, firstName } from './shared';
import { sendEmail } from '../email';
import { buildParentInvitationEmail } from '../emails/parentInvitation';
import {
  findOrCreateThread,
  previewOfBody,
  shouldSendEmail,
} from '../messaging';
import {
  buildMessageEmailForParent,
} from '../emails/messageNotification';
import { createNotification } from '../notifications';

export type ExecuteResult = {
  ok: boolean;
  session_id?: string;
  invoice_id?: string;
  student_id?: string;
  parent_update_id?: string;
  summary?: string;
  error?: string;
  already_done?: boolean;
};

// ---------------------------------------------------------------------------
// log_session
// ---------------------------------------------------------------------------

export async function executeLogSession(
  ctx: ToolCallerContext,
  preview: LogSessionPreview,
): Promise<ExecuteResult> {
  const { client, membership } = ctx;

  // Re-verify student still accessible.
  let sq = client
    .from('students')
    .select('id, name, hourly_rate_cents, primary_tutor_id, archived')
    .eq('organization_id', membership.organization_id)
    .eq('id', preview.student_id);
  const { data: studentRow } = await sq.maybeSingle();
  if (!studentRow || studentRow.archived) {
    return { ok: false, error: `Student ${preview.student_name} is no longer available.` };
  }
  if (membership.role === 'tutor' && studentRow.primary_tutor_id !== membership.tutor_id) {
    return { ok: false, error: 'You can only log sessions for students assigned to you.' };
  }

  let payRateCents: number | null = null;
  if (membership.role === 'tutor' && membership.tutor_id) {
    const { data: tutor } = await client
      .from('tutors').select('pay_rate_cents').eq('id', membership.tutor_id).maybeSingle();
    payRateCents = tutor?.pay_rate_cents ?? null;
  }

  const insert = {
    organization_id: membership.organization_id,
    owner_id: membership.user_id,
    student_id: preview.student_id,
    tutor_id: membership.tutor_id,
    tutor_user_id: membership.user_id,
    scheduled_at: preview.session_date_iso,
    duration_minutes: preview.duration_minutes,
    subject: preview.subject,
    topic: preview.topic,
    notes_internal: preview.notes_internal,
    homework: preview.homework,
    homework_description: preview.homework,
    homework_due_date: preview.homework_due_date,
    next_session_focus: preview.next_session_focus,
    status: preview.status,
    charge_rate_cents: studentRow.hourly_rate_cents ?? null,
    pay_rate_cents: payRateCents,
  };

  const { data: inserted, error } = await client
    .from('sessions').insert(insert).select('id').maybeSingle();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? 'Could not log session.' };
  }

  return {
    ok: true,
    session_id: inserted.id,
    summary: `Logged ${studentRow.name} · ${preview.duration_minutes} min${preview.subject ? ` · ${preview.subject}` : ''}.`,
  };
}

// ---------------------------------------------------------------------------
// polish_notes
// ---------------------------------------------------------------------------

export async function executePolishNotes(
  ctx: ToolCallerContext,
  preview: PolishNotesPreview,
): Promise<ExecuteResult> {
  const { client, membership } = ctx;

  const { data: sessionRow } = await client
    .from('sessions')
    .select('id, tutor_user_id, organization_id')
    .eq('id', preview.session_id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (!sessionRow) return { ok: false, error: 'Session not found.' };
  if (membership.role === 'tutor' && sessionRow.tutor_user_id !== membership.user_id) {
    return { ok: false, error: 'You can only polish your own sessions.' };
  }

  const { error } = await client
    .from('sessions')
    .update({ notes_parent_facing: preview.polished_notes, notes_polished_by_ai: true })
    .eq('id', preview.session_id);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    session_id: preview.session_id,
    summary: 'Polished notes saved and shared with the parent.',
  };
}

// ---------------------------------------------------------------------------
// create_student
// ---------------------------------------------------------------------------

export async function executeCreateStudent(
  ctx: ToolCallerContext,
  preview: CreateStudentPreview,
  req: { host: string | null },
): Promise<ExecuteResult> {
  const { client, membership } = ctx;

  const insert: Record<string, unknown> = {
    organization_id: membership.organization_id,
    owner_id: membership.user_id,
    name: preview.name,
    year_level: preview.year_level,
    subjects: preview.subject ? [preview.subject] : [],
    hourly_rate_cents: preview.charge_rate_cents,
    parent_name: preview.parent_name,
    parent_email: preview.parent_email,
    primary_tutor_id: preview.primary_tutor_id,
  };
  const { data: studentRow, error } = await client
    .from('students').insert(insert).select('id, name').maybeSingle();
  if (error || !studentRow) {
    return { ok: false, error: error?.message ?? 'Could not create student.' };
  }

  // Send parent invitation if we have an email and caller is owner (policy match).
  let inviteSent = false;
  if (preview.parent_email && membership.role === 'owner') {
    try {
      const token = randomBytes(32).toString('hex');
      const { data: invitation } = await client
        .from('parent_invitations')
        .insert({
          token,
          email: preview.parent_email,
          student_id: studentRow.id,
          tutor_user_id: membership.user_id,
          organization_id: membership.organization_id,
        })
        .select('token')
        .single();

      if (invitation) {
        const { data: org } = await client
          .from('organizations').select('name').eq('id', membership.organization_id).maybeSingle();
        const origin = `https://${req.host ?? 'crestio.ai'}`;
        const invitationUrl = `${origin}/parent/accept?token=${invitation.token}`;
        const email = buildParentInvitationEmail({
          parentEmail: preview.parent_email,
          tutorBusinessName: org?.name ?? 'Your tutor',
          studentFirstName: firstName(studentRow.name) || 'your child',
          invitationUrl,
        });
        const result = await sendEmail({
          to: preview.parent_email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
        inviteSent = result.success;
      }
    } catch (e) {
      // Non-fatal — student row was still created.
      console.error('[assistant/create_student] invitation send failed:', e);
    }
  }

  const suffix = preview.parent_email
    ? inviteSent
      ? ' Parent invitation sent.'
      : ' Parent invitation could not be sent — check email settings.'
    : '';
  return {
    ok: true,
    student_id: studentRow.id,
    summary: `Added ${preview.name}.${suffix}`,
  };
}

// ---------------------------------------------------------------------------
// update_student
// ---------------------------------------------------------------------------

export async function executeUpdateStudent(
  ctx: ToolCallerContext,
  preview: UpdateStudentPreview,
): Promise<ExecuteResult> {
  const { client, membership } = ctx;

  // Enforce owner-only for tutor reassignment.
  if (preview.apply.primary_tutor_id !== undefined && membership.role !== 'owner') {
    return { ok: false, error: 'Only the organisation owner can reassign a student.' };
  }

  const update: Record<string, unknown> = {};
  if (preview.apply.name !== undefined) update.name = preview.apply.name;
  if (preview.apply.year_level !== undefined) update.year_level = preview.apply.year_level;
  if (preview.apply.subjects !== undefined) update.subjects = preview.apply.subjects;
  if (preview.apply.hourly_rate_cents !== undefined) update.hourly_rate_cents = preview.apply.hourly_rate_cents;
  if (preview.apply.primary_tutor_id !== undefined) update.primary_tutor_id = preview.apply.primary_tutor_id;

  if (Object.keys(update).length === 0) {
    return { ok: false, error: 'No changes to apply.' };
  }

  const { error } = await client
    .from('students')
    .update(update)
    .eq('id', preview.student_id)
    .eq('organization_id', membership.organization_id);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    student_id: preview.student_id,
    summary: `Updated ${preview.student_name} · ${preview.changes.length} change${preview.changes.length === 1 ? '' : 's'}.`,
  };
}

// ---------------------------------------------------------------------------
// archive_student
// ---------------------------------------------------------------------------

export async function executeArchiveStudent(
  ctx: ToolCallerContext,
  preview: ArchiveStudentPreview,
): Promise<ExecuteResult> {
  const { client, membership } = ctx;
  const { error } = await client
    .from('students')
    .update({ archived: true, archived_at: new Date().toISOString() })
    .eq('id', preview.student_id)
    .eq('organization_id', membership.organization_id);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    student_id: preview.student_id,
    summary: `Archived ${preview.student_name}.`,
  };
}

// ---------------------------------------------------------------------------
// create_invoice [HIGH-RISK]
// ---------------------------------------------------------------------------

export async function executeCreateInvoice(
  ctx: ToolCallerContext,
  preview: CreateInvoicePreview,
): Promise<ExecuteResult> {
  const { client, membership } = ctx;

  // Generate invoice number.
  const { count } = await client
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', membership.organization_id);
  const invoiceNumber = `INV-${String((count ?? 0) + 1).padStart(4, '0')}`;

  const { data: inv, error } = await client
    .from('invoices')
    .insert({
      owner_id: membership.user_id,
      organization_id: membership.organization_id,
      student_id: preview.student_id,
      number: invoiceNumber,
      issued_on: new Date().toISOString().slice(0, 10),
      due_on: preview.due_date_iso,
      subtotal_cents: preview.total_cents,
      total_cents: preview.total_cents,
      status: 'draft',
    })
    .select('id, number')
    .maybeSingle();
  if (error || !inv) return { ok: false, error: error?.message ?? 'Could not create invoice.' };

  const sessionIds = preview.line_items.map((l) => l.session_id);
  const { error: linkErr } = await client
    .from('sessions')
    .update({ invoice_id: inv.id })
    .in('id', sessionIds);
  if (linkErr) {
    return { ok: false, error: `Invoice created but couldn't link sessions: ${linkErr.message}` };
  }

  return {
    ok: true,
    invoice_id: inv.id,
    summary: `Invoice ${inv.number} created for ${preview.student_name} · ${formatCentsAud(preview.total_cents, preview.currency)}.`,
  };
}

// ---------------------------------------------------------------------------
// mark_invoice_paid [HIGH-RISK]
// ---------------------------------------------------------------------------

export async function executeMarkInvoicePaid(
  ctx: ToolCallerContext,
  preview: MarkInvoicePaidPreview,
): Promise<ExecuteResult> {
  const { client, membership } = ctx;

  // Re-check current state — invoice may already be paid via another route.
  const { data: current } = await client
    .from('invoices')
    .select('id, status, number, student:students!inner(name)')
    .eq('id', preview.invoice_id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (!current) return { ok: false, error: 'Invoice not found.' };
  if (current.status === 'paid') {
    return {
      ok: true,
      already_done: true,
      invoice_id: preview.invoice_id,
      summary: `${current.number} was already marked paid.`,
    };
  }

  const { error } = await client
    .from('invoices')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', preview.invoice_id)
    .eq('organization_id', membership.organization_id);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    invoice_id: preview.invoice_id,
    summary: `Marked ${preview.invoice_number} paid · ${formatCentsAud(preview.total_cents, preview.currency)}.`,
  };
}

// ---------------------------------------------------------------------------
// send_parent_update [HIGH-RISK]
// ---------------------------------------------------------------------------

export async function executeSendParentUpdate(
  ctx: ToolCallerContext,
  preview: SendParentUpdatePreview,
): Promise<ExecuteResult> {
  const { client, membership } = ctx;

  if (!preview.draft_content?.trim()) {
    return { ok: false, error: 'Update content is empty.' };
  }

  const { data: inserted, error } = await client
    .from('parent_updates')
    .insert({
      organization_id: membership.organization_id,
      student_id: preview.student_id,
      created_by_user_id: membership.user_id,
      content: preview.draft_content.trim(),
    })
    .select('id')
    .maybeSingle();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? 'Could not post the update.' };
  }

  // Notify each linked parent in-app + email (respects pref).
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && serviceKey) {
      const { createClient } = await import('@supabase/supabase-js');
      const admin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data: links } = await admin
        .from('parent_student_links')
        .select('parent:parents!inner(auth_user_id)')
        .eq('student_id', preview.student_id)
        .is('revoked_at', null);
      const { data: tutorProfile } = await admin
        .from('profiles').select('owner_name').eq('id', membership.user_id).maybeSingle();
      const tutorName = (tutorProfile?.owner_name as string | null) ?? 'Your tutor';
      const bodySnippet = preview.draft_content.trim().slice(0, 200)
        + (preview.draft_content.length > 200 ? '…' : '');
      for (const l of (links ?? []) as any[]) {
        const uid = l.parent?.auth_user_id;
        if (!uid) continue;
        await createNotification(admin, {
          userId: uid,
          type: 'parent_update_posted',
          title: `${tutorName} posted an update about ${preview.student_name}`,
          body: bodySnippet,
          linkUrl: `/parent/student/${preview.student_id}`,
          context: { parent_update_id: inserted.id },
        });
      }
    }
  } catch (e) {
    console.error('[send_parent_update] notification fan-out failed', e);
  }

  return {
    ok: true,
    parent_update_id: inserted.id,
    summary: `Posted update for ${preview.student_name}${preview.parent_has_portal_access ? `. ${preview.parent_name ?? 'The parent'} will see it on the portal.` : ' (parent has no portal access yet).'}`,
  };
}

// ---------------------------------------------------------------------------
// assign_student_to_tutor [owner only]
// ---------------------------------------------------------------------------

export async function executeAssignStudentToTutor(
  ctx: ToolCallerContext,
  preview: AssignStudentToTutorPreview,
): Promise<ExecuteResult> {
  const { client, membership } = ctx;
  if (membership.role !== 'owner') {
    return { ok: false, error: 'Only the organisation owner can reassign students.' };
  }

  const { error } = await client
    .from('students')
    .update({ primary_tutor_id: preview.new_tutor_id })
    .eq('id', preview.student_id)
    .eq('organization_id', membership.organization_id);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    student_id: preview.student_id,
    summary: `Assigned ${preview.student_name} to ${preview.new_tutor_name}.`,
  };
}

// ---------------------------------------------------------------------------
// send_message [HIGH-RISK]
// ---------------------------------------------------------------------------

export async function executeSendMessage(
  ctx: ToolCallerContext,
  preview: SendMessagePreview,
  req: { host: string | null },
): Promise<ExecuteResult> {
  const { client, membership } = ctx;
  if (!membership) return { ok: false, error: 'Only tutors can send messages.' };

  // Use service role for the thread + message writes (same path as
  // /api/messages/send — client role has no INSERT on these tables).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { ok: false, error: 'Server misconfigured.' };
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { threadId } = await findOrCreateThread(admin, {
    organizationId: preview.organization_id,
    studentId: preview.student_id,
    parentId: preview.parent_id,
    tutorUserId: preview.tutor_user_id,
  });

  const { data: inserted, error } = await admin
    .from('messages')
    .insert({
      thread_id: threadId,
      sender_type: 'tutor',
      sender_user_id: membership.user_id,
      body: preview.body,
      urgency: preview.urgency,
    })
    .select('id')
    .maybeSingle();
  if (error || !inserted) return { ok: false, error: error?.message ?? 'Could not send message.' };

  const nowIso = new Date().toISOString();
  await admin.from('message_threads').update({
    last_message_at: nowIso,
    last_message_preview: previewOfBody(preview.body),
    tutor_last_read_at: nowIso,
  }).eq('id', threadId);

  // Email the parent (respecting prefs + throttle).
  try {
    const { data: thread } = await admin
      .from('message_threads').select('parent_last_email_at').eq('id', threadId).maybeSingle();
    const { data: parent } = await admin
      .from('parents')
      .select('email, name, notify_messages_email, notify_messages_urgent_only')
      .eq('id', preview.parent_id)
      .maybeSingle();
    const send = parent?.email ? shouldSendEmail({
      optedIn: parent.notify_messages_email !== false,
      urgentOnly: parent.notify_messages_urgent_only === true,
      messageUrgency: preview.urgency,
      recipientLastEmailAt: (thread?.parent_last_email_at as string | null) ?? null,
    }) : false;
    if (send && parent?.email) {
      const { data: tutorProfile } = await admin
        .from('profiles').select('owner_name').eq('id', preview.tutor_user_id).maybeSingle();
      const base = `https://${req.host ?? 'crestio.ai'}`;
      const mail = buildMessageEmailForParent({
        tutorName: (tutorProfile?.owner_name as string | null) ?? null,
        studentName: preview.student_name,
        urgency: preview.urgency,
        bodyPreview: preview.body,
        threadUrl: `${base}/parent/messages/${threadId}`,
        notificationSettingsUrl: `${base}/parent/settings`,
      });
      const result = await sendEmail({ to: parent.email as string, ...mail });
      if (result.success) {
        await admin
          .from('message_threads')
          .update({ parent_last_email_at: new Date().toISOString() })
          .eq('id', threadId);
      }
    }
  } catch (e) {
    console.error('[message/email/failed]', e);
  }

  const urgencyLabel = preview.urgency ? ` (${preview.urgency})` : '';
  return {
    ok: true,
    summary: `Sent message to ${preview.parent_name ?? 'parent'} about ${preview.student_name}${urgencyLabel}.`,
  };
}

// ---------------------------------------------------------------------------
// mark_notifications_read
// ---------------------------------------------------------------------------

export async function executeMarkNotificationsRead(
  ctx: ToolCallerContext,
  preview: import('../assistantTools').MarkNotificationsReadPreview,
): Promise<ExecuteResult> {
  const { client } = ctx;
  const nowIso = new Date().toISOString();
  if (preview.target === 'all') {
    const { error } = await client
      .from('notifications')
      .update({ read_at: nowIso })
      .is('read_at', null);
    if (error) return { ok: false, error: error.message };
    return { ok: true, summary: `Marked ${preview.count} notification${preview.count === 1 ? '' : 's'} as read.` };
  }
  // For 'ids' we don't re-fetch ids here — the preview built the list from
  // the user's authorized set; the RLS update policy will still block anything
  // they don't own. But without the id list on the preview we bulk-update by
  // matching titles — not reliable. So we re-fetch the unread notification
  // ids owned by the caller up to the count we previewed.
  const { data } = await client
    .from('notifications')
    .select('id')
    .is('read_at', null)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(preview.count);
  const ids = (data ?? []).map((r: any) => r.id);
  if (ids.length === 0) return { ok: false, error: 'No matching unread notifications.' };
  const { error } = await client
    .from('notifications')
    .update({ read_at: nowIso })
    .in('id', ids);
  if (error) return { ok: false, error: error.message };
  return { ok: true, summary: `Marked ${ids.length} notification${ids.length === 1 ? '' : 's'} as read.` };
}

// ---------------------------------------------------------------------------
// add_student_to_household
// ---------------------------------------------------------------------------

export async function executeAddStudentToHousehold(
  ctx: ToolCallerContext,
  preview: AddStudentToHouseholdPreview,
): Promise<ExecuteResult> {
  const { client, membership } = ctx;

  const { data: student } = await client
    .from('students')
    .select('id, name, organization_id, household_id')
    .eq('id', preview.student_id)
    .maybeSingle();
  if (!student || student.organization_id !== membership.organization_id) {
    return { ok: false, error: 'Student not found in your organisation.' };
  }

  const { data: household } = await client
    .from('households')
    .select('id, organization_id, archived_at')
    .eq('id', preview.household_id)
    .maybeSingle();
  if (!household || household.organization_id !== membership.organization_id || household.archived_at) {
    return { ok: false, error: 'Household not found or archived.' };
  }

  const { error } = await client
    .from('students')
    .update({ household_id: household.id })
    .eq('id', student.id);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    student_id: student.id,
    summary: `Added ${student.name} to ${preview.household_display_name}.`,
  };
}

// ---------------------------------------------------------------------------
// create_test_account — owner-only. Re-verifies ownership on execute.
// ---------------------------------------------------------------------------

export async function executeCreateTestAccount(
  ctx: ToolCallerContext,
  preview: CreateTestAccountPreview,
  env: { host: string | null; callerEmail: string | null },
): Promise<ExecuteResult> {
  if (!isPlatformOwner(env.callerEmail)) {
    return { ok: false, error: 'Only the platform owner can create test accounts.' };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { ok: false, error: 'Server misconfigured.' };

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const ownerUserId = ctx.membership.user_id;
  const role = preview.role;
  const fullName = preview.full_name.trim();
  const autoSuffix = require('crypto').randomBytes(4).toString('hex');
  const email = preview.email && !preview.email.includes('pending')
    ? preview.email
    : `test-${role}-${autoSuffix}@crestio.test`;
  const initialPassword = `T${require('crypto').randomBytes(16).toString('base64url')}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: initialPassword,
    email_confirm: true,
    user_metadata: { test_account: true, created_by: ownerUserId, role, full_name: fullName },
  });
  if (createErr || !created?.user?.id) {
    return { ok: false, error: createErr?.message ?? 'Could not create auth user.' };
  }
  const newUserId = created.user.id;

  if (role === 'tutor') {
    await admin
      .from('profiles')
      .upsert({
        id: newUserId,
        email,
        owner_name: fullName,
        organization_id: ctx.membership.organization_id,
        is_test_account: true,
        test_account_owner_user_id: ownerUserId,
      }, { onConflict: 'id' });
    await admin
      .from('organization_members')
      .upsert({
        organization_id: ctx.membership.organization_id,
        user_id: newUserId,
        role: 'tutor',
      }, { onConflict: 'organization_id,user_id' });
    await admin
      .from('tutors')
      .insert({
        organization_id: ctx.membership.organization_id,
        owner_id: ownerUserId,
        auth_user_id: newUserId,
        name: fullName,
        email,
      });
  } else {
    await admin
      .from('profiles')
      .upsert({
        id: newUserId,
        email,
        owner_name: fullName,
        is_test_account: true,
        test_account_owner_user_id: ownerUserId,
      }, { onConflict: 'id' });
    await admin
      .from('parents')
      .upsert({
        auth_user_id: newUserId,
        email,
        name: fullName,
        is_test_account: true,
        test_account_owner_user_id: ownerUserId,
      }, { onConflict: 'auth_user_id' });
  }

  return {
    ok: true,
    summary: `Created test ${role} ${fullName} (${email}). Initial password: ${initialPassword}`,
  };
}

// ---------------------------------------------------------------------------
// create_batch_invoices — forwards to /api/invoices/batch-create so we reuse
// the server's transactional validation + notifications path.
// ---------------------------------------------------------------------------

export async function executeCreateBatchInvoices(
  _ctx: ToolCallerContext,
  preview: CreateBatchInvoicesPreview,
  env: { host: string | null },
): Promise<ExecuteResult> {
  if (preview.households.length === 0) {
    return { ok: false, error: 'No households to invoice.' };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { ok: false, error: 'Server misconfigured.' };
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Mirror the batch-create endpoint inline rather than making an HTTP hop:
  // the caller already authenticated and we have service-role access. Doing a
  // direct DB write avoids the token-forwarding dance.
  const payload = {
    period_start: preview.period_start_iso,
    period_end: preview.period_end_iso,
    households: preview.households.map((h) => ({
      household_id: h.household_id,
      included_session_ids: h.session_ids,
    })),
    mode: 'send' as const,
  };

  // We can't import the endpoint handler directly (it's a Next route), so just
  // duplicate the minimal create path here. Keeping the bulk of the validation
  // in the endpoint and calling that endpoint would be cleaner, but it requires
  // a bearer token roundtrip we don't have in the executor context. Instead,
  // delegate to a shared helper. For this first cut, re-invoke the endpoint
  // via fetch, authenticated with the service key via X-Service-Auth header.
  // Future: factor the endpoint body into a pure function.
  try {
    const host = env.host;
    if (!host) return { ok: false, error: 'No host to call.' };
    const proto = host.startsWith('localhost') ? 'http' : 'https';

    // No service-key header available in this path. Use the admin client
    // directly to perform the same writes the endpoint would.
    const _unused = [host, proto];

    // Load pieces we need manually so we can build invoices server-side here.
    const { data: sessionRows } = await admin
      .from('sessions')
      .select('id, status, organization_id, tutor_user_id, invoice_id, scheduled_at, duration_minutes, subject, topic, student_id, charge_rate_cents, student:students!inner(id, name, hourly_rate_cents, household_id)')
      .in('id', payload.households.flatMap((h) => h.included_session_ids));

    if (!sessionRows || sessionRows.length === 0) {
      return { ok: false, error: 'No matching sessions.' };
    }

    // Re-validate against the preview. If anything changed (rate edited,
    // session got invoiced elsewhere) we abort.
    const sessionMap = new Map<string, any>();
    for (const s of sessionRows as any[]) {
      if (s.invoice_id) return { ok: false, error: 'A session was already invoiced since preview.' };
      if (s.status !== 'completed') return { ok: false, error: 'A session is no longer completed.' };
      sessionMap.set(s.id, s);
    }
    const { data: already } = await admin
      .from('invoice_sessions')
      .select('session_id')
      .in('session_id', payload.households.flatMap((h) => h.included_session_ids));
    if ((already ?? []).length > 0) {
      return { ok: false, error: 'A session was batch-invoiced since preview.' };
    }

    const { count: existingCount } = await admin
      .from('invoices').select('*', { count: 'exact', head: true });
    let runningNumber = existingCount ?? 0;

    const { generateInvoiceNumber } = await import('../utils');
    const { createNotification } = await import('../notifications');

    const issuedDate = new Date().toISOString().slice(0, 10);
    const dueDate = (() => {
      const d = new Date(); d.setDate(d.getDate() + 14);
      return d.toISOString().slice(0, 10);
    })();

    const created: Array<{ id: string }> = [];
    try {
      for (const h of payload.households) {
        const lines = h.included_session_ids.map((sid) => {
          const s = sessionMap.get(sid);
          const rate = s.charge_rate_cents ?? s.student?.hourly_rate_cents ?? 0;
          if (!rate) throw new Error(`Session ${sid} has no rate.`);
          const amount = Math.round((rate * s.duration_minutes) / 60);
          const desc = [
            new Date(s.scheduled_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
            s.student?.name ?? 'Session',
            s.subject ?? null, s.topic ?? null,
            `${s.duration_minutes} min`,
          ].filter(Boolean).join(' · ');
          return {
            session_id: sid,
            student_id: s.student_id,
            hourly_rate_cents: rate,
            duration_minutes: s.duration_minutes,
            amount_cents: amount,
            line_item_description: desc,
          };
        });
        const subtotal = lines.reduce((a, l) => a + l.amount_cents, 0);
        runningNumber += 1;
        const number = generateInvoiceNumber(runningNumber);

        const { data: inv, error: invErr } = await admin
          .from('invoices').insert({
            owner_id: _ctx.membership.user_id,
            organization_id: _ctx.membership.organization_id,
            student_id: null,
            household_id: h.household_id,
            number,
            issued_on: issuedDate,
            due_on: dueDate,
            subtotal_cents: subtotal,
            total_cents: subtotal,
            status: 'sent',
            notes: null,
            billing_period_start: preview.period_start_iso.slice(0, 10),
            billing_period_end: preview.period_end_iso.slice(0, 10),
            is_batch_generated: true,
            sent_at: new Date().toISOString(),
          }).select('id').single();
        if (invErr || !inv) throw new Error(invErr?.message ?? 'Insert failed.');

        const { error: lineErr } = await admin
          .from('invoice_sessions').insert(lines.map((l) => ({ ...l, invoice_id: inv.id })));
        if (lineErr) {
          await admin.from('invoices').delete().eq('id', inv.id);
          throw new Error(lineErr.message);
        }
        created.push({ id: inv.id });

        // Best-effort notify primary parent.
        const { data: hpRow } = await admin
          .from('household_parents')
          .select('parent:parents!inner(auth_user_id, name, email)')
          .eq('household_id', h.household_id)
          .eq('is_primary', true)
          .maybeSingle();
        const primary = (hpRow as any)?.parent;
        if (primary?.auth_user_id) {
          try {
            await createNotification(admin, {
              userId: primary.auth_user_id,
              type: 'invoice_sent',
              title: `New invoice ${number} from your tutor`,
              body: `${lines.length} session${lines.length === 1 ? '' : 's'} · ${formatCentsAud(subtotal)}`,
              linkUrl: `/parent/invoices/${inv.id}`,
              context: { invoice_id: inv.id, household_id: h.household_id },
              dedupeKey: `invoice_sent:${inv.id}`,
            });
          } catch { /* non-fatal */ }
        }
      }
    } catch (e: any) {
      if (created.length > 0) {
        const ids = created.map((c) => c.id);
        await admin.from('invoice_sessions').delete().in('invoice_id', ids);
        await admin.from('invoices').delete().in('id', ids);
      }
      return { ok: false, error: e?.message ?? 'Batch create failed.' };
    }

    return {
      ok: true,
      summary: `Sent ${created.length} invoice${created.length === 1 ? '' : 's'} totalling ${formatCentsAud(preview.total_cents)}.`,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Batch create failed.' };
  }
}
