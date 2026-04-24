-- Session 13F — Notifications system.
-- In-app feed + email delivery + cron-backed reminders.
-- Dispatch log makes cron idempotent via a dedupe_key column.

BEGIN;

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'session_reminder_1h',
    'session_reminder_24h',
    'session_rescheduled',
    'session_cancelled',
    'reschedule_requested',
    'reschedule_accepted',
    'reschedule_rejected',
    'message_received',
    'message_urgent',
    'invoice_sent',
    'invoice_paid',
    'invoice_overdue',
    'parent_update_posted',
    'tutor_invited',
    'tutor_joined',
    'payment_failed',
    'trial_ending',
    'subscription_cancelled'
  )),
  title TEXT NOT NULL,
  body TEXT NULL,
  link_url TEXT NULL,
  context JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ NULL,
  dismissed_at TIMESTAMPTZ NULL,
  email_sent_at TIMESTAMPTZ NULL,
  email_skipped_reason TEXT NULL
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications(user_id, created_at DESC)
  WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_user_recent_idx
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_type_idx
  ON public.notifications(type, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_session_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_reschedule_events BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_invoice_events BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_overdue_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_trial_and_billing BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS notify_session_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_reschedule_events BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_invoice_events BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_parent_updates BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS public.notification_dispatch_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dedupe_key TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_dispatch_key_idx
  ON public.notification_dispatch_log(dedupe_key);
CREATE INDEX IF NOT EXISTS notification_dispatch_user_idx
  ON public.notification_dispatch_log(user_id, dispatched_at DESC);

ALTER TABLE public.notification_dispatch_log ENABLE ROW LEVEL SECURITY;
-- No policies — server-only.

COMMIT;
