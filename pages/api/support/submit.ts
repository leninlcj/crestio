import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../../../lib/email';
import { checkRateLimit, LIMITS } from '../../../lib/rateLimit';

// Accept JSON body: { category, subject, message, attachment_paths: string[] }
// attachment_paths are Supabase Storage keys under support-attachments/<user_id>/...
// (upload happens on the client using the user's session). We don't accept raw
// file bytes here — reduces request size and keeps this endpoint cheap.

const CATEGORIES = ['question', 'bug', 'feature', 'billing', 'other'] as const;

type Category = typeof CATEGORIES[number];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supportTo = process.env.SUPPORT_INBOX_EMAIL || 'leninlcj@gmail.com';
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;
  const userEmail = userData.user.email ?? '';

  const rl = checkRateLimit({
    key: `support:${userId}`,
    limit: LIMITS.support_submit.limit,
    windowMs: LIMITS.support_submit.windowMs,
  });
  if (!rl.allowed) {
    return res.status(429).json({
      error: "You've sent a lot of support messages today. Please try again tomorrow, or email hello@crestio.ai directly.",
      retry_after_seconds: rl.retry_after_seconds,
    });
  }

  const body = (req.body ?? {}) as {
    category?: string;
    subject?: string;
    message?: string;
    attachment_paths?: string[];
  };
  const category = (body.category ?? '').trim().toLowerCase() as Category;
  const subject = (body.subject ?? '').trim();
  const message = (body.message ?? '').trim();
  const attachmentPaths = Array.isArray(body.attachment_paths) ? body.attachment_paths.filter((p) => typeof p === 'string') : [];

  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category.' });
  if (!subject || subject.length > 200) return res.status(400).json({ error: 'Subject is required (max 200 chars).' });
  if (!message || message.length < 20) return res.status(400).json({ error: 'Message must be at least 20 characters.' });
  if (attachmentPaths.length > 3) return res.status(400).json({ error: 'Maximum 3 attachments.' });

  // Ensure every path starts with the user's id prefix (defence in depth —
  // bucket policy enforces this too, but don't trust the client).
  for (const path of attachmentPaths) {
    if (!path.startsWith(`${userId}/`)) {
      return res.status(400).json({ error: 'Attachment path not under your user scope.' });
    }
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Resolve org for audit row + email body.
  const { data: membership } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .maybeSingle();
  const orgId = membership?.organization_id ?? null;
  let orgName = 'Unknown';
  let planTier = 'solo';
  if (orgId) {
    const { data: org } = await admin
      .from('organizations')
      .select('name, plan_tier')
      .eq('id', orgId)
      .maybeSingle();
    if (org) {
      orgName = org.name ?? 'Unknown';
      planTier = org.plan_tier ?? 'solo';
    }
  }

  // Generate 7-day signed URLs for each attachment.
  const signedUrls: string[] = [];
  for (const path of attachmentPaths) {
    const { data: signed } = await admin.storage
      .from('support-attachments')
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (signed?.signedUrl) signedUrls.push(signed.signedUrl);
  }

  // Persist audit row.
  const { data: row, error: insertErr } = await admin
    .from('support_requests')
    .insert({
      user_id: userId,
      organization_id: orgId,
      category,
      subject,
      message,
      attachment_urls: signedUrls,
    })
    .select('id, submitted_at')
    .maybeSingle();
  if (insertErr || !row) {
    console.error('[support/submit] insert failed', insertErr);
    return res.status(500).json({ error: 'Could not save the request. Try again.' });
  }

  // Email the team.
  const categoryLabel = categoryDisplay(category);
  const emailSubject = `[Crestio Support] [${categoryLabel}] ${subject}`;
  const attachmentsHtml = signedUrls.length > 0
    ? `<h3>Attachments</h3><ul>${signedUrls.map((u, i) => `<li><a href="${u}">Attachment ${i + 1}</a></li>`).join('')}</ul><p style="color:#666;font-size:12px;">Links expire in 7 days.</p>`
    : '';
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
      <h2 style="margin-top:0;">Support request</h2>
      <p><strong>Category:</strong> ${escapeHtml(categoryLabel)}<br/>
      <strong>Subject:</strong> ${escapeHtml(subject)}<br/>
      <strong>From:</strong> ${escapeHtml(userEmail)}<br/>
      <strong>Organisation:</strong> ${escapeHtml(orgName)} (${escapeHtml(planTier)})<br/>
      <strong>Role:</strong> ${escapeHtml(membership?.role ?? 'unknown')}<br/>
      <strong>Submitted:</strong> ${row.submitted_at}</p>
      <hr/>
      <h3>Message</h3>
      <pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(message)}</pre>
      ${attachmentsHtml}
      <hr/>
      <p style="color:#666;font-size:12px;">Reply directly to this email to respond to the user. Request ID: ${row.id}</p>
    </div>
  `;
  const text =
    `Support request\n\n` +
    `Category: ${categoryLabel}\n` +
    `Subject: ${subject}\n` +
    `From: ${userEmail}\n` +
    `Organisation: ${orgName} (${planTier})\n` +
    `Role: ${membership?.role ?? 'unknown'}\n` +
    `Submitted: ${row.submitted_at}\n\n` +
    `Message:\n${message}\n\n` +
    (signedUrls.length > 0 ? `Attachments (expire in 7 days):\n${signedUrls.map((u, i) => `${i + 1}. ${u}`).join('\n')}\n` : '') +
    `\nRequest ID: ${row.id}`;

  const mail = await sendEmail({
    to: supportTo,
    subject: emailSubject,
    html,
    text,
    replyTo: userEmail || undefined,
  });
  if (!mail.success) {
    console.error('[support/submit] email delivery failed', mail.error);
    return res.status(200).json({
      ok: true,
      email_sent: false,
      request_id: row.id,
      note: "We saved your message, but email delivery to the support team is failing. We'll still see it in our admin queue.",
    });
  }

  return res.status(200).json({
    ok: true,
    email_sent: true,
    request_id: row.id,
  });
}

function categoryDisplay(c: Category): string {
  switch (c) {
    case 'question': return 'Question';
    case 'bug':      return 'Bug report';
    case 'feature':  return 'Feature request';
    case 'billing':  return 'Billing';
    default:         return 'Other';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
