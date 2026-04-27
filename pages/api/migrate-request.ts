import type { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';

type Body = {
  name?: string;
  email?: string;
  current_tool?: string;
  message?: string;
  kind?: 'migration' | 'api_waitlist' | 'other';
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = (req.body ?? {}) as Body;
  const email = (body.email ?? '').trim();
  const name = (body.name ?? '').trim();
  const tool = (body.current_tool ?? '').trim();
  const message = (body.message ?? '').trim().slice(0, 4000);
  const kind = body.kind ?? 'migration';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    // Allow the form to succeed locally even when Resend is unconfigured —
    // logs the request so dev environments aren't blocked. Production
    // deployments must have RESEND_API_KEY set.
    console.warn('[migrate-request] RESEND_API_KEY missing; logging request', { email, name, tool, kind });
    return res.status(200).json({ ok: true, simulated: true });
  }

  try {
    const resend = new Resend(resendKey);
    const subjectMap: Record<string, string> = {
      migration: `Migration request from ${name || email}`,
      api_waitlist: `API waitlist signup — ${email}`,
      other: `Inbound from ${name || email}`,
    };
    const subject = subjectMap[kind] ?? subjectMap.other;
    const lines = [
      `From: ${name || '(no name)'} <${email}>`,
      tool ? `Current tool: ${tool}` : null,
      `Kind: ${kind}`,
      '',
      message || '(no message)',
    ].filter(Boolean).join('\n');

    await resend.emails.send({
      from: 'Crestio Migrations <hello@crestio.ai>',
      to: ['lenin@crestio.ai'],
      replyTo: email,
      subject,
      text: lines,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[migrate-request] resend send failed', err);
    return res.status(500).json({ error: 'Could not send. Please email lenin@crestio.ai directly.' });
  }
}
