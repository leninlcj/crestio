// Student-portal email templates.  Strict design rules:
//   - Subject lines are tutor-led (never include "Crestio").
//   - Body is short and factual, never marketing.
//   - Reply-to is the tutor's reply-to address (the api caller passes it in).
//   - Plain text mirrors HTML, ASCII-safe (Resend quoted-printable workaround).
//   - 600px width, table layout, inline CSS for Outlook/Gmail compatibility.

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
const FOREST_DEFAULT = '#1a3a2a';
const RULE = '#e8e3d8';

type WrapArgs = {
  /** Hex color (with leading #) or null/undefined to use the default forest. */
  brandColor?: string | null;
  /** Tutor's display business name — appears in the email header. */
  tutorBusinessName: string;
  preheader: string;
  body: string;
  footerExtra?: string;
};

function wrap({ brandColor, tutorBusinessName, preheader, body, footerExtra }: WrapArgs, subject: string): string {
  const accent = brandColor && /^#[0-9A-Fa-f]{6}$/.test(brandColor) ? brandColor : FOREST_DEFAULT;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM};font-family:${FONT_BODY};color:${INK};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${CREAM};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background-color:${CREAM};">
          <tr>
            <td style="padding:0 0 24px 0;">
              <span style="font-family:${FONT_DISPLAY};font-size:24px;letter-spacing:-0.02em;color:${INK};font-weight:600;">${escapeHtml(tutorBusinessName)}</span>
            </td>
          </tr>
          ${body}
          <tr>
            <td style="padding:32px 0 0 0;border-top:1px solid ${RULE};">
              <p style="margin:24px 0 0 0;font-family:${FONT_BODY};font-size:12px;line-height:1.6;color:${INK_MUTED};">
                ${footerExtra ?? ''}
                You received this email because ${escapeHtml(tutorBusinessName)} uses Crestio for tutoring administration.
                <span style="color:${INK_MUTED};opacity:0.7;"> · via Crestio</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.replace('{{ACCENT}}', accent);
}

// ----------------------------------------------------------------------
// Parent consent request — sent when tutor enables a sub-16 student.
// ----------------------------------------------------------------------
export function buildParentConsentRequestEmail(args: {
  parentName: string;
  studentFirstName: string;
  tutorBusinessName: string;
  brandColor?: string | null;
  consentUrl: string;
}): Built {
  const accent = args.brandColor && /^#[0-9A-Fa-f]{6}$/.test(args.brandColor) ? args.brandColor : FOREST_DEFAULT;
  const subject = `Approve student portal access for ${args.studentFirstName}`;
  const text =
    `${args.tutorBusinessName} would like to invite ${args.studentFirstName} to view their tutoring sessions in a private student portal.\n\n` +
    `Before ${args.studentFirstName} can sign in, you need to approve.\n\n` +
    `Review the request:\n${args.consentUrl}\n\n` +
    `What ${args.studentFirstName} will see: their session schedule, polished session notes, homework checkboxes, and files ${args.tutorBusinessName} shares.\n\n` +
    `What ${args.studentFirstName} will NOT see: other students, invoices, money, or direct messaging.\n\n` +
    `You can revoke access at any time from your parent portal.\n\n` +
    `If you didn't expect this email, you can ignore it. ${args.studentFirstName}'s account will not be created until you approve.\n`;

  const body = `
    <tr><td style="padding:0 0 8px 0;">
      <div style="font-family:${FONT_BODY};font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:${INK_MUTED};">Parental consent</div>
    </td></tr>
    <tr><td style="padding:0 0 16px 0;">
      <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:600;font-size:30px;line-height:1.2;letter-spacing:-0.02em;color:${INK};">Approve student portal access for ${escapeHtml(args.studentFirstName)}?</h1>
    </td></tr>
    <tr><td style="padding:0 0 24px 0;">
      <p style="margin:0;font-family:${FONT_BODY};font-size:16px;line-height:1.6;color:${INK};">
        ${escapeHtml(args.tutorBusinessName)} would like ${escapeHtml(args.studentFirstName)} to be able to log in to a private student portal. Because ${escapeHtml(args.studentFirstName)} is under 16, your approval is needed first.
      </p>
    </td></tr>
    <tr><td style="padding:0 0 28px 0;">
      <a href="${escapeHtml(args.consentUrl)}" style="display:inline-block;background-color:${accent};color:${CREAM};font-family:${FONT_BODY};font-size:15px;font-weight:500;text-decoration:none;padding:14px 28px;border-radius:4px;">Review request</a>
    </td></tr>
    <tr><td style="padding:0 0 16px 0;">
      <p style="margin:0;font-family:${FONT_BODY};font-size:14px;line-height:1.6;color:${INK_MUTED};">
        You can revoke access any time from your parent portal. ${escapeHtml(args.studentFirstName)}'s account will not be created until you approve.
      </p>
    </td></tr>`;

  return {
    subject,
    text,
    html: wrap({ brandColor: args.brandColor, tutorBusinessName: args.tutorBusinessName, preheader: subject, body }, subject),
  };
}

// ----------------------------------------------------------------------
// Student invitation — sent after parent consent (or directly for 16+).
// ----------------------------------------------------------------------
export function buildStudentInvitationEmail(args: {
  studentFirstName: string;
  tutorBusinessName: string;
  brandColor?: string | null;
  acceptUrl: string;
}): Built {
  const accent = args.brandColor && /^#[0-9A-Fa-f]{6}$/.test(args.brandColor) ? args.brandColor : FOREST_DEFAULT;
  const subject = `${args.tutorBusinessName} invited you to view your sessions`;
  const text =
    `Hi ${args.studentFirstName},\n\n` +
    `${args.tutorBusinessName} set up a private student portal for you. ` +
    `It's where you'll find your session schedule, notes from each lesson, homework, and files ${args.tutorBusinessName} shares with you.\n\n` +
    `Set up your account:\n${args.acceptUrl}\n\n` +
    `This link expires in 14 days.\n\n` +
    `If you have any questions, reply to this email.\n`;

  const body = `
    <tr><td style="padding:0 0 8px 0;">
      <div style="font-family:${FONT_BODY};font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:${INK_MUTED};">Student portal</div>
    </td></tr>
    <tr><td style="padding:0 0 16px 0;">
      <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:600;font-size:30px;line-height:1.2;letter-spacing:-0.02em;color:${INK};">Hi ${escapeHtml(args.studentFirstName)}, set up your portal</h1>
    </td></tr>
    <tr><td style="padding:0 0 24px 0;">
      <p style="margin:0;font-family:${FONT_BODY};font-size:16px;line-height:1.6;color:${INK};">
        ${escapeHtml(args.tutorBusinessName)} created a private student portal for you. It's where you'll find your sessions, lesson notes, homework, and any files ${escapeHtml(args.tutorBusinessName)} shares with you.
      </p>
    </td></tr>
    <tr><td style="padding:0 0 28px 0;">
      <a href="${escapeHtml(args.acceptUrl)}" style="display:inline-block;background-color:${accent};color:${CREAM};font-family:${FONT_BODY};font-size:15px;font-weight:500;text-decoration:none;padding:14px 28px;border-radius:4px;">Set up your account</a>
    </td></tr>
    <tr><td style="padding:0 0 16px 0;">
      <p style="margin:0;font-family:${FONT_BODY};font-size:14px;line-height:1.6;color:${INK_MUTED};">
        This link expires in 14 days. If you have any questions, reply to this email and ${escapeHtml(args.tutorBusinessName)} will get back to you.
      </p>
    </td></tr>`;

  return {
    subject,
    text,
    html: wrap({ brandColor: args.brandColor, tutorBusinessName: args.tutorBusinessName, preheader: subject, body }, subject),
  };
}

// ----------------------------------------------------------------------
// Welcome email after acceptance.
// ----------------------------------------------------------------------
export function buildStudentWelcomeEmail(args: {
  studentFirstName: string;
  tutorBusinessName: string;
  brandColor?: string | null;
  portalUrl: string;
}): Built {
  const accent = args.brandColor && /^#[0-9A-Fa-f]{6}$/.test(args.brandColor) ? args.brandColor : FOREST_DEFAULT;
  const subject = `You're set up. Your portal is ready`;
  const text =
    `You're set, ${args.studentFirstName}.\n\n` +
    `Your portal is at:\n${args.portalUrl}\n\n` +
    `Here's what you'll see in there:\n` +
    `- Your upcoming sessions\n` +
    `- Notes from each session, after ${args.tutorBusinessName} writes them up\n` +
    `- Homework you can mark done\n` +
    `- Files ${args.tutorBusinessName} shares with you\n\n` +
    `If anything ever feels wrong, tell your parent or ${args.tutorBusinessName}.\n`;

  const body = `
    <tr><td style="padding:0 0 16px 0;">
      <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:600;font-size:30px;line-height:1.2;letter-spacing:-0.02em;color:${INK};">You're set up, ${escapeHtml(args.studentFirstName)}.</h1>
    </td></tr>
    <tr><td style="padding:0 0 16px 0;">
      <p style="margin:0;font-family:${FONT_BODY};font-size:16px;line-height:1.6;color:${INK};">
        Your portal is open. You'll find your sessions, notes, homework, and any files ${escapeHtml(args.tutorBusinessName)} shares with you.
      </p>
    </td></tr>
    <tr><td style="padding:0 0 28px 0;">
      <a href="${escapeHtml(args.portalUrl)}" style="display:inline-block;background-color:${accent};color:${CREAM};font-family:${FONT_BODY};font-size:15px;font-weight:500;text-decoration:none;padding:14px 28px;border-radius:4px;">Open your portal</a>
    </td></tr>
    <tr><td style="padding:0 0 16px 0;">
      <p style="margin:0;font-family:${FONT_BODY};font-size:14px;line-height:1.6;color:${INK_MUTED};">
        If anything ever feels wrong, tell your parent or ${escapeHtml(args.tutorBusinessName)}.
      </p>
    </td></tr>`;

  return {
    subject,
    text,
    html: wrap({ brandColor: args.brandColor, tutorBusinessName: args.tutorBusinessName, preheader: subject, body }, subject),
  };
}

// ----------------------------------------------------------------------
// New session note from tutor.
// ----------------------------------------------------------------------
export function buildStudentNewNoteEmail(args: {
  studentFirstName: string;
  tutorBusinessName: string;
  brandColor?: string | null;
  sessionDate: string;
  notePreview: string;
  noteUrl: string;
}): Built {
  const accent = args.brandColor && /^#[0-9A-Fa-f]{6}$/.test(args.brandColor) ? args.brandColor : FOREST_DEFAULT;
  const subject = `${args.tutorBusinessName} sent you notes from ${args.sessionDate}`;
  const text =
    `Hi ${args.studentFirstName},\n\n` +
    `${args.tutorBusinessName} sent you notes from your session on ${args.sessionDate}.\n\n` +
    `Preview:\n${args.notePreview}\n\n` +
    `Read the full notes:\n${args.noteUrl}\n`;
  const body = `
    <tr><td style="padding:0 0 16px 0;">
      <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:600;font-size:24px;line-height:1.2;letter-spacing:-0.02em;color:${INK};">Notes from ${escapeHtml(args.sessionDate)}</h1>
    </td></tr>
    <tr><td style="padding:0 0 16px 0;">
      <p style="margin:0;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${INK_MUTED};">
        ${escapeHtml(args.notePreview)}…
      </p>
    </td></tr>
    <tr><td style="padding:0 0 28px 0;">
      <a href="${escapeHtml(args.noteUrl)}" style="display:inline-block;background-color:${accent};color:${CREAM};font-family:${FONT_BODY};font-size:15px;font-weight:500;text-decoration:none;padding:12px 22px;border-radius:4px;">Open notes</a>
    </td></tr>`;
  return { subject, text, html: wrap({ brandColor: args.brandColor, tutorBusinessName: args.tutorBusinessName, preheader: subject, body }, subject) };
}

// ----------------------------------------------------------------------
// New homework assigned.
// ----------------------------------------------------------------------
export function buildStudentHomeworkEmail(args: {
  studentFirstName: string;
  tutorBusinessName: string;
  brandColor?: string | null;
  sessionDate: string;
  homeworkPreview: string;
  homeworkUrl: string;
}): Built {
  const accent = args.brandColor && /^#[0-9A-Fa-f]{6}$/.test(args.brandColor) ? args.brandColor : FOREST_DEFAULT;
  const subject = `Homework from ${args.sessionDate}'s session`;
  const text =
    `Hi ${args.studentFirstName},\n\n` +
    `${args.tutorBusinessName} added homework from your ${args.sessionDate} session.\n\n` +
    `${args.homeworkPreview}\n\n` +
    `View and check it off:\n${args.homeworkUrl}\n`;
  const body = `
    <tr><td style="padding:0 0 16px 0;">
      <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:600;font-size:24px;line-height:1.2;letter-spacing:-0.02em;color:${INK};">Homework from ${escapeHtml(args.sessionDate)}</h1>
    </td></tr>
    <tr><td style="padding:0 0 16px 0;">
      <p style="margin:0;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${INK};">
        ${escapeHtml(args.homeworkPreview)}
      </p>
    </td></tr>
    <tr><td style="padding:0 0 28px 0;">
      <a href="${escapeHtml(args.homeworkUrl)}" style="display:inline-block;background-color:${accent};color:${CREAM};font-family:${FONT_BODY};font-size:15px;font-weight:500;text-decoration:none;padding:12px 22px;border-radius:4px;">Open homework</a>
    </td></tr>`;
  return { subject, text, html: wrap({ brandColor: args.brandColor, tutorBusinessName: args.tutorBusinessName, preheader: subject, body }, subject) };
}

// ----------------------------------------------------------------------
// Parent revoke confirmation (sent to parent after they revoke).
// ----------------------------------------------------------------------
export function buildParentRevokeConfirmationEmail(args: {
  parentName: string;
  studentFirstName: string;
  tutorBusinessName: string;
  brandColor?: string | null;
}): Built {
  const subject = `Access ended for ${args.studentFirstName}`;
  const text =
    `You've revoked ${args.studentFirstName}'s access to the student portal.\n\n` +
    `${args.studentFirstName} can no longer sign in. Their data is kept by ${args.tutorBusinessName} so they can continue tutoring.\n\n` +
    `If you'd like to restore access, contact ${args.tutorBusinessName}.\n`;
  const body = `
    <tr><td style="padding:0 0 16px 0;">
      <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:600;font-size:24px;line-height:1.2;letter-spacing:-0.02em;color:${INK};">Access ended for ${escapeHtml(args.studentFirstName)}</h1>
    </td></tr>
    <tr><td style="padding:0 0 16px 0;">
      <p style="margin:0;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${INK};">
        You've revoked ${escapeHtml(args.studentFirstName)}'s student portal access. They can no longer sign in.
      </p>
    </td></tr>
    <tr><td style="padding:0 0 16px 0;">
      <p style="margin:0;font-family:${FONT_BODY};font-size:14px;line-height:1.6;color:${INK_MUTED};">
        Their data stays with ${escapeHtml(args.tutorBusinessName)} so they can keep tutoring. If you'd like to restore access, contact ${escapeHtml(args.tutorBusinessName)}.
      </p>
    </td></tr>`;
  return { subject, text, html: wrap({ brandColor: args.brandColor, tutorBusinessName: args.tutorBusinessName, preheader: subject, body }, subject) };
}

// ----------------------------------------------------------------------
// Tutor notification — student accepted invitation.
// ----------------------------------------------------------------------
export function buildTutorAcceptanceNotificationEmail(args: {
  tutorEmail: string;
  studentName: string;
}): Built {
  const subject = `${args.studentName} accepted the portal invitation`;
  const text = `${args.studentName} just set up their student portal account and signed in for the first time.\n`;
  const body = `
    <tr><td style="padding:0 0 16px 0;">
      <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:600;font-size:22px;line-height:1.3;color:${INK};">${escapeHtml(args.studentName)} accepted the portal invitation</h1>
    </td></tr>
    <tr><td style="padding:0 0 16px 0;">
      <p style="margin:0;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${INK};">
        They've set up their account and signed in for the first time.
      </p>
    </td></tr>`;
  return { subject, text, html: wrap({ tutorBusinessName: 'Crestio', preheader: subject, body }, subject) };
}

export function buildTutorConsentDeclineNotificationEmail(args: {
  parentName: string;
  studentName: string;
}): Built {
  const subject = `${args.parentName} declined consent for ${args.studentName}'s portal`;
  const text =
    `${args.parentName} declined the consent request to set up a student portal for ${args.studentName}.\n\n` +
    `No invitation was sent. ${args.studentName}'s account remains disabled.\n`;
  const body = `
    <tr><td style="padding:0 0 16px 0;">
      <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:600;font-size:22px;line-height:1.3;color:${INK};">${escapeHtml(args.parentName)} declined consent for ${escapeHtml(args.studentName)}</h1>
    </td></tr>
    <tr><td style="padding:0 0 16px 0;">
      <p style="margin:0;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${INK};">
        No invitation was sent. The student account stays disabled until consent is given.
      </p>
    </td></tr>`;
  return { subject, text, html: wrap({ tutorBusinessName: 'Crestio', preheader: subject, body }, subject) };
}
