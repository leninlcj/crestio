// Email templates for notifications. One shared wrapper; per-type helpers
// pick the right subject prefix. Content stays generic — we don't have the
// full context object needed for bespoke copy at this layer, so we use the
// title + body the notification was created with.

import type { NotificationType } from '../notifications';
import { getServerT } from '../i18nServer';

export type NotificationEmailPayload = { subject: string; html: string; text: string };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Subject-prefix localisation key per type. Falls back to no prefix.
function subjectPrefixKey(type: NotificationType): string | null {
  switch (type) {
    case 'message_urgent':   return 'subject_prefix.urgent';
    case 'payment_failed':   return 'subject_prefix.action_required';
    case 'invoice_overdue':  return 'subject_prefix.reminder';
    case 'trial_ending':     return 'subject_prefix.heads_up';
    case 'subscription_cancelled': return 'subject_prefix.subscription_cancelled';
    default: return null;
  }
}

function buttonUrlFor(linkUrl: string | null, baseUrl: string, recipientIsParent: boolean): string | null {
  if (!linkUrl) return null;
  if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) return linkUrl;
  return `${baseUrl.replace(/\/$/, '')}${linkUrl.startsWith('/') ? '' : '/'}${linkUrl}`;
}

function settingsUrlFor(baseUrl: string, recipientIsParent: boolean): string {
  const base = baseUrl.replace(/\/$/, '');
  return recipientIsParent
    ? `${base}/parent/settings/notifications`
    : `${base}/app/settings/notifications`;
}

export async function buildNotificationEmail(args: {
  type: NotificationType;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  baseUrl: string;
  recipientIsParent: boolean;
  recipientLocale?: string;
}): Promise<NotificationEmailPayload> {
  const t = await getServerT(args.recipientLocale ?? 'en', 'emails');
  const prefixKey = subjectPrefixKey(args.type);
  const prefix = prefixKey ? t(prefixKey) : '';
  const subject = `${prefix}${args.title}`;
  const ctaUrl = buttonUrlFor(args.linkUrl ?? null, args.baseUrl, args.recipientIsParent);
  const settingsUrl = settingsUrlFor(args.baseUrl, args.recipientIsParent);

  const textParts: string[] = [args.title];
  if (args.body) textParts.push('', args.body);
  if (ctaUrl) textParts.push('', t('wrapper.open_in_crestio_text', { url: ctaUrl }));
  textParts.push('', t('wrapper.manage_notifications_text', { url: settingsUrl }));
  const text = textParts.join('\n');

  const openLabel = esc(t('wrapper.open_in_crestio'));
  const manageLabel = esc(t('wrapper.manage_notifications'));

  const html = `<!doctype html>
<html><body style="font-family:'IBM Plex Sans',system-ui,sans-serif;color:#1A1815;background:#FAF8F4;margin:0;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E8E3DB;border-radius:6px;padding:28px;">
  <div style="font-family:Fraunces,Georgia,serif;font-size:22px;letter-spacing:-0.04em;color:#1A1815;margin-bottom:18px;">
    crest<span style="font-style:italic;color:#1F3A2E;">io</span>
  </div>
  <h1 style="font-family:Fraunces,Georgia,serif;font-size:20px;font-weight:500;letter-spacing:-0.02em;margin:0 0 12px 0;color:#1A1815;">
    ${esc(args.title)}
  </h1>
  ${args.body ? `<p style="font-size:14px;line-height:1.6;margin:0 0 18px 0;color:#1A1815;white-space:pre-wrap;">${esc(args.body)}</p>` : ''}
  ${ctaUrl ? `<p style="margin:0 0 18px 0;">
    <a href="${ctaUrl}" style="display:inline-block;background:#1F3A2E;color:#FAF8F4;text-decoration:none;padding:10px 18px;border-radius:4px;font-size:14px;">
      ${openLabel} →
    </a>
  </p>` : ''}
  <hr style="border:none;border-top:1px solid #E8E3DB;margin:22px 0;"/>
  <p style="color:#908A82;font-size:11px;line-height:1.6;margin:0;">
    <a href="${settingsUrl}" style="color:#908A82;">${manageLabel}</a>
    · <a href="mailto:support@crestio.ai" style="color:#908A82;">support@crestio.ai</a>
  </p>
</div>
</body></html>`;

  return { subject, html, text };
}
