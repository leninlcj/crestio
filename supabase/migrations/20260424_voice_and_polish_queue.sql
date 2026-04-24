-- Session 13C — voice capture infrastructure + polish queue.

BEGIN;

-- Voice usage tracking per user per day.
CREATE TABLE IF NOT EXISTS public.voice_usage_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  transcription_count INTEGER NOT NULL DEFAULT 0,
  audio_seconds_total INTEGER NOT NULL DEFAULT 0,
  cost_cents_total INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS voice_usage_user_date_idx
  ON public.voice_usage_daily(user_id, usage_date DESC);

ALTER TABLE public.voice_usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS voice_usage_select_own ON public.voice_usage_daily;
CREATE POLICY voice_usage_select_own ON public.voice_usage_daily
  FOR SELECT USING (user_id = auth.uid());

-- Short-term transcription log (30-day retention via cron).
CREATE TABLE IF NOT EXISTS public.voice_transcriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  context TEXT NOT NULL CHECK (context IN ('session_note', 'assistant_command')),
  audio_seconds INTEGER NOT NULL,
  transcript TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS voice_transcriptions_user_idx
  ON public.voice_transcriptions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_transcriptions_created_idx
  ON public.voice_transcriptions(created_at);

ALTER TABLE public.voice_transcriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS voice_transcriptions_select_own ON public.voice_transcriptions;
CREATE POLICY voice_transcriptions_select_own ON public.voice_transcriptions
  FOR SELECT USING (user_id = auth.uid());

-- Batch polish: explicit skip flag so the polish queue doesn't re-surface
-- sessions the tutor deliberately decided not to polish.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS polish_skipped BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS sessions_polish_queue_idx
  ON public.sessions(organization_id, scheduled_at DESC)
  WHERE status = 'completed'
    AND notes_parent_facing IS NULL
    AND polish_skipped = FALSE;

COMMIT;
