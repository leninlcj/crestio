// Chunk 5 emails: review requests and reminders (English and Spanish), the
// owner alert when a review arrives, the prepaid block invoice, the low-credit
// notice, the referral credit notice, and the owner's Monday check-in.
// All use the shell from ./agency so every Crestio email looks the same.

import { AGENCY, PREPAID_BLOCK, REFERRAL, REVIEWS } from '../agency';
import { formatCentsDetailed } from '../utils';
import { shell, escapeHtml, ascii, type Built } from './agency';
import type { ReviewLang } from '../reviews';

function footerText(): string {
  return `\n\n--\n${AGENCY.name} | Sydney | ${AGENCY.siteUrl}\n`;
}

function capitalise(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

// ---------------------------------------------------------------------------
// Review request and reminder
// ---------------------------------------------------------------------------

export type ReviewRequestArgs = {
  parentName: string | null;
  studentFirstName: string | null;
  tutorFirstName: string | null;
  reviewUrl: string;
  lang: ReviewLang;
  reminder?: boolean;
};

export function buildReviewRequestEmail(a: ReviewRequestArgs): Built {
  const founder = AGENCY.founder.firstName;
  const first = (a.parentName ?? '').split(' ')[0] || (a.lang === 'es' ? 'hola' : 'there');
  const student = a.studentFirstName;

  if (a.lang === 'es') {
    const who = student ?? 'tu hijo o hija';
    const subject = a.reminder ? `Un recordatorio corto: ¿cómo van las clases de ${who}?` : `¿Cómo van las clases de ${who}?`;
    const raw = a.reminder
      ? [
          `Soy ${founder}, de ${AGENCY.name}. Hace una semana te pedí unas frases sobre las clases de ${who}${a.tutorFirstName ? ` con ${a.tutorFirstName}` : ''}. Si tienes dos minutos, el enlace sigue abierto. Si no, no volveré a escribir por esto.`,
        ]
      : [
          `Soy ${founder}, de ${AGENCY.name}. ${capitalise(who)} ya lleva ${REVIEWS.askAfterLessons} clases${a.tutorFirstName ? ` con ${a.tutorFirstName}` : ''}, y me gustaría saber, con tus palabras, cómo va.`,
          `Toma dos minutos. Lo que escribas lo leo yo primero; solo se muestra en el sitio si tú lo autorizas, y nunca cambiamos las palabras. Si algo no va bien, también quiero saberlo: responde a este correo.`,
        ];
    const html = shell({
      kicker: a.reminder ? 'Recordatorio' : 'Tu opinión',
      heading: a.reminder ? `¿Cómo van las clases de ${escapeHtml(who)}?` : `¿Cómo van las clases de ${escapeHtml(who)}?`,
      preheader: 'Dos minutos, con tus palabras.',
      paragraphs: raw.map(escapeHtml),
      cta: { label: 'Escribir la reseña', url: a.reviewUrl },
    });
    const text = `Hola ${first},\n\n` + raw.join('\n\n') + `\n\nEscribir la reseña:\n${a.reviewUrl}` + footerText();
    return { subject, html, text };
  }

  const who = student ?? 'your child';
  const subject = a.reminder ? `A short reminder: how is tutoring going for ${who}?` : `How is tutoring going for ${who}?`;
  const raw = a.reminder
    ? [
        `${founder} here from ${AGENCY.name}. A week ago I asked for a few sentences about ${who}'s lessons${a.tutorFirstName ? ` with ${a.tutorFirstName}` : ''}. If you have two minutes, the link is still open. If not, I will not ask again.`,
      ]
    : [
        `${founder} here from ${AGENCY.name}. ${capitalise(who)} has now had ${REVIEWS.askAfterLessons} lessons${a.tutorFirstName ? ` with ${a.tutorFirstName}` : ''}, and I would like to know, in your own words, how it is going.`,
        `It takes two minutes. I read every review first; it appears on the site only if you say so, and we never edit the words. If something is not right, I want to know that too: just reply to this email.`,
      ];
  const html = shell({
    kicker: a.reminder ? 'A short reminder' : 'Your review',
    heading: `How is tutoring going for ${escapeHtml(who)}?`,
    preheader: 'Two minutes, in your own words.',
    paragraphs: raw.map(escapeHtml),
    cta: { label: 'Write the review', url: a.reviewUrl },
  });
  const text = ascii(`Hi ${first},\n\n` + raw.join('\n\n') + `\n\nWrite the review:\n${a.reviewUrl}` + footerText());
  return { subject, html, text };
}

export type ReviewSubmittedAlertArgs = {
  householdName: string;
  rating: number;
  body: string;
  reviewerName: string | null;
  consentPublic: boolean;
  reviewsUrl: string;
};

export function buildReviewSubmittedAlertEmail(a: ReviewSubmittedAlertArgs): Built {
  const stars = `${a.rating}/5`;
  const subject = `New review from the ${a.householdName}: ${stars}${a.consentPublic ? ', approve to show it' : ' (private)'}`;
  const raw = [
    `The ${a.householdName} left a ${stars} review${a.reviewerName ? ` as "${a.reviewerName}"` : ''}. ${a.consentPublic ? 'They agreed to it being shown on the site. Read it, then approve or hide it under Leads > Reviews.' : 'They did not tick the permission box, so it stays private. Read it for what it tells you.'}`,
    `"${a.body}"`,
  ];
  const html = shell({
    kicker: 'Review received',
    heading: `${stars} from the ${escapeHtml(a.householdName)}`,
    preheader: a.body.slice(0, 120),
    paragraphs: raw.map(escapeHtml),
    cta: { label: 'Open reviews', url: a.reviewsUrl },
  });
  const text = ascii(raw.join('\n\n') + `\n\nOpen reviews: ${a.reviewsUrl}` + footerText());
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Prepaid block invoice, low credit, referral credit
// ---------------------------------------------------------------------------

export type PrepaidBlockEmailArgs = {
  parentName: string | null;
  studentName: string | null;
  hours: number;
  faceValueCents: number;
  priceCents: number;
  invoiceNumber: string;
  payUrl: string | null;
  currency?: string;
};

export function buildPrepaidBlockEmail(a: PrepaidBlockEmailArgs): Built {
  const first = (a.parentName ?? '').split(' ')[0] || 'there';
  const currency = a.currency ?? 'AUD';
  const subject = `Prepaid block for ${a.studentName ?? 'your lessons'}: invoice ${a.invoiceNumber}`;
  const raw = [
    `Here is the invoice for a prepaid block of ${a.hours} ${a.hours === 1 ? 'hour' : 'hours'}${a.studentName ? ` of lessons for ${a.studentName}` : ''}: ${formatCentsDetailed(a.faceValueCents, currency)} of lesson credit for ${formatCentsDetailed(a.priceCents, currency)}, ${PREPAID_BLOCK.discountPercent}% off.`,
    `Once it is paid, each lesson is drawn from the credit and every invoice shows what was used and what is left. Your parent portal shows the balance at any time. Unused credit is refundable on request.`,
  ];
  const facts: Array<[string, string]> = [
    ['Invoice', a.invoiceNumber],
    ['Lesson credit', formatCentsDetailed(a.faceValueCents, currency)],
    ['You pay', formatCentsDetailed(a.priceCents, currency)],
  ];
  const html = shell({
    kicker: 'Prepaid block',
    heading: `${a.hours} hours of lessons, ${PREPAID_BLOCK.discountPercent}% off.`,
    preheader: `Invoice ${a.invoiceNumber}: ${formatCentsDetailed(a.priceCents, currency)}.`,
    paragraphs: raw.map(escapeHtml),
    facts,
    cta: a.payUrl ? { label: 'Pay by card', url: a.payUrl } : null,
  });
  const text = ascii(`Hi ${first},\n\n` + raw.join('\n\n') + `\n\n` + facts.map(([k, v]) => `- ${k}: ${v}`).join('\n') + (a.payUrl ? `\n\nPay by card:\n${a.payUrl}` : '') + footerText());
  return { subject, html, text };
}

export type LowCreditEmailArgs = {
  parentName: string | null;
  householdName: string;
  balanceCents: number;
  lessonsLeft: number;
  portalUrl: string;
  currency?: string;
};

export function buildLowCreditEmail(a: LowCreditEmailArgs): Built {
  const first = (a.parentName ?? '').split(' ')[0] || 'there';
  const currency = a.currency ?? 'AUD';
  const left = a.lessonsLeft === 1 ? 'about one lesson' : a.lessonsLeft <= 0 ? 'less than one lesson' : `about ${a.lessonsLeft} lessons`;
  const subject = `Your prepaid credit covers ${left}`;
  const raw = [
    `Your prepaid credit with ${AGENCY.name} is down to ${formatCentsDetailed(a.balanceCents, currency)}, ${left} at the current rate.`,
    `Nothing changes if you do nothing: once the credit runs out, lessons are invoiced after they happen, as usual. If you would like another block of ${PREPAID_BLOCK.hours} hours at ${PREPAID_BLOCK.discountPercent}% off, you can buy one from your parent portal or reply to this email.`,
  ];
  const html = shell({
    kicker: 'Prepaid credit',
    heading: `Your credit covers ${escapeHtml(left)}.`,
    preheader: `${formatCentsDetailed(a.balanceCents, currency)} left.`,
    paragraphs: raw.map(escapeHtml),
    cta: { label: 'Open your parent portal', url: a.portalUrl },
  });
  const text = ascii(`Hi ${first},\n\n` + raw.join('\n\n') + `\n\nParent portal:\n${a.portalUrl}` + footerText());
  return { subject, html, text };
}

export type ReferralCreditEmailArgs = {
  parentName: string | null;
  referredHouseholdName: string;
  creditCents: number;
  portalUrl: string;
  currency?: string;
};

export function buildReferralCreditEmail(a: ReferralCreditEmailArgs): Built {
  const first = (a.parentName ?? '').split(' ')[0] || 'there';
  const currency = a.currency ?? 'AUD';
  const subject = `Thank you for the referral: ${formatCentsDetailed(a.creditCents, currency)} of lesson credit`;
  const raw = [
    `The ${a.referredHouseholdName} you referred have now had ${REFERRAL.afterLessons} lessons with ${AGENCY.name}, so ${formatCentsDetailed(a.creditCents, currency)} of lesson credit has been added to your account, as promised.`,
    `It comes off your next invoice automatically. Thank you; a recommendation from a parent is the best introduction we can get.`,
  ];
  const html = shell({
    kicker: 'Referral credit',
    heading: `${formatCentsDetailed(a.creditCents, currency)} of lesson credit, with thanks.`,
    preheader: `The ${a.referredHouseholdName} have started lessons.`,
    paragraphs: raw.map(escapeHtml),
    cta: { label: 'Open your parent portal', url: a.portalUrl },
  });
  const text = ascii(`Hi ${first},\n\n` + raw.join('\n\n') + `\n\nParent portal:\n${a.portalUrl}` + footerText());
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Owner Monday check-in
// ---------------------------------------------------------------------------

export type CheckinSection = {
  title: string;
  lines: string[];
  href: string | null;
  urgent?: boolean;
};

export type CheckinData = {
  dateLabel: string;
  sections: CheckinSection[];
  quiet: boolean;
};

export function buildOwnerCheckinEmail(d: CheckinData): Built {
  const urgent = d.sections.filter((s) => s.urgent).length;
  const subject = d.quiet
    ? `Monday check-in, ${d.dateLabel}: quiet week`
    : `${urgent > 0 ? 'ACTION: ' : ''}Monday check-in, ${d.dateLabel}: ${d.sections.length} ${d.sections.length === 1 ? 'thing' : 'things'} to look at`;

  const paragraphs: string[] = [];
  if (d.quiet) {
    paragraphs.push(escapeHtml('Nothing is waiting on you this week: no unanswered enquiries, no overdue invoices, no checks expiring, no reviews to approve. The full picture is in the app.'));
  } else {
    for (const s of d.sections) {
      const title = `<strong style="color:#1a1a1a">${escapeHtml(s.title)}${s.urgent ? ' (action)' : ''}</strong>`;
      const lines = s.lines.map((l) => escapeHtml(l)).join('<br>');
      const link = s.href ? `<br><a href="${escapeHtml(s.href)}" style="color:#1a3a2a;text-decoration:underline;">Open</a>` : '';
      paragraphs.push(`${title}<br>${lines}${link}`);
    }
  }

  const html = shell({
    kicker: 'Monday check-in',
    heading: d.quiet ? 'Quiet week.' : `${d.sections.length} ${d.sections.length === 1 ? 'thing' : 'things'} to look at this week.`,
    preheader: d.quiet ? 'Nothing waiting on you.' : d.sections.map((s) => s.title).join(', '),
    paragraphs,
    cta: { label: 'Open the app', url: `${AGENCY.siteUrl}/app` },
  });

  const textBody = d.quiet
    ? 'Nothing is waiting on you this week: no unanswered enquiries, no overdue invoices, no checks expiring, no reviews to approve.'
    : d.sections.map((s) => `${s.title.toUpperCase()}${s.urgent ? ' (ACTION)' : ''}\n${s.lines.map((l) => `- ${l}`).join('\n')}${s.href ? `\n${s.href}` : ''}`).join('\n\n');
  const text = ascii(`Monday check-in, ${d.dateLabel}\n\n${textBody}\n\nOpen the app: ${AGENCY.siteUrl}/app` + footerText());
  return { subject, html, text };
}
