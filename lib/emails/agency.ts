// Agency emails: enquiry received (family), enquiry alert (owner),
// application received (applicant), application alert (owner).
// One shared shell keeps them consistent with the parent-portal emails.

import { AGENCY, NEEDS, subjectLabels } from '../agency';

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

type ShellArgs = {
  kicker: string;
  heading: string;
  preheader: string;
  paragraphs: string[];       // already-escaped HTML fragments
  cta?: { label: string; url: string } | null;
  facts?: Array<[string, string]>; // label, value (escaped inside)
};

function shell({ kicker, heading, preheader, paragraphs, cta, facts }: ShellArgs): string {
  const factsHtml = facts && facts.length > 0
    ? `<tr><td style="padding:0 0 24px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${RULE};border-radius:6px;">` +
      facts.map(([k, v]) =>
        `<tr><td style="padding:8px 12px;font-family:${FONT_BODY};font-size:12px;color:${INK_MUTED};width:38%;border-bottom:1px solid ${RULE};">${escapeHtml(k)}</td>` +
        `<td style="padding:8px 12px;font-family:${FONT_BODY};font-size:14px;color:${INK};border-bottom:1px solid ${RULE};">${escapeHtml(v)}</td></tr>`,
      ).join('') +
      `</table></td></tr>`
    : '';
  const ctaHtml = cta
    ? `<tr><td style="padding:0 0 28px 0;"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background-color:${FOREST};color:${CREAM};font-family:${FONT_BODY};font-size:15px;font-weight:500;text-decoration:none;padding:14px 28px;border-radius:4px;">${escapeHtml(cta.label)}</a></td></tr>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM};font-family:${FONT_BODY};color:${INK};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${CREAM};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background-color:${CREAM};">
        <tr><td style="padding:0 0 24px 0;"><span style="font-family:${FONT_DISPLAY};font-size:28px;letter-spacing:-0.02em;color:${INK};font-weight:600;">crest<span style="font-style:italic;color:${FOREST};">io</span></span></td></tr>
        <tr><td style="padding:0 0 8px 0;"><div style="font-family:${FONT_BODY};font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:${INK_MUTED};">${escapeHtml(kicker)}</div></td></tr>
        <tr><td style="padding:0 0 20px 0;"><h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:600;font-size:30px;line-height:1.15;letter-spacing:-0.02em;color:${INK};">${escapeHtml(heading)}</h1></td></tr>
        ${paragraphs.map((p) => `<tr><td style="padding:0 0 18px 0;"><p style="margin:0;font-family:${FONT_BODY};font-size:16px;line-height:1.6;color:${INK};">${p}</p></td></tr>`).join('')}
        ${factsHtml}
        ${ctaHtml}
        <tr><td style="padding:24px 0 0 0;border-top:1px solid ${RULE};"><p style="margin:24px 0 0 0;font-family:${FONT_BODY};font-size:12px;line-height:1.6;color:${INK_MUTED};">${escapeHtml(AGENCY.name)} · Sydney · <a href="${AGENCY.siteUrl}" style="color:${INK_MUTED};text-decoration:underline;">crestio.ai</a> · <a href="mailto:${AGENCY.email}" style="color:${INK_MUTED};text-decoration:underline;">${AGENCY.email}</a></p></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Plaintext must stay pure ASCII (see parentInvitation.ts for why).
function ascii(s: string): string {
  return s.replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/·/g, '-').replace(/[^\x00-\x7F]/g, '');
}

function needLabel(key: string | null): string | null {
  if (!key) return null;
  return NEEDS.find((n) => n.key === key)?.label ?? null;
}

function modeLabel(mode: string): string {
  return mode === 'online' ? 'Online' : mode === 'in_home' ? 'In-home' : mode === 'both' ? 'Online or in-home' : 'Either';
}

// ---------------------------------------------------------------------------

export type EnquiryEmailArgs = {
  parentName: string;
  email: string;
  phone: string | null;
  studentFirstName: string | null;
  yearLevel: string;
  subjects: readonly string[];
  mode: string;
  suburb: string | null;
  need: string | null;
  message: string | null;
  enquiryId: string;
};

export function buildEnquiryReceivedEmail(a: EnquiryEmailArgs): Built {
  const first = a.parentName.split(' ')[0] || 'there';
  const subjects = subjectLabels(a.subjects).join(', ');
  const subject = `Thanks ${first} — we've got your enquiry`;
  const paragraphs = [
    `Thanks for getting in touch with ${escapeHtml(AGENCY.name)}. ${escapeHtml(AGENCY.founder.firstName)} reads every enquiry personally and will reply within ${AGENCY.policies.replyWithinHours} hours with a suggested tutor and next steps.`,
    `Here is what you told us. If anything is wrong, just reply to this email.`,
  ];
  const facts: Array<[string, string]> = [
    ['Student', a.studentFirstName ? `${a.studentFirstName} · ${a.yearLevel}` : a.yearLevel],
    ['Subjects', subjects],
    ['Lessons', modeLabel(a.mode) + (a.suburb ? ` · ${a.suburb}` : '')],
  ];
  const nl = needLabel(a.need);
  if (nl) facts.push(['Focus', nl]);
  const html = shell({
    kicker: 'Enquiry received',
    heading: `We'll match ${a.studentFirstName ? escapeHtml(a.studentFirstName) : 'your student'} with the right tutor.`,
    preheader: `Reply within ${AGENCY.policies.replyWithinHours} hours with a suggested tutor.`,
    paragraphs,
    facts,
  });
  const text = ascii(
    `Hi ${first},\n\n` +
    `Thanks for getting in touch with ${AGENCY.name}. ${AGENCY.founder.firstName} reads every enquiry personally and will reply within ${AGENCY.policies.replyWithinHours} hours with a suggested tutor and next steps.\n\n` +
    `What you told us:\n` +
    facts.map(([k, v]) => `- ${k}: ${v}`).join('\n') + `\n\n` +
    `If anything is wrong, just reply to this email.\n\n--\n${AGENCY.name} | Sydney | ${AGENCY.siteUrl}\n`,
  );
  return { subject, html, text };
}

export function buildEnquiryAlertEmail(a: EnquiryEmailArgs): Built {
  const subjects = subjectLabels(a.subjects).join(', ');
  const subject = `New enquiry: ${a.yearLevel} ${subjects} · ${modeLabel(a.mode)}${a.suburb ? ` · ${a.suburb}` : ''}`;
  const url = `${AGENCY.siteUrl}/app/leads?enquiry=${a.enquiryId}`;
  const facts: Array<[string, string]> = [
    ['Parent', a.parentName],
    ['Email', a.email],
    ['Phone', a.phone ?? '—'],
    ['Student', a.studentFirstName ? `${a.studentFirstName} · ${a.yearLevel}` : a.yearLevel],
    ['Subjects', subjects],
    ['Lessons', modeLabel(a.mode) + (a.suburb ? ` · ${a.suburb}` : '')],
    ['Focus', needLabel(a.need) ?? '—'],
  ];
  if (a.message) facts.push(['Message', a.message]);
  const html = shell({
    kicker: 'New enquiry',
    heading: `${escapeHtml(a.parentName)} wants a ${escapeHtml(subjects)} tutor.`,
    preheader: `${a.yearLevel} · ${modeLabel(a.mode)}${a.suburb ? ` · ${a.suburb}` : ''}`,
    paragraphs: [`Reply within ${AGENCY.policies.replyWithinHours} hours. Open the lead to log contact, assign a tutor, or convert it to a household.`],
    facts,
    cta: { label: 'Open lead', url },
  });
  const text = ascii(
    `New enquiry\n\n` + facts.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nOpen: ${url}\n`,
  );
  return { subject, html, text };
}

// ---------------------------------------------------------------------------

export type ApplicationEmailArgs = {
  fullName: string;
  email: string;
  phone: string;
  suburb: string;
  subjects: readonly string[];
  qualifications: string;
  wwccStatus: string;
  mode: string;
  availability: string | null;
  experience: string | null;
  cvUrl: string | null;
  message: string | null;
  applicationId: string;
};

function wwccLabel(s: string): string {
  return s === 'current' ? 'Current' : s === 'applying' ? 'Applying now' : 'Not yet';
}

export function buildApplicationReceivedEmail(a: ApplicationEmailArgs): Built {
  const first = a.fullName.split(' ')[0] || 'there';
  const subject = `Thanks ${first} — your Crestio tutor application`;
  const html = shell({
    kicker: 'Application received',
    heading: 'Thanks for applying to tutor with Crestio.',
    preheader: 'We read every application personally.',
    paragraphs: [
      `${escapeHtml(AGENCY.founder.firstName)} reads every application personally. If your subjects and results are a match, you'll hear back within a week with a time for a short video call.`,
      `What happens next: a 15-minute call, a short subject test, a Working With Children Check we verify, and a 20-minute practice lesson. Then, if it's a fit, students matched to your strengths.`,
    ],
    facts: [
      ['Subjects', subjectLabels(a.subjects).join(', ')],
      ['Lessons', modeLabel(a.mode) + ` · ${a.suburb}`],
      ['WWCC', wwccLabel(a.wwccStatus)],
    ],
  });
  const text = ascii(
    `Hi ${first},\n\nThanks for applying to tutor with Crestio. ${AGENCY.founder.firstName} reads every application personally. If your subjects and results are a match, you'll hear back within a week with a time for a short video call.\n\n` +
    `What happens next: a 15-minute call, a short subject test, a Working With Children Check we verify, and a 20-minute practice lesson.\n\n--\n${AGENCY.name} | Sydney | ${AGENCY.siteUrl}\n`,
  );
  return { subject, html, text };
}

export function buildApplicationAlertEmail(a: ApplicationEmailArgs): Built {
  const subjects = subjectLabels(a.subjects).join(', ');
  const subject = `New tutor application: ${a.fullName} · ${subjects} · ${a.suburb}`;
  const url = `${AGENCY.siteUrl}/app/leads/applications?application=${a.applicationId}`;
  const facts: Array<[string, string]> = [
    ['Name', a.fullName],
    ['Email', a.email],
    ['Phone', a.phone],
    ['Suburb', a.suburb],
    ['Subjects', subjects],
    ['Results', a.qualifications],
    ['WWCC', wwccLabel(a.wwccStatus)],
    ['Lessons', modeLabel(a.mode)],
  ];
  if (a.availability) facts.push(['Availability', a.availability]);
  if (a.experience) facts.push(['Experience', a.experience]);
  if (a.cvUrl) facts.push(['CV', a.cvUrl]);
  if (a.message) facts.push(['Message', a.message]);
  const html = shell({
    kicker: 'New tutor application',
    heading: `${escapeHtml(a.fullName)} applied to tutor ${escapeHtml(subjects)}.`,
    preheader: `${a.suburb} · WWCC ${wwccLabel(a.wwccStatus)}`,
    paragraphs: ['Screen it, book a call, or send an invitation from the applications page.'],
    facts,
    cta: { label: 'Open application', url },
  });
  const text = ascii(`New tutor application\n\n` + facts.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nOpen: ${url}\n`);
  return { subject, html, text };
}
