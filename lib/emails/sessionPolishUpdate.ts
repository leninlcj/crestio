type Args = {
  parentName: string | null;
  studentFirstName: string;
  tutorName: string;
  practiceName: string;
  sessionDateLabel: string;
  subject: string | null;
  polishedContent: string;
  parentPortalUrl: string | null;
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

const FONT_DISPLAY = `'Fraunces', Georgia, 'Times New Roman', serif`;
const FONT_BODY = `'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const CREAM = '#faf8f3';
const INK = '#1a1a1a';
const INK_MUTED = '#6b6b66';
const FOREST = '#1a3a2a';
const RULE = '#e8e3d8';

export function buildSessionPolishUpdateEmail(args: Args): Built {
  const greeting = args.parentName ? `Hi ${args.parentName.split(' ')[0]},` : 'Hi,';
  const subjectLine = `Session update — ${args.studentFirstName} — ${args.sessionDateLabel}`;
  const subjectSuffix = args.subject ? ` (${args.subject})` : '';

  // Plaintext: keep ASCII to avoid Resend re-encoding the URL.
  const text =
    `${greeting}\n\n` +
    `Quick update from ${args.tutorName} at ${args.practiceName} on ${args.studentFirstName}'s session on ${args.sessionDateLabel}${subjectSuffix}:\n\n` +
    `${args.polishedContent}\n\n` +
    (args.parentPortalUrl
      ? `View all session notes for ${args.studentFirstName}:\n${args.parentPortalUrl}\n\n`
      : '') +
    `--\n` +
    `${args.practiceName} via Crestio | https://crestio.ai\n`;

  const safeContent = escapeHtml(args.polishedContent).replace(/\n\n+/g, '</p><p style="margin:0 0 14px 0;">').replace(/\n/g, '<br>');
  const safeStudent = escapeHtml(args.studentFirstName);
  const safeTutor = escapeHtml(args.tutorName);
  const safePractice = escapeHtml(args.practiceName);
  const safeDate = escapeHtml(args.sessionDateLabel);
  const safeSubject = args.subject ? escapeHtml(args.subject) : '';

  const portalRow = args.parentPortalUrl
    ? `<tr><td style="padding:24px 0 0 0;">
         <a href="${escapeHtml(args.parentPortalUrl)}" style="color:${FOREST};font-family:${FONT_BODY};font-size:13px;text-decoration:underline;">
           View all session notes for ${safeStudent} →
         </a>
       </td></tr>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subjectLine)}</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM};font-family:${FONT_BODY};color:${INK};-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${CREAM};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background-color:${CREAM};">
          <tr><td style="padding:0 0 12px 0;">
            <div style="font-family:${FONT_BODY};font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:${INK_MUTED};">${safePractice}</div>
          </td></tr>
          <tr><td style="padding:0 0 18px 0;">
            <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:600;font-size:24px;line-height:1.2;letter-spacing:-0.02em;color:${INK};">
              ${safeStudent} — ${safeDate}${safeSubject ? ` · ${safeSubject}` : ''}
            </h1>
          </td></tr>
          <tr><td style="padding:0 0 8px 0;">
            <p style="margin:0 0 14px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${INK};">
              ${escapeHtml(greeting)}
            </p>
            <p style="margin:0 0 14px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${INK};">
              Quick update from ${safeTutor} on ${safeStudent}'s recent session.
            </p>
          </td></tr>
          <tr><td style="padding:8px 0 0 0;">
            <div style="font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${INK};">
              <p style="margin:0 0 14px 0;">${safeContent}</p>
            </div>
          </td></tr>
          ${portalRow}
          <tr><td style="padding:32px 0 0 0;border-top:1px solid ${RULE};">
            <p style="margin:24px 0 0 0;font-family:${FONT_BODY};font-size:12px;line-height:1.6;color:${INK_MUTED};">
              ${safePractice} · sent via Crestio · <a href="https://crestio.ai" style="color:${INK_MUTED};text-decoration:underline;">crestio.ai</a>
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: subjectLine, html, text };
}
