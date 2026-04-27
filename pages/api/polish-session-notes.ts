import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { LESSON_NOTES_POLISH_DAILY_LIMIT } from '../../lib/rateLimits';
import { getOrganizationIdForUser } from '../../lib/organization';
import { getMembershipForUser } from '../../lib/membership';
import { isOrgBillingOk } from '../../lib/billing';
import { checkRateLimit, LIMITS } from '../../lib/rateLimit';
import { LOCALE_AI_NAME, isSupportedLocale } from '../../lib/i18n';
import { callAI } from '../../lib/ai/router';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('polish-session-notes: ANTHROPIC_API_KEY missing');
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in the server environment.' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('polish-session-notes: Supabase env vars missing');
    return res.status(500).json({ error: 'Server misconfigured: Supabase env vars missing.' });
  }

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token.' });
  }

  const supaClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await supaClient.auth.getUser(token);
  if (authErr || !userData?.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  const userId = userData.user.id;
  const organizationId = await getOrganizationIdForUser(supaClient, userId);
  if (!organizationId) {
    console.error('polish-session-notes: no organization for user', userId);
    return res.status(500).json({ error: 'No organization found for this account.' });
  }
  const membership = await getMembershipForUser(supaClient, userId);
  const { data: callerProfile } = await supaClient
    .from('profiles').select('locale').eq('id', userId).maybeSingle();
  const callerLocale = isSupportedLocale(callerProfile?.locale) ? callerProfile!.locale! : 'en';

  const billing = await isOrgBillingOk(supaClient, organizationId);
  if (!billing.ok) {
    return res.status(402).json({
      error: 'subscription_required',
      reason: billing.reason,
      checkout_url_hint: '/app/settings?tab=billing',
    });
  }

  const rl = checkRateLimit({
    key: `polish:${userId}`,
    limit: LIMITS.polish.limit,
    windowMs: LIMITS.polish.windowMs,
  });
  if (!rl.allowed) {
    return res.status(429).json({ error: 'rate_limit', retry_after_seconds: rl.retry_after_seconds });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawNotes = typeof body.rawNotes === 'string' ? body.rawNotes.trim() : '';
  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  const durationRaw = body.durationMinutes;
  const durationMinutes =
    typeof durationRaw === 'number' && Number.isFinite(durationRaw) && durationRaw > 0
      ? durationRaw
      : typeof durationRaw === 'string' && durationRaw.trim() !== '' && Number(durationRaw) > 0
        ? Number(durationRaw)
        : 0;
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const sessionId = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : null;
  const mode = typeof body.mode === 'string' ? body.mode : 'polish';

  // mode=reply: short, friendly acknowledgement of an incoming parent message.
  // No student/session lookups required — runs straight against the AI router.
  if (mode === 'reply') {
    const incoming = typeof body.incomingText === 'string' ? body.incomingText.trim() : '';
    if (!incoming) return res.status(400).json({ error: 'incomingText required for reply mode.' });
    const replyPrompt = `You are a tutor replying to a parent message. The parent wrote:\n"""\n${incoming}\n"""\n\nWrite a short, warm acknowledgement (1-2 sentences, max 200 chars). Confirm you've seen the message, and indicate next steps if the parent asked a question. No greeting like "Hi [name]" — go straight to the point. No sign-off.`;
    try {
      const aiResult = await callAI({
        task: 'polish',
        userPrompt: replyPrompt,
        maxTokens: 200,
        userId,
        organizationId,
      });
      return res.status(200).json({ polishedNotes: (aiResult.text ?? '').trim() });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message ?? 'reply failed' });
    }
  }

  if (!rawNotes || rawNotes.length < 5) {
    return res.status(400).json({ error: 'rawNotes is required and must be at least 5 characters.' });
  }
  if (rawNotes.length > 5000) {
    return res.status(400).json({ error: 'rawNotes is too long (max 5000 characters).' });
  }
  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required.' });
  }
  if (!durationMinutes) {
    return res.status(400).json({ error: 'durationMinutes is required and must be greater than 0.' });
  }

  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data: recent, error: rateErr } = await supaClient
    .from('notes_polish_log')
    .select('created_at')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: true });
  if (rateErr) {
    console.error('polish-session-notes: rate limit check failed', rateErr);
    return res.status(500).json({ error: `Could not verify rate limit: ${rateErr.message}` });
  }
  const used = recent?.length ?? 0;
  if (used >= LESSON_NOTES_POLISH_DAILY_LIMIT) {
    const oldest = recent?.[0]?.created_at;
    let hoursUntilReset = 24;
    if (oldest) {
      const resetAt = new Date(oldest).getTime() + WINDOW_MS;
      hoursUntilReset = Math.max(1, Math.ceil((resetAt - Date.now()) / (60 * 60 * 1000)));
    }
    return res.status(429).json({
      error: 'rate_limit_exceeded',
      message: `You've used your ${LESSON_NOTES_POLISH_DAILY_LIMIT} daily note polishes. Try again in ${hoursUntilReset} hour${hoursUntilReset === 1 ? '' : 's'}.`,
      hoursUntilReset,
    });
  }

  const { data: student, error: studentErr } = await supaClient
    .from('students')
    .select('name, year_level')
    .eq('id', studentId)
    .eq('organization_id', organizationId)
    .single();
  if (studentErr || !student) {
    console.error('polish-session-notes: student lookup failed', studentErr);
    return res.status(400).json({ error: 'Student not found or you do not have access to it.' });
  }

  const rawName = (student as any).name ?? '';
  const firstName = rawName.trim().split(/\s+/)[0] || 'the student';
  const yearLevel = (student as any).year_level ?? '';

  const studentLine = [
    `Student: ${firstName}`,
    yearLevel ? `Year ${yearLevel}` : '',
    subject || '',
  ].filter(Boolean).join(', ');

  const systemPrompt = `You are a professional tutor polishing rough session notes into a clear report for the student's parent. Parents skim — they want to know what happened, whether their child is progressing, and what's next.

Write in flowing prose. Short paragraphs (2-4 sentences). No bullets, no headings, no numbered lists. Do not invent details not present in the source notes — if the tutor didn't mention it, don't add it.

Voice: confident, warm, specific. You are not a customer service email. You are a tutor who cares about the student and is reporting honestly to a parent who is paying for your expertise.

Structure:
- First paragraph (1-3 sentences): what the session covered and the student's overall engagement.
- Second paragraph if warranted (1-3 sentences): specific strengths or struggles observed.
- Third paragraph if warranted (1-2 sentences): homework, next session focus, or anything the parent should know.

Length: 60-140 words for typical input. Never exceed 180 words. If the input is very short (one line), the output is also short (1-2 sentences).

Write in ${LOCALE_AI_NAME[callerLocale]}. Use natural phrasing for that language — do not translate English idioms literally. Apply regional conventions (currency words, date forms, politeness markers) that fit naturally.
${callerLocale === 'en' ? "Australian English. " : ''}No em-dashes (use commas or periods instead — parents don't notice em-dashes, but they do notice AI patterns). Avoid hollow AI tells like 'engaged well', 'made excellent progress', 'demonstrated strong understanding'. Use specific observations from the notes.

Do NOT start with 'In today's session', 'Today we covered', or similar opener phrases. Vary sentence openings naturally.

Context for this session:
${studentLine}
Session length: ${durationMinutes} minutes

Tutor's rough notes:
${rawNotes}

Output only the polished notes. No preamble.`;

  try {
    const aiResult = await callAI({
      task: 'polish',
      userPrompt: systemPrompt,
      maxTokens: 800,
      userId,
      organizationId,
    });
    const polishedNotes = aiResult.text;
    if (!polishedNotes) {
      console.error('polish-session-notes: empty response from router');
      return res.status(502).json({ error: 'Empty response from model.' });
    }

    // Auto-share: if the caller supplied a sessionId, persist the polished text
    // straight to notes_parent_facing. RLS via owner_id ensures only the tutor
    // who owns the session can update it.
    if (sessionId) {
      // Tutors can only polish their own sessions.
      if (membership?.role === 'tutor') {
        const { data: sessionRow } = await supaClient
          .from('sessions')
          .select('tutor_user_id')
          .eq('id', sessionId)
          .maybeSingle();
        if (!sessionRow || (sessionRow as any).tutor_user_id !== userId) {
          return res.status(403).json({ error: 'You can only polish your own sessions.' });
        }
      }
      const { data: updated, error: updateErr } = await supaClient
        .from('sessions')
        .update({
          notes_parent_facing: polishedNotes,
          notes_polished_by_ai: true,
        })
        .eq('id', sessionId)
        .eq('organization_id', organizationId)
        .select('id');
      if (updateErr) {
        console.error('polish-session-notes: session update failed (non-fatal)', updateErr);
      } else if (!updated || updated.length === 0) {
        console.error('polish-session-notes: session update affected 0 rows (likely RLS mismatch)');
      }
    }

    const logRow: { user_id: string; organization_id: string; session_id?: string } = {
      user_id: userId,
      organization_id: organizationId,
    };
    if (sessionId) {
      logRow.session_id = sessionId;
    }
    const { error: logErr } = await supaClient
      .from('notes_polish_log')
      .insert(logRow);
    if (logErr) {
      console.error('polish-session-notes: log insert failed (non-fatal)', logErr);
    }

    return res.status(200).json({ polishedNotes });
  } catch (err: any) {
    console.error('polish-session-notes: Anthropic error', err);
    const upstreamStatus = typeof err?.status === 'number' ? err.status : undefined;
    const status = upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 500;
    const message =
      (typeof err?.message === 'string' && err.message) ||
      (err?.error?.message as string | undefined) ||
      'Unknown error polishing notes';
    return res.status(status).json({ error: message });
  }
}
