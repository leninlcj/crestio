// Central notifications helper. Every in-app notification and every email
// dispatch flows through here so we have one place to apply dedupe +
// preference checks + email-throttling logic.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from './email';
import {
  type NotificationEmailPayload,
  buildNotificationEmail,
} from './emails/notifications';

export type NotificationType =
  | 'session_reminder_1h'
  | 'session_reminder_24h'
  | 'session_rescheduled'
  | 'session_cancelled'
  | 'reschedule_requested'
  | 'reschedule_accepted'
  | 'reschedule_rejected'
  | 'message_received'
  | 'message_urgent'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'invoice_overdue'
  | 'parent_update_posted'
  | 'tutor_invited'
  | 'tutor_joined'
  | 'payment_failed'
  | 'trial_ending'
  | 'subscription_cancelled';

// Per-type → which preference column gates the email. `always` means the
// email fires regardless of prefs (account-security / messaging already
// gated by their own prefs elsewhere).
type PrefGate =
  | { kind: 'always' }
  | { kind: 'profile_col'; col: string }
  | { kind: 'parent_col'; col: string }
  | { kind: 'either'; profileCol?: string; parentCol?: string };

const PREF_MAP: Record<NotificationType, PrefGate> = {
  // Session reminders — profile col for tutors, parent col for parents.
  session_reminder_1h:  { kind: 'either', profileCol: 'notify_session_reminders', parentCol: 'notify_session_reminders' },
  session_reminder_24h: { kind: 'either', profileCol: 'notify_session_reminders', parentCol: 'notify_session_reminders' },
  // Reschedules / cancellations
  session_rescheduled:  { kind: 'either', profileCol: 'notify_reschedule_events', parentCol: 'notify_reschedule_events' },
  session_cancelled:    { kind: 'either', profileCol: 'notify_reschedule_events', parentCol: 'notify_reschedule_events' },
  reschedule_requested: { kind: 'either', profileCol: 'notify_reschedule_events', parentCol: 'notify_reschedule_events' },
  reschedule_accepted:  { kind: 'either', profileCol: 'notify_reschedule_events', parentCol: 'notify_reschedule_events' },
  reschedule_rejected:  { kind: 'either', profileCol: 'notify_reschedule_events', parentCol: 'notify_reschedule_events' },
  // Messaging uses its own 13E prefs; we treat those as always-on at this
  // layer because the caller has already applied the per-message throttle
  // and urgent-only filter (see pages/api/messages/send.ts).
  message_received:     { kind: 'always' },
  message_urgent:       { kind: 'always' },
  // Invoices
  invoice_sent:    { kind: 'either', profileCol: 'notify_invoice_events', parentCol: 'notify_invoice_events' },
  invoice_paid:    { kind: 'profile_col', col: 'notify_invoice_events' },
  invoice_overdue: { kind: 'profile_col', col: 'notify_overdue_alerts' },
  // Parent updates go TO parents.
  parent_update_posted: { kind: 'parent_col', col: 'notify_parent_updates' },
  // Account / security — always email.
  tutor_invited:         { kind: 'always' },
  tutor_joined:          { kind: 'always' },
  // Billing / subscription — tutor-side only.
  payment_failed:         { kind: 'profile_col', col: 'notify_trial_and_billing' },
  trial_ending:           { kind: 'profile_col', col: 'notify_trial_and_billing' },
  subscription_cancelled: { kind: 'profile_col', col: 'notify_trial_and_billing' },
};

// ---------------------------------------------------------------------------
// Does this notification type warrant a "urgent/claret" UI treatment?
// ---------------------------------------------------------------------------
export function isUrgentNotificationType(t: NotificationType): boolean {
  return t === 'message_urgent' || t === 'payment_failed' || t === 'invoice_overdue';
}

// ---------------------------------------------------------------------------
// Resolve recipient's email + pref column value. Checks profiles first,
// falls back to parents (a user may be both, but profiles represents their
// tutor/owner identity; parents is the parent-portal identity).
// ---------------------------------------------------------------------------
async function resolveRecipient(
  admin: SupabaseClient,
  userId: string,
): Promise<{
  kind: 'profile' | 'parent' | 'none';
  email: string | null;
  locale: string | null;
  prefs: Record<string, boolean>;
}> {
  const { data: profile } = await admin
    .from('profiles')
    .select('email, locale, notify_session_reminders, notify_reschedule_events, notify_invoice_events, notify_overdue_alerts, notify_trial_and_billing')
    .eq('id', userId)
    .maybeSingle();
  if (profile?.email) {
    return {
      kind: 'profile',
      email: (profile.email as string) ?? null,
      locale: (profile as any).locale ?? null,
      prefs: profile as any,
    };
  }
  const { data: parent } = await admin
    .from('parents')
    .select('email, locale, notify_session_reminders, notify_reschedule_events, notify_invoice_events, notify_parent_updates')
    .eq('auth_user_id', userId)
    .maybeSingle();
  if (parent?.email) {
    return {
      kind: 'parent',
      email: (parent.email as string) ?? null,
      locale: (parent as any).locale ?? null,
      prefs: parent as any,
    };
  }
  return { kind: 'none', email: null, locale: null, prefs: {} };
}

function shouldEmail(
  type: NotificationType,
  recipientKind: 'profile' | 'parent' | 'none',
  prefs: Record<string, boolean>,
): boolean {
  if (recipientKind === 'none') return false;
  const gate = PREF_MAP[type];
  if (gate.kind === 'always') return true;
  if (gate.kind === 'profile_col') {
    return recipientKind === 'profile' && prefs[gate.col] !== false;
  }
  if (gate.kind === 'parent_col') {
    return recipientKind === 'parent' && prefs[gate.col] !== false;
  }
  // 'either'
  if (recipientKind === 'profile' && gate.profileCol) return prefs[gate.profileCol] !== false;
  if (recipientKind === 'parent' && gate.parentCol) return prefs[gate.parentCol] !== false;
  return false;
}

// ---------------------------------------------------------------------------
// Core createNotification
// ---------------------------------------------------------------------------

export type CreateNotificationResult =
  | { ok: true; notification_id: string; email_sent: boolean; skipped_reason: string | null }
  | { ok: false; reason: 'dedupe' | 'error'; error?: string };

export async function createNotification(
  admin: SupabaseClient,
  params: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string | null;
    linkUrl?: string | null;
    context?: Record<string, any> | null;
    dedupeKey?: string | null;
    emailOverride?: boolean;                 // force-skip email
    emailPayload?: NotificationEmailPayload; // override auto-composed email
    baseUrl?: string;                        // for building links in emails
  },
): Promise<CreateNotificationResult> {
  const {
    userId, type, title, body = null, linkUrl = null, context = null,
    dedupeKey = null, emailOverride, emailPayload,
  } = params;

  // Dedupe check up-front. Using INSERT with ON-CONFLICT-DO-NOTHING would be
  // cleaner but PostgREST doesn't expose that cleanly; a two-step is fine.
  if (dedupeKey) {
    const { data: existing } = await admin
      .from('notification_dispatch_log')
      .select('id')
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();
    if (existing) return { ok: false, reason: 'dedupe' };
  }

  // Resolve recipient + email-eligibility before we insert, so we can stamp
  // email_sent_at / email_skipped_reason correctly.
  const recipient = await resolveRecipient(admin, userId);
  let emailSent = false;
  let skippedReason: string | null = null;
  let emailSentAt: string | null = null;

  const wantsEmail = emailOverride !== false && shouldEmail(type, recipient.kind, recipient.prefs);

  if (emailOverride === false) {
    skippedReason = 'caller_override';
  } else if (!wantsEmail) {
    skippedReason = recipient.kind === 'none' ? 'no_recipient' : 'user_preference';
  } else if (!recipient.email) {
    skippedReason = 'no_recipient';
  }

  // Insert the in-app row.
  const { data: inserted, error } = await admin
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      title,
      body,
      link_url: linkUrl,
      context,
    })
    .select('id')
    .maybeSingle();
  if (error || !inserted) {
    return { ok: false, reason: 'error', error: error?.message ?? 'Could not create notification.' };
  }

  // Log dispatch BEFORE sending email. If the email fails we still want the
  // dedupe row so a retry doesn't double-fire the in-app notification.
  if (dedupeKey) {
    await admin.from('notification_dispatch_log').insert({
      dedupe_key: dedupeKey,
      user_id: userId,
      notification_type: type,
    });
  }

  // Send email if eligible.
  if (wantsEmail && recipient.email) {
    try {
      const payload = emailPayload ?? await buildNotificationEmail({
        type, title, body, linkUrl: linkUrl ?? null,
        baseUrl: params.baseUrl ?? 'https://crestio.ai',
        recipientIsParent: recipient.kind === 'parent',
        recipientLocale: recipient.locale ?? 'en',
      });
      const result = await sendEmail({
        to: recipient.email,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });
      if (result.success) {
        emailSent = true;
        emailSentAt = new Date().toISOString();
      } else {
        skippedReason = 'email_failed';
        console.error('[notifications] email send failed', result.error);
      }
    } catch (e: any) {
      skippedReason = 'email_failed';
      console.error('[notifications] email threw', e?.message ?? e);
    }
  }

  // Stamp email status on the notification row.
  await admin
    .from('notifications')
    .update({
      email_sent_at: emailSentAt,
      email_skipped_reason: skippedReason,
    })
    .eq('id', inserted.id);

  return {
    ok: true,
    notification_id: inserted.id as string,
    email_sent: emailSent,
    skipped_reason: skippedReason,
  };
}

// ---------------------------------------------------------------------------
// Fetch unread count — used by the bell badge polling endpoint.
// ---------------------------------------------------------------------------
export async function countUnread(
  client: SupabaseClient,
): Promise<number> {
  const { count } = await client
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
    .is('dismissed_at', null);
  return count ?? 0;
}
