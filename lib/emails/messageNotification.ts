// Resend email templates for parent ↔ tutor messaging. Team voice, Crestio
// wordmark header, muted "turn off" footer that links to settings.

import type { Urgency } from '../messaging';

type EmailPayload = { subject: string; html: string; text: string };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function wrap(body: string): string {
  return `<!doctype html>
<html><body style="font-family:'IBM Plex Sans',system-ui,sans-serif;color:#1A1815;background:#FAF8F4;margin:0;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E8E3DB;border-radius:6px;padding:28px;">
  <div style="font-family:Fraunces,Georgia,serif;font-size:22px;letter-spacing:-0.04em;color:#1A1815;margin-bottom:16px;">
    crest<span style="font-style:italic;color:#1F3A2E;">io</span>
  </div>
  ${body}
</div>
</body></html>`;
}

function previewForEmail(body: string, max = 300): string {
  const trimmed = body.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trimEnd() + '…';
}

// ---------------------------------------------------------------------------
// Tutor → receives email: parent just messaged them.
// ---------------------------------------------------------------------------
export function buildMessageEmailForTutor(args: {
  parentName: string | null;
  studentName: string;
  bodyPreview: string;
  threadUrl: string;
  notificationSettingsUrl: string;
}): EmailPayload {
  const parent = args.parentName?.trim() || 'A parent';
  const subject = `New message from ${parent} about ${args.studentName}`;
  const preview = previewForEmail(args.bodyPreview);

  const text =
    `${parent} sent you a message about ${args.studentName}.\n\n` +
    `---\n${preview}\n---\n\n` +
    `Reply in Crestio: ${args.threadUrl}\n\n` +
    `If you don't want these emails, you can turn them off: ${args.notificationSettingsUrl}`;

  const html = wrap(
    `<p style="font-size:14px;line-height:1.6;margin:0 0 14px 0;">
      <strong>${esc(parent)}</strong> sent you a message about
      <strong>${esc(args.studentName)}</strong>.
    </p>
    <div style="border-left:3px solid #E8E3DB;padding:8px 14px;margin:12px 0;color:#6B6660;font-size:14px;line-height:1.6;white-space:pre-wrap;">
      ${esc(preview)}
    </div>
    <p style="font-size:14px;margin:16px 0 8px 0;">
      <a href="${args.threadUrl}" style="color:#1F3A2E;text-decoration:underline;">Reply in Crestio →</a>
    </p>
    <hr style="border:none;border-top:1px solid #E8E3DB;margin:20px 0;"/>
    <p style="color:#908A82;font-size:11px;line-height:1.6;">
      Don't want these emails?
      <a href="${args.notificationSettingsUrl}" style="color:#908A82;">Turn them off in Settings → Notifications</a>.
    </p>`,
  );

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Parent → receives email: tutor just messaged them.
// ---------------------------------------------------------------------------
export function buildMessageEmailForParent(args: {
  tutorName: string | null;
  studentName: string;
  urgency: Urgency | null;
  bodyPreview: string;
  threadUrl: string;
  notificationSettingsUrl: string;
}): EmailPayload {
  const tutor = args.tutorName?.trim() || 'Your tutor';
  const preview = previewForEmail(args.bodyPreview);

  const subject =
    args.urgency === 'urgent'
      ? `URGENT: Message from ${tutor} about ${args.studentName}`
      : args.urgency === 'info'
      ? `Update from ${tutor} about ${args.studentName}`
      : `New message from ${tutor} about ${args.studentName}`;

  const urgencyLine = args.urgency === 'urgent'
    ? 'This message is marked urgent.\n\n'
    : '';

  const text =
    `${tutor} sent you a message about ${args.studentName}.\n\n` +
    urgencyLine +
    `---\n${preview}\n---\n\n` +
    `Reply in Crestio: ${args.threadUrl}\n\n` +
    `Turn off these emails: ${args.notificationSettingsUrl}`;

  const urgencyPill = args.urgency === 'urgent'
    ? `<div style="display:inline-block;background:#F5E9C8;color:#5C420B;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;padding:3px 8px;border-radius:3px;margin:0 0 10px 0;">Urgent</div>`
    : '';

  const html = wrap(
    `${urgencyPill}
    <p style="font-size:14px;line-height:1.6;margin:0 0 14px 0;">
      <strong>${esc(tutor)}</strong> sent you a message about
      <strong>${esc(args.studentName)}</strong>.
    </p>
    <div style="border-left:3px solid #E8E3DB;padding:8px 14px;margin:12px 0;color:#6B6660;font-size:14px;line-height:1.6;white-space:pre-wrap;">
      ${esc(preview)}
    </div>
    <p style="font-size:14px;margin:16px 0 8px 0;">
      <a href="${args.threadUrl}" style="color:#1F3A2E;text-decoration:underline;">Reply in Crestio →</a>
    </p>
    <hr style="border:none;border-top:1px solid #E8E3DB;margin:20px 0;"/>
    <p style="color:#908A82;font-size:11px;line-height:1.6;">
      Don't want these emails?
      <a href="${args.notificationSettingsUrl}" style="color:#908A82;">Turn them off in Parent settings</a>.
    </p>`,
  );

  return { subject, html, text };
}
