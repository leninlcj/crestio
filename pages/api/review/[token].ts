import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { clientIp } from '../../../lib/agencyForms';
import { checkRateLimitShared } from '../../../lib/rateLimit';
import { getReviewByToken, validateReviewSubmission, REVIEW_TOKEN_RE } from '../../../lib/reviews';
import { AGENCY, REVIEWS } from '../../../lib/agency';
import { sendEmail } from '../../../lib/email';
import { OWNER_EMAIL } from '../../../lib/owner';
import { buildReviewSubmittedAlertEmail } from '../../../lib/emails/softRun';

// Public, token-addressed.
// GET  /api/review/[token]  -> what the page needs (names, language, state)
// POST /api/review/[token]  -> the family's review; owner is emailed to approve
// Tokens are 32 characters of base64url from crypto.randomBytes; guessing one
// is not practical, and the endpoint is rate-limited per IP anyway.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // A malformed token is refused before anything else is touched.
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!REVIEW_TOKEN_RE.test(token)) return res.status(404).json({ error: 'not_found' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  const ip = clientIp(req.headers, req.socket?.remoteAddress ?? 'unknown');
  const rl = await checkRateLimitShared(admin, { key: `review:${ip}`, limit: req.method === 'POST' ? 10 : 60, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests. Try again later.', retry_after_seconds: rl.retry_after_seconds });

  let review;
  try {
    review = await getReviewByToken(admin, token);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Could not load.' });
  }
  if (!review) return res.status(404).json({ error: 'not_found' });

  // Names for the page: first names only.
  let studentFirst: string | null = null;
  let tutorFirst: string | null = null;
  if (review.student_id) {
    const { data: s } = await admin.from('students').select('name').eq('id', review.student_id).maybeSingle();
    studentFirst = ((s as any)?.name ?? '').split(' ')[0] || null;
  }
  if (review.tutor_id) {
    const { data: t } = await admin.from('tutors').select('name').eq('id', review.tutor_id).maybeSingle();
    tutorFirst = ((t as any)?.name ?? '').split(' ')[0] || null;
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      state: review.status === 'requested' ? 'open' : 'done',
      language: review.language,
      student_first_name: studentFirst,
      tutor_first_name: tutorFirst,
      google_review_url: REVIEWS.googleReviewUrl,
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (review.status !== 'requested') return res.status(409).json({ error: 'already_submitted', language: review.language });

  const body = (req.body ?? {}) as Record<string, unknown>;
  // Honeypot: bots fill every field.
  if (typeof body.website === 'string' && body.website.trim() !== '') return res.status(200).json({ ok: true });

  const v = validateReviewSubmission(body, review.language);
  if (!v.ok) return res.status(400).json({ error: v.error });

  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from('reviews')
    .update({
      status: 'submitted',
      submitted_at: now,
      rating: v.value.rating,
      body: v.value.body,
      reviewer_name: v.value.reviewer_name,
      reviewer_suburb: v.value.reviewer_suburb,
      consent_public: v.value.consent_public,
    })
    .eq('id', review.id)
    .eq('status', 'requested');
  if (upErr) return res.status(500).json({ error: upErr.message });

  // Tell the owner. Non-fatal.
  try {
    const { data: hh } = await admin.from('households').select('display_name').eq('id', review.household_id).maybeSingle();
    const email = buildReviewSubmittedAlertEmail({
      householdName: (hh as any)?.display_name ?? 'a family',
      rating: v.value.rating,
      body: v.value.body,
      reviewerName: v.value.reviewer_name,
      consentPublic: v.value.consent_public,
      reviewsUrl: `${AGENCY.siteUrl}/app/leads/reviews?review=${review.id}`,
    });
    await sendEmail({ to: process.env.OWNER_ALERT_EMAIL || OWNER_EMAIL, subject: email.subject, html: email.html, text: email.text });
  } catch (e) {
    console.error('[review] owner alert failed', e);
  }

  return res.status(200).json({ ok: true, google_review_url: v.value.rating >= 4 ? REVIEWS.googleReviewUrl : null, language: review.language });
}
