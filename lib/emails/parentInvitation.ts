type Args = {
  parentEmail: string;
  tutorBusinessName: string;
  studentFirstName: string;
  invitationUrl: string;
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

export function buildParentInvitationEmail({
  parentEmail,
  tutorBusinessName,
  studentFirstName,
  invitationUrl,
}: Args): Built {
  const safeBiz = escapeHtml(tutorBusinessName);
  const safeFirst = escapeHtml(studentFirstName);
  const safeUrl = escapeHtml(invitationUrl);

  const subject = `${tutorBusinessName} invited you to view ${studentFirstName}'s tutoring progress`;

  const text =
    `${tutorBusinessName} has invited you to view ${studentFirstName}'s tutoring sessions on Crestio.\n\n` +
    `You'll be able to see what's been covered in each session, homework set, and how ${studentFirstName} is progressing — all in one place.\n\n` +
    `Accept the invitation here:\n${invitationUrl}\n\n` +
    `This invitation link expires in 7 days. If you weren't expecting this email, you can ignore it.\n\n` +
    `—\n` +
    `Crestio · Made in Sydney · https://crestio.ai\n`;

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
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safeBiz} invited you to view ${safeFirst}'s tutoring progress on Crestio.</div>
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
              <div style="font-family:${FONT_BODY};font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:${INK_MUTED};">Parent portal</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 20px 0;">
              <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:600;font-size:32px;line-height:1.15;letter-spacing:-0.02em;color:${INK};">An invitation from ${safeBiz}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 28px 0;">
              <p style="margin:0;font-family:${FONT_BODY};font-size:16px;line-height:1.6;color:${INK};">
                ${safeBiz} has invited you to view ${safeFirst}'s tutoring sessions on Crestio. You'll be able to see what's been covered in each session, homework set, and how ${safeFirst} is progressing — all in one place.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 28px 0;">
              <a href="${safeUrl}" style="display:inline-block;background-color:${FOREST};color:${CREAM};font-family:${FONT_BODY};font-size:15px;font-weight:500;text-decoration:none;padding:14px 28px;border-radius:4px;">Accept invitation</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 8px 0;">
              <p style="margin:0;font-family:${FONT_BODY};font-size:13px;line-height:1.6;color:${INK_MUTED};">
                This invitation link expires in 7 days. If you weren't expecting this email, you can ignore it.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0 0 0;">
              <p style="margin:0;font-family:${FONT_BODY};font-size:12px;line-height:1.6;color:${INK_MUTED};word-break:break-all;">
                Having trouble with the button? Paste this link into your browser:<br>
                <span style="color:${FOREST};">${safeUrl}</span>
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
