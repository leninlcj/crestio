type Args = {
  recipientEmail: string;
  magicLinkUrl: string;
  planLabel: string;
  billingIntervalLabel: string;
};

type Built = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT_DISPLAY = `'Fraunces', Georgia, 'Times New Roman', serif`;
const FONT_BODY = `'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const CREAM = '#faf8f3';
const INK = '#1a1a1a';
const INK_MUTED = '#6b6b66';
const FOREST = '#1a3a2a';
const RULE = '#e8e3d8';

export function buildWelcomeEmail({
  recipientEmail,
  magicLinkUrl,
  planLabel,
  billingIntervalLabel,
}: Args): Built {
  const safeEmail = escapeHtml(recipientEmail);
  const safeLink = escapeHtml(magicLinkUrl);
  const safePlan = escapeHtml(planLabel);
  const safeInterval = escapeHtml(billingIntervalLabel);

  const subject = `Welcome to Crestio - sign in to get started`;

  // Plaintext must stay pure ASCII. Any non-ASCII char (em-dash, middle-dot)
  // forces Resend to quoted-printable encode the whole part, and the 76-col
  // soft line break corrupts the long magic link at the `=` in query strings.
  const text =
    `Welcome to Crestio.\n\n` +
    `Your ${planLabel} (${billingIntervalLabel}) subscription is active. Click the link below to sign in and finish setting up your account.\n\n` +
    `${magicLinkUrl}\n\n` +
    `This link is for ${recipientEmail} and expires in 1 hour. If you didn't sign up, ignore this email.\n\n` +
    `Need help? Reply to this email or write to support@crestio.ai.\n\n` +
    `--\n` +
    `Crestio | Made in Sydney | https://crestio.ai\n`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM};font-family:${FONT_BODY};color:${INK};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your Crestio ${safePlan} subscription is active. Sign in here.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${CREAM};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background-color:${CREAM};">
          <tr>
            <td style="padding:0 0 24px 0;">
              <span style="font-family:${FONT_DISPLAY};font-size:28px;letter-spacing:-0.02em;color:${INK};font-weight:600;">crest<span style="font-style:italic;color:${FOREST};">io</span></span>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 8px 0;">
              <div style="font-family:${FONT_BODY};font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:${INK_MUTED};">Welcome</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 20px 0;">
              <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:600;font-size:32px;line-height:1.15;letter-spacing:-0.02em;color:${INK};">Your Crestio account is ready.</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 28px 0;">
              <p style="margin:0;font-family:${FONT_BODY};font-size:16px;line-height:1.6;color:${INK};">
                Your <strong>${safePlan}</strong> subscription (${safeInterval}) is active. Click below to sign in and finish setting up your account — adding students, logging your first session, and inviting your first parent only takes a couple of minutes.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 28px 0;">
              <a href="${safeLink}" style="display:inline-block;background-color:${FOREST};color:${CREAM};font-family:${FONT_BODY};font-size:15px;font-weight:500;text-decoration:none;padding:14px 28px;border-radius:4px;">Sign in to Crestio</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 8px 0;">
              <p style="margin:0;font-family:${FONT_BODY};font-size:13px;line-height:1.6;color:${INK_MUTED};">
                This link signs in <strong>${safeEmail}</strong> and expires in 1 hour. If you didn't sign up, you can ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0 0 0;">
              <p style="margin:0;font-family:${FONT_BODY};font-size:12px;line-height:1.6;color:${INK_MUTED};word-break:break-all;">
                Having trouble with the button? Paste this link into your browser:<br>
                <span style="color:${FOREST};">${safeLink}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 0 0 0;border-top:1px solid ${RULE};">
              <p style="margin:24px 0 0 0;font-family:${FONT_BODY};font-size:12px;line-height:1.6;color:${INK_MUTED};">
                Crestio · Made in Sydney · <a href="https://crestio.ai" style="color:${INK_MUTED};text-decoration:underline;">crestio.ai</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
