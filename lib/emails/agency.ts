// Agency emails: enquiry received (family), enquiry alert (owner),
// application received (applicant), application alert (owner).
// One shared shell keeps them consistent with the parent-portal emails.

import { AGENCY, NEEDS, bestTimeLabel, subjectLabels } from '../agency';

export type Built = { subject: string; html: string; text: string };

export function escapeHtml(s: string): string {
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

export type ShellArgs = {
  kicker: string;
  heading: string;
  preheader: string;
  paragraphs: string[];       // already-escaped HTML fragments
  cta?: { label: string; url: string } | null;
  facts?: Array<[string, string]>; // label, value (escaped inside)
};

export function shell({ kicker, heading, preheader, paragraphs, cta, facts }: ShellArgs): string {
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
export function ascii(s: string): string {
  return s.replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u00B7/g, '-').replace(/[^\x00-\x7F]/g, '');
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
  /** Null for a call request that gave no email; the family email is then skipped. */
  email: string | null;
  phone: string | null;
  studentFirstName: string | null;
  yearLevel: string;
  subjects: readonly string[];
  mode: string;
  suburb: string | null;
  need: string | null;
  message: string | null;
  enquiryId: string;
  /** 'call' for the phone-first form. Default 'email'. */
  preferredContact?: 'email' | 'call';
  bestTime?: string | null;
  /** Title of the group class the family asked about, if any. */
  className?: string | null;
};

function subjectsOrTbc(subjects: readonly string[]): string {
  return subjects.length > 0 ? subjectLabels(subjects).join(', ') : 'To be discussed on the call';
}

export function buildEnquiryReceivedEmail(a: EnquiryEmailArgs): Built {
  const first = a.parentName.split(' ')[0] || 'there';
  const isCall = a.preferredContact === 'call';
  const subjects = subjectsOrTbc(a.subjects);
  const subject = isCall ? `Thanks ${first}, ${AGENCY.founder.firstName} will call you shortly` : `Thanks ${first}, we have your enquiry`;
  const paragraphs = isCall
    ? [
        `Thanks for asking ${escapeHtml(AGENCY.name)} to call. ${escapeHtml(AGENCY.callBack.promise)}${a.phone ? ` We will call ${escapeHtml(a.phone)}.` : ''}`,
        `The call takes about ten minutes: what your student needs, which days suit, online or at home. Then ${escapeHtml(AGENCY.founder.firstName)} hand-picks the tutor.`,
        `Here is what you told us. If anything is wrong, just reply to this email.`,
      ]
    : [
        `Thanks for getting in touch with ${escapeHtml(AGENCY.name)}. ${escapeHtml(AGENCY.founder.firstName)} reads every enquiry personally and will reply within ${AGENCY.policies.replyWithinHours} hours with a suggested tutor and next steps.`,
        `Here is what you told us. If anything is wrong, just reply to this email.`,
      ];
  const facts: Array<[string, string]> = [
    ['Student', a.studentFirstName ? `${a.studentFirstName} · ${a.yearLevel}` : a.yearLevel],
    ['Subjects', subjects],
  ];
  if (a.className) facts.push(['Class', a.className]);
  if (!isCall || a.mode !== 'either' || a.suburb) facts.push(['Lessons', modeLabel(a.mode) + (a.suburb ? ` · ${a.suburb}` : '')]);
  const nl = needLabel(a.need);
  if (nl) facts.push(['Focus', nl]);
  if (isCall) {
    const bt = bestTimeLabel(a.bestTime);
    if (bt) facts.push(['Best time to call', bt]);
  }
  const html = shell({
    kicker: isCall ? 'Call request received' : 'Enquiry received',
    heading: isCall
      ? `${escapeHtml(AGENCY.founder.firstName)} will call you shortly.`
      : `We'll match ${a.studentFirstName ? escapeHtml(a.studentFirstName) : 'your student'} with the right tutor.`,
    preheader: isCall ? AGENCY.callBack.promise : `Reply within ${AGENCY.policies.replyWithinHours} hours with a suggested tutor.`,
    paragraphs,
    facts,
  });
  const intro = isCall
    ? `Thanks for asking ${AGENCY.name} to call. ${AGENCY.callBack.promise}${a.phone ? ` We will call ${a.phone}.` : ''}\n\nThe call takes about ten minutes: what your student needs, which days suit, online or at home. Then ${AGENCY.founder.firstName} hand-picks the tutor.`
    : `Thanks for getting in touch with ${AGENCY.name}. ${AGENCY.founder.firstName} reads every enquiry personally and will reply within ${AGENCY.policies.replyWithinHours} hours with a suggested tutor and next steps.`;
  const text = ascii(
    `Hi ${first},\n\n${intro}\n\n` +
    `What you told us:\n` +
    facts.map(([k, v]) => `- ${k}: ${v}`).join('\n') + `\n\n` +
    `If anything is wrong, just reply to this email.\n\n--\n${AGENCY.name} | Sydney | ${AGENCY.siteUrl}\n`,
  );
  return { subject, html, text };
}

export function buildEnquiryAlertEmail(a: EnquiryEmailArgs): Built {
  const isCall = a.preferredContact === 'call';
  const subjects = subjectsOrTbc(a.subjects);
  const where = `${modeLabel(a.mode)}${a.suburb ? ` · ${a.suburb}` : ''}`;
  const subject = isCall
    ? `CALL ${a.phone ?? ''}: ${a.parentName} · ${a.yearLevel}${a.subjects.length > 0 ? ` ${subjectLabels(a.subjects).join(', ')}` : ''}${a.className ? ` · ${a.className}` : ''}`
    : `New enquiry: ${a.yearLevel} ${subjects} · ${where}`;
  const url = `${AGENCY.siteUrl}/app/leads?enquiry=${a.enquiryId}`;
  const facts: Array<[string, string]> = [
    ['Parent', a.parentName],
    ['Phone', a.phone ?? 'Not given'],
    ['Email', a.email ?? 'Not given'],
  ];
  if (isCall) facts.push(['Best time', bestTimeLabel(a.bestTime) ?? 'Any time']);
  facts.push(
    ['Student', a.studentFirstName ? `${a.studentFirstName} · ${a.yearLevel}` : a.yearLevel],
    ['Subjects', subjects],
  );
  if (a.className) facts.push(['Class', a.className]);
  facts.push(['Lessons', where], ['Focus', needLabel(a.need) ?? 'Not given']);
  if (a.message) facts.push(['Message', a.message]);
  const html = shell({
    kicker: isCall ? 'Call request' : 'New enquiry',
    heading: isCall
      ? `Call ${escapeHtml(a.parentName)}${a.phone ? ` on ${escapeHtml(a.phone)}` : ''}.`
      : `${escapeHtml(a.parentName)} wants a ${escapeHtml(subjects)} tutor.`,
    preheader: isCall ? `${a.yearLevel} · ${subjects}` : `${a.yearLevel} · ${where}`,
    paragraphs: [
      isCall
        ? `The family was told: ${escapeHtml(AGENCY.callBack.promise)} Open the lead, tap the number to call, then mark it reached or send the no-answer note.`
        : `Reply within ${AGENCY.policies.replyWithinHours} hours. Open the lead to log contact, assign a tutor, or convert it to a household.`,
    ],
    facts,
    cta: { label: 'Open lead', url },
  });
  const text = ascii(
    `${isCall ? 'Call request' : 'New enquiry'}\n\n` + facts.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nOpen: ${url}\n`,
  );
  return { subject, html, text };
}

// Sent when the owner tried to call and nobody answered. The promise the site
// made ("always within one business day") is restated, and the family is
// asked for a better time so the second attempt lands.
export type CallbackMissedArgs = {
  parentName: string;
  phone: string | null;
  attempts: number;
  lang?: 'en' | 'es';
};

export function buildCallbackMissedEmail(a: CallbackMissedArgs): Built {
  const first = a.parentName.split(' ')[0] || 'there';
  if (a.lang === 'es') {
    const subject = `Intentamos llamarte, ${first}`;
    const paragraphs = [
      `${escapeHtml(AGENCY.founder.firstName)} de ${escapeHtml(AGENCY.name)} acaba de intentar llamarte${a.phone ? ` al ${escapeHtml(a.phone)}` : ''} y no pudo comunicarse.`,
      `Volveremos a intentarlo dentro de un día hábil. Si hay un horario que te venga mejor, responde a este correo con el día y la hora y llamaremos entonces.`,
    ];
    const html = shell({ kicker: 'Intentamos llamarte', heading: 'No pudimos comunicarnos. Lo intentaremos de nuevo.', preheader: 'Volveremos a llamar dentro de un día hábil.', paragraphs });
    const text = ascii(`Hola ${first},\n\n${AGENCY.founder.firstName} de ${AGENCY.name} acaba de intentar llamarte${a.phone ? ` al ${a.phone}` : ''} y no pudo comunicarse.\n\nVolveremos a intentarlo dentro de un dia habil. Si hay un horario que te venga mejor, responde a este correo con el dia y la hora y llamaremos entonces.\n\n--\n${AGENCY.name} | Sydney | ${AGENCY.siteUrl}\n`);
    return { subject, html, text };
  }
  const subject = `We tried to call you, ${first}`;
  const paragraphs = [
    `${escapeHtml(AGENCY.founder.firstName)} from ${escapeHtml(AGENCY.name)} just tried to call${a.phone ? ` ${escapeHtml(a.phone)}` : ''} and could not get through.`,
    `We will try again within one business day. If there is a time that suits you better, reply to this email with the day and time and we will call then.`,
  ];
  const html = shell({ kicker: 'We tried to call', heading: 'We could not reach you. We will try again.', preheader: 'Another call within one business day.', paragraphs });
  const text = ascii(
    `Hi ${first},\n\n${AGENCY.founder.firstName} from ${AGENCY.name} just tried to call${a.phone ? ` ${a.phone}` : ''} and could not get through.\n\n` +
    `We will try again within one business day. If there is a time that suits you better, reply to this email with the day and time and we will call then.\n\n--\n${AGENCY.name} | Sydney | ${AGENCY.siteUrl}\n`,
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
  const subject = `Thanks ${first}, we have your tutor application`;
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

// ---------------------------------------------------------------------------
// Tutor proposal to a family (sent from Leads once a tutor is assigned).
// ---------------------------------------------------------------------------

export type TutorProposalArgs = {
  parentName: string;
  studentFirstName: string | null;
  yearLevel: string;
  subjects: readonly string[];
  mode: string;
  tutor: { name: string; bio: string | null; subjects: string[] | null; suburb: string | null; levels: string[] | null };
  ownerMessage: string | null;
  proposedTimes: string | null;
};

export function buildTutorProposalEmail(a: TutorProposalArgs): Built {
  const first = a.parentName.split(' ')[0] || 'there';
  const student = a.studentFirstName ?? 'your student';
  const subjects = subjectLabels(a.subjects).join(' and ');
  const tutorFirst = a.tutor.name.split(' ')[0];
  const subject = `A tutor for ${student}: ${a.tutor.name}`;
  const paragraphs = [
    `Thanks for your patience. For ${escapeHtml(student)} (${escapeHtml(a.yearLevel)}, ${escapeHtml(subjects)}) I'd like to propose <strong>${escapeHtml(a.tutor.name)}</strong>.`,
    a.tutor.bio ? escapeHtml(a.tutor.bio) : `${escapeHtml(tutorFirst)} is interviewed, ID-checked and WWCC-verified, and teaches ${escapeHtml(subjects)}.`,
    a.ownerMessage ? escapeHtml(a.ownerMessage) : '',
    a.proposedTimes ? `Times that could work for the first lesson: ${escapeHtml(a.proposedTimes)}. Reply with the one that suits, or suggest another.` : `Reply with two or three times that suit for a first lesson and I'll confirm with ${escapeHtml(tutorFirst)}.`,
    `${escapeHtml(AGENCY.policies.firstLessonGuarantee)} There's no joining fee and no lock-in.`,
  ].filter(Boolean);
  const facts: Array<[string, string]> = [
    ['Tutor', a.tutor.name],
    ['Teaches', (a.tutor.subjects ?? []).join(', ') || subjects],
  ];
  if (a.tutor.levels && a.tutor.levels.length) facts.push(['Levels', a.tutor.levels.join(', ')]);
  facts.push(['Lessons', modeLabel(a.mode) + (a.tutor.suburb && a.mode !== 'online' ? ` · based in ${a.tutor.suburb}` : '')]);
  const html = shell({
    kicker: 'Your tutor match',
    heading: `Meet ${a.tutor.name}.`,
    preheader: `A tutor for ${student}: ${a.tutor.name}`,
    paragraphs,
    facts,
    cta: { label: 'See pricing and what is included', url: `${AGENCY.siteUrl}/pricing` },
  });
  const text = ascii(
    `Hi ${first},\n\n` +
    `Thanks for your patience. For ${student} (${a.yearLevel}, ${subjects}) I'd like to propose ${a.tutor.name}.\n\n` +
    (a.tutor.bio ? `${a.tutor.bio}\n\n` : '') +
    (a.ownerMessage ? `${a.ownerMessage}\n\n` : '') +
    (a.proposedTimes ? `Times that could work for the first lesson: ${a.proposedTimes}. Reply with the one that suits, or suggest another.\n\n` : `Reply with two or three times that suit for a first lesson and I'll confirm with ${tutorFirst}.\n\n`) +
    `${AGENCY.policies.firstLessonGuarantee} There's no joining fee and no lock-in.\n\n` +
    facts.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\n--\n${AGENCY.founder.name} | ${AGENCY.name} | ${AGENCY.siteUrl}\n`,
  );
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Follow-ups when an enquiry goes quiet. Sent by /api/cron/enquiry-followups:
// once on day 3, once on day 10, never again. Spanish when the family enquired
// through /es (source starts with "es:").
// ---------------------------------------------------------------------------

export type FollowupArgs = {
  parentName: string;
  studentFirstName: string | null;
  subjects: readonly string[];
  createdAt: string;      // ISO
  step: 1 | 2;
  lang: 'en' | 'es';
};

function dateLabel(iso: string, lang: 'en' | 'es'): string {
  try {
    return new Intl.DateTimeFormat(lang === 'es' ? 'es' : 'en-AU', { day: 'numeric', month: 'long', timeZone: 'Australia/Sydney' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function buildEnquiryFollowupEmail(a: FollowupArgs): Built {
  const first = a.parentName.split(' ')[0] || (a.lang === 'es' ? 'hola' : 'there');
  const subjects = subjectLabels(a.subjects).join(', ');
  const who = a.studentFirstName || (a.lang === 'es' ? 'el estudiante' : 'your student');
  const when = dateLabel(a.createdAt, a.lang);
  const founder = AGENCY.founder.firstName;
  const enquireUrl = `${AGENCY.siteUrl}${a.lang === 'es' ? '/es#consulta' : '/enquire'}`;

  if (a.lang === 'es') {
    const subject = a.step === 1 ? `¿Sigues buscando tutor para ${who}?` : `Cierro tu consulta (puedes responder cuando quieras)`;
    const raw = a.step === 1
      ? [
          `Soy ${founder}, de ${AGENCY.name}. El ${when} nos escribiste sobre ${subjects} para ${who}.`,
          `Si todavía lo estás pensando, responde a este correo con cualquier duda (horarios, el tutor, el precio) y te contesto yo mismo, en español. Si ya lo resolviste, no hace falta responder: no insistiré más allá de un último mensaje.`,
        ]
      : [
          `Soy ${founder}, de ${AGENCY.name}. Como no supe más de ti después de tu consulta del ${when}, la cierro de mi lado para no seguir escribiéndote.`,
          `Si las cosas cambian, responde a este correo o vuelve a escribirnos en crestio.ai/es. Mucha suerte a ${who} con ${subjects}.`,
        ];
    const paragraphs = raw.map(escapeHtml);
    const html = shell({
      kicker: a.step === 1 ? 'Tu consulta' : 'Cierro tu consulta',
      heading: a.step === 1 ? `¿Sigues buscando tutor para ${escapeHtml(who)}?` : `Cierro tu consulta, pero la puerta queda abierta.`,
      preheader: a.step === 1 ? 'Responde con cualquier duda y te contesto en español.' : 'Responde cuando quieras.',
      paragraphs,
      cta: a.step === 1 ? { label: 'Retomar la consulta', url: enquireUrl } : null,
    });
    // Spanish keeps its accents: the only link here is short, so the
    // quoted-printable encoding the accents trigger cannot break a URL.
    const text = `Hola ${first},\n\n` + raw.join('\n\n') + `\n\n--\n${AGENCY.name} | Sydney | ${AGENCY.siteUrl}\n`;
    return { subject, html, text };
  }

  const subject = a.step === 1 ? `Still looking for a ${subjects.split(',')[0].trim()} tutor for ${who}?` : `Closing your enquiry (reply any time)`;
  const raw = a.step === 1
    ? [
        `${founder} here from ${AGENCY.name}. On ${when} you enquired about ${subjects} for ${who}.`,
        `If you are still deciding, reply to this email with any question (times, the tutor, the price) and I will answer it personally. If you have already sorted it, no reply needed, and I will not chase beyond one more note.`,
      ]
    : [
        `${founder} here from ${AGENCY.name}. I have not heard back since your enquiry on ${when}, so I am closing it on my side so you do not keep hearing from me.`,
        `If things change, reply to this email or enquire again at crestio.ai/enquire. Good luck to ${who} with ${subjects}.`,
      ];
  const paragraphs = raw.map(escapeHtml);
  const html = shell({
    kicker: a.step === 1 ? 'Your enquiry' : 'Closing your enquiry',
    heading: a.step === 1 ? `Still looking for a tutor for ${escapeHtml(who)}?` : 'Closing your enquiry, with the door left open.',
    preheader: a.step === 1 ? 'Reply with any question and I will answer it personally.' : 'Reply any time.',
    paragraphs,
    cta: a.step === 1 ? { label: 'Pick up where you left off', url: enquireUrl } : null,
  });
  const text = ascii(`Hi ${first},\n\n` + raw.join('\n\n') + `\n\n--\n${AGENCY.name} | Sydney | ${AGENCY.siteUrl}\n`);
  return { subject, html, text };
}
