type Args = {
  practiceName: string;
  invoiceNumbers: string;
  refundedAmountCents: number;
  currency: string;
  refundedAtLabel: string;
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
const RULE = '#e8e3d8';

export function buildRefundConfirmationEmail(args: Args): Built {
  const amount = formatAmount(args.refundedAmountCents, args.currency);
  const safePractice = escapeHtml(args.practiceName);
  const safeInv = escapeHtml(args.invoiceNumbers);
  const safeDate = escapeHtml(args.refundedAtLabel);

  const subject = `Refund issued - ${amount}`;

  const text =
    `${args.practiceName} has issued a refund.\n\n` +
    `Amount: ${amount}\n` +
    `Invoice: ${args.invoiceNumbers}\n` +
    `Date: ${args.refundedAtLabel}\n\n` +
    `Refunds typically appear in your account within 5-10 business days.\n\n` +
    `If you have questions, reply to this email.\n\n` +
    `--\n` +
    `${args.practiceName} via Crestio | https://crestio.ai\n`;

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
          <div style="font-family:${FONT_BODY};font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:${INK_MUTED};">${safePractice}</div>
        </td></tr>
        <tr><td style="padding:0 0 18px 0;">
          <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:600;font-size:28px;line-height:1.2;letter-spacing:-0.02em;color:${INK};">
            Refund issued
          </h1>
        </td></tr>
        <tr><td style="padding:0 0 14px 0;">
          <p style="margin:0;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${INK};">
            ${safePractice} has refunded <strong>${escapeHtml(amount)}</strong> for invoice ${safeInv}.
          </p>
        </td></tr>
        <tr><td style="padding:0 0 12px 0;">
          <p style="margin:0;font-family:${FONT_BODY};font-size:13px;line-height:1.6;color:${INK_MUTED};">
            Refunds typically appear in your account within 5-10 business days.
            Date issued: ${safeDate}.
          </p>
        </td></tr>
        <tr><td style="padding:32px 0 0 0;border-top:1px solid ${RULE};">
          <p style="margin:24px 0 0 0;font-family:${FONT_BODY};font-size:12px;line-height:1.6;color:${INK_MUTED};">
            ${safePractice} via Crestio · <a href="https://crestio.ai" style="color:${INK_MUTED};text-decoration:underline;">crestio.ai</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, html, text };
}
