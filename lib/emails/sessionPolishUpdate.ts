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

function tutorInitials(name: string): string {
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '·';
}

const FONT_DISPLAY = `'Fraunces', Georgia, 'Times New Roman', serif`;
const FONT_BODY = `'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const CREAM = '#FAFAF8';
const SURFACE = '#FFFFFF';
const INK = '#0F1714';
const INK_MUTED = '#5F635E';
const INK_SOFT = '#70746F';
const FOREST = '#1F3A2E';
const FOREST_SOFT = '#E8EEE8';
const RULE = '#EAEAE6';

export function buildSessionPolishUpdateEmail(args: Args): Built {
  const greeting = args.parentName ? `Hi ${args.parentName.split(' ')[0]},` : 'Hi,';
  const subjectLine = `${args.studentFirstName}'s session notes, ${args.sessionDateLabel}`;
  const subjectSuffix = args.subject ? ` (${args.subject})` : '';

  const text =
    `${greeting}\n\n` +
    `Quick update from ${args.tutorName} at ${args.practiceName} on ${args.studentFirstName}'s session on ${args.sessionDateLabel}${subjectSuffix}:\n\n` +
    `${args.polishedContent}\n\n` +
    (args.parentPortalUrl
      ? `View all session notes for ${args.studentFirstName}:\n${args.parentPortalUrl}\n\n`
      : '') +
    `--\n` +
    `${args.practiceName} · Sent via crestio.ai\n`;

  const safeContent = escapeHtml(args.polishedContent)
    .replace(/\n\n+/g, '</p><p style="margin:0 0 14px 0;">')
    .replace(/\n/g, '<br>');
  const safeStudent = escapeHtml(args.studentFirstName);
  const safeTutor = escapeHtml(args.tutorName);
  const safePractice = escapeHtml(args.practiceName);
  const safeDate = escapeHtml(args.sessionDateLabel);
  const safeSubject = args.subject ? escapeHtml(args.subject) : '';
  const safeInitials = escapeHtml(tutorInitials(args.tutorName));

  const portalButton = args.parentPortalUrl
    ? `<tr><td style="padding:28px 0 0 0;">
         <a href="${escapeHtml(args.parentPortalUrl)}"
            style="display:inline-block;background-color:${FOREST};color:${CREAM};font-family:${FONT_BODY};font-size:14px;font-weight:500;line-height:1;padding:12px 18px;border-radius:8px;text-decoration:none;">
           View in portal →
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
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background-color:${SURFACE};border:1px solid ${RULE};border-radius:8px;">
          <tr><td style="padding:24px 28px 18px 28px;border-bottom:1px solid ${RULE};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="padding-right:14px;">
                  <div style="width:40px;height:40px;border-radius:9999px;background-color:${FOREST_SOFT};color:${FOREST};font-family:${FONT_DISPLAY};font-weight:600;font-size:14px;line-height:40px;text-align:center;letter-spacing:-0.02em;">
                    ${safeInitials}
                  </div>
                </td>
                <td valign="middle">
                  <div style="font-family:${FONT_BODY};font-size:14px;font-weight:500;color:${INK};line-height:1.3;">${safeTutor}</div>
                  <div style="font-family:${FONT_BODY};font-size:12px;color:${INK_MUTED};line-height:1.3;margin-top:2px;">${safePractice}</div>
                </td>
              </tr>
            </table>
          </td></tr>

          <tr><td style="padding:24px 28px 6px 28px;">
            <div style="font-family:${FONT_BODY};font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:${INK_SOFT};margin-bottom:10px;">
              ${safeDate}${safeSubject ? ` · ${safeSubject}` : ''}
            </div>
            <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:600;font-size:24px;line-height:1.2;letter-spacing:-0.02em;color:${INK};">
              ${safeStudent}'s session notes
            </h1>
          </td></tr>

          <tr><td style="padding:18px 28px 0 28px;">
            <p style="margin:0 0 14px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${INK};">
              ${escapeHtml(greeting)}
            </p>
            <div style="font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${INK};">
              <p style="margin:0 0 14px 0;">${safeContent}</p>
            </div>
            ${portalButton}
          </td></tr>

          <tr><td style="padding:28px 28px 24px 28px;border-top:1px solid ${RULE};">
            <p style="margin:0 0 4px 0;font-family:${FONT_BODY};font-size:12px;line-height:1.5;color:${INK_MUTED};">
              Reply to this email to message ${safeTutor} directly.
            </p>
            <p style="margin:0;font-family:${FONT_BODY};font-size:11px;line-height:1.5;color:${INK_SOFT};">
              ${safePractice} · Sent via <a href="https://crestio.ai" style="color:${INK_SOFT};text-decoration:underline;">crestio.ai</a>
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
