type Args = {
  ownerName: string | null;
  practiceName: string;
  invoiceNumbers: string;
  amountCents: number;
  currency: string;
  failureCode: string | null;
  failureMessage: string | null;
};

type Built = { subject: string; html: string; text: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAmount(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amountCents / 100);
}

const FONT_DISPLAY = `'Fraunces', Georgia, 'Times New Roman', serif`;
const FONT_BODY = `'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const CREAM = '#faf8f3';
const INK = '#1a1a1a';
const INK_MUTED = '#6b6b66';
const FOREST = '#1a3a2a';
const RULE = '#e8e3d8';
const CLARET = '#7a2a2a';

export function buildPaymentFailedEmail(args: Args): Built {
  const amount = formatAmount(args.amountCents, args.currency);
  const greeting = args.ownerName ? `Hi ${args.ownerName.split(' ')[0]},` : 'Hi,';
  const safeGreeting = escapeHtml(greeting);
  const safeInv = escapeHtml(args.invoiceNumbers);
  const reasonLine = args.failureMessage
    ? `Stripe reported: ${args.failureMessage}${args.failureCode ? ` (code: ${args.failureCode})` : ''}`
    : 'No specific reason was returned.';
  const safeReason = escapeHtml(reasonLine);

  const subject = `A payment failed - ${amount} on ${args.invoiceNumbers}`;

  const text =
    `${greeting}\n\n` +
    `A parent's card payment for ${amount} on invoice ${args.invoiceNumbers} failed.\n\n` +
    `${reasonLine}\n\n` +
    `The invoice is still unpaid. The parent can retry from the same payment link, ` +
    `or you can ask them to use a different card.\n\n` +
    `--\n` +
    `Crestio | https://crestio.ai\n`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM};font-family:${FONT_BODY};color:${INK};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${CREAM};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background-color:${CREAM};">
        <tr><td style="padding:0 0 12px 0;">
          <div style="font-family:${FONT_BODY};font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:${CLARET};">Action needed</div>
        </td></tr>
        <tr><td style="padding:0 0 18px 0;">
          <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:600;font-size:26px;line-height:1.2;letter-spacing:-0.02em;color:${INK};">
            A payment failed
          </h1>
        </td></tr>
        <tr><td style="padding:0 0 14px 0;">
          <p style="margin:0;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${INK};">
            ${safeGreeting} a parent's card payment for <strong>${escapeHtml(amount)}</strong> on
            invoice ${safeInv} failed.
          </p>
        </td></tr>
        <tr><td style="padding:0 0 12px 0;">
          <p style="margin:0;font-family:${FONT_BODY};font-size:13px;line-height:1.65;color:${INK_MUTED};">
            ${safeReason}
          </p>
        </td></tr>
        <tr><td style="padding:0 0 12px 0;">
          <p style="margin:0;font-family:${FONT_BODY};font-size:13px;line-height:1.65;color:${INK_MUTED};">
            The invoice is still marked unpaid. The parent can retry from the same payment link,
            or you can ask them to use a different card.
          </p>
        </td></tr>
        <tr><td style="padding:32px 0 0 0;border-top:1px solid ${RULE};">
          <p style="margin:24px 0 0 0;font-family:${FONT_BODY};font-size:12px;line-height:1.6;color:${INK_MUTED};">
            Crestio · <a href="https://crestio.ai" style="color:${INK_MUTED};text-decoration:underline;">crestio.ai</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  void FOREST;
  return { subject, html, text };
}
