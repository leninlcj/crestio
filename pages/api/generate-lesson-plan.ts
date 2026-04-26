import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { LESSON_PLAN_DAILY_LIMIT } from '../../lib/rateLimits';
import { getOrganizationIdForUser } from '../../lib/organization';
import { getMembershipForUser } from '../../lib/membership';
import { isOrgBillingOk } from '../../lib/billing';
import { checkRateLimit, LIMITS } from '../../lib/rateLimit';
import { callAI } from '../../lib/ai/router';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY missing from server environment');
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not set in the server environment.',
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('generate-lesson-plan: Supabase env vars missing');
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
    return res.status(500).json({ error: 'No organization found for this account.' });
  }
  const membership = await getMembershipForUser(supaClient, userId);
  const { data: callerProfile } = await supaClient
    .from('profiles').select('locale').eq('id', userId).maybeSingle();
  const callerLocale = callerProfile?.locale && typeof callerProfile.locale === 'string' ? callerProfile.locale : 'en';
  const { LOCALE_AI_NAME, isSupportedLocale } = await import('../../lib/i18n');
  const aiLanguageName = isSupportedLocale(callerLocale) ? LOCALE_AI_NAME[callerLocale] : 'English';

  const billing = await isOrgBillingOk(supaClient, organizationId);
  if (!billing.ok) {
    return res.status(402).json({
      error: 'subscription_required',
      reason: billing.reason,
      checkout_url_hint: '/app/settings?tab=billing',
    });
  }

  const rl = checkRateLimit({
    key: `lessonPlan:${userId}`,
    limit: LIMITS.lessonPlan.limit,
    windowMs: LIMITS.lessonPlan.windowMs,
  });
  if (!rl.allowed) {
    return res.status(429).json({ error: 'rate_limit', retry_after_seconds: rl.retry_after_seconds });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const subject = typeof body.subject === 'string' ? body.subject : '';
  const topic = typeof body.topic === 'string' ? body.topic : '';
  const yearLevelRaw = body.yearLevel ?? body.year_level;
  const yearLevel = typeof yearLevelRaw === 'string' ? yearLevelRaw : '';
  const durationRaw = body.duration ?? body.duration_minutes;
  const duration =
    typeof durationRaw === 'number' && Number.isFinite(durationRaw)
      ? durationRaw
      : typeof durationRaw === 'string' && durationRaw.trim() !== ''
        ? Number(durationRaw)
        : 60;

  if (!subject || !topic) {
    return res.status(400).json({ error: 'subject and topic are required' });
  }

  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data: recent, error: rateErr } = await supaClient
    .from('lesson_plans')
    .select('created_at')
    .eq('owner_id', userId)
    .eq('organization_id', organizationId)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: true });
  if (rateErr) {
    console.error('generate-lesson-plan: rate limit check failed', rateErr);
    return res.status(500).json({ error: `Could not verify rate limit: ${rateErr.message}` });
  }
  const used = recent?.length ?? 0;
  if (used >= LESSON_PLAN_DAILY_LIMIT) {
    const oldest = recent?.[0]?.created_at;
    let hoursUntilReset = 24;
    if (oldest) {
      const resetAt = new Date(oldest).getTime() + WINDOW_MS;
      hoursUntilReset = Math.max(1, Math.ceil((resetAt - Date.now()) / (60 * 60 * 1000)));
    }
    return res.status(429).json({
      error: 'rate_limit_exceeded',
      message: `You've reached the daily limit of ${LESSON_PLAN_DAILY_LIMIT} lesson plans. Try again in ${hoursUntilReset} hour${hoursUntilReset === 1 ? '' : 's'}.`,
      hoursUntilReset,
    });
  }

  const prompt = `You are an experienced tutor writing a lesson plan.

Subject: ${subject}
Topic: ${topic}
${yearLevel ? `Year level: ${yearLevel}\n` : ''}Duration: ${duration} minutes

Write a practical, teachable lesson plan in clean markdown with these sections:

## Learning objectives
Two to four specific, observable objectives.

## Materials needed
A short bulleted list.

## Timing
A breakdown of the lesson in segments with minute counts that add up to the duration. Include warm-up, instruction, guided practice, independent practice, and wrap-up.

## Key concepts
The 2–4 most important ideas, each with a 1–2 sentence explanation written in the voice of a tutor, not a textbook.

## Worked example
One fully worked example with steps.

## Practice problems
Three problems, increasing in difficulty. Give the answer in parentheses after each.

## Common misconceptions
Two or three things students typically get wrong and how to address them.

## Homework
One homework task, specific and assignable.

Keep it concrete, avoid filler. Write the entire plan in ${aiLanguageName}, using natural phrasing for that language — section headings translated too. Do not include meta-commentary or explain what you are doing — just produce the plan.`;

  try {
    const aiResult = await callAI({
      task: 'lesson_plan',
      userPrompt: prompt,
      maxTokens: 2000,
      userId,
      organizationId,
    });
    const plan = aiResult.text;

    if (!plan) {
      console.error('Empty response from AI router (lesson plan)');
      return res.status(502).json({ error: 'Empty response from model.' });
    }

    return res.status(200).json({ plan });
  } catch (err: any) {
    console.error('Anthropic API error:', err);
    const upstreamStatus = typeof err?.status === 'number' ? err.status : undefined;
    const status = upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 500;
    const message =
      (typeof err?.message === 'string' && err.message) ||
      (err?.error?.message as string | undefined) ||
      'Unknown error generating plan';
    return res.status(status).json({ error: message });
  }
}
