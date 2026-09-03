// Crestio Tutoring — single source of truth for the agency's public facts.
//
// Everything the public site, the enquiry form, the tutor application form,
// invoices and the admin screens say about subjects, levels, rates and
// policies comes from this file. Change it here, and every surface follows.
//
// Rules for editing:
//   * Rates are per hour, AUD, and are the full price a family pays.
//     Nothing is added on top. Whether GST is included is a registration
//     question handled in the terms, not here.
//   * Never add a claim here that is not literally true today.

export const AGENCY = {
  name: 'Crestio Tutoring',
  shortName: 'Crestio',
  legalLine: 'Crestio Tutoring is run by Lenin Joaquin, Sydney, Australia.',
  email: 'hello@crestio.ai',
  siteUrl: 'https://crestio.ai',
  founder: {
    name: 'Lenin Joaquin',
    firstName: 'Lenin',
    role: 'Founder and tutor',
  },
  serviceArea: {
    inHome: 'Sydney',
    inHomeFocus: 'St George and Sutherland Shire, and nearby suburbs',
    online: 'Anywhere in Australia',
    homeSuburb: 'Hurstville',
  },
  policies: {
    cancellationHours: 24,
    replyWithinHours: 24,
    matchWithinDays: 3,
    firstLessonGuarantee: 'If the first lesson is not the right fit, we re-match you or refund that lesson.',
    minimumTutorAge: 18,
  },
  abn: null as string | null, // Set once "Crestio Tutoring" is registered under the ABN.
} as const;

// ---------------------------------------------------------------------------
// Subjects and levels the agency takes at launch (2027 school year).
// Everything else is "on request" and handled by hand.
// ---------------------------------------------------------------------------

export type SubjectKey =
  | 'maths_7_10'
  | 'maths_standard'
  | 'maths_advanced'
  | 'maths_ext1'
  | 'maths_ext2'
  | 'physics';

export type Subject = {
  key: SubjectKey;
  label: string;
  short: string;
  years: string;
  rateBand: RateBandKey;
  blurb: string;
};

export const SUBJECTS: readonly Subject[] = [
  {
    key: 'maths_7_10',
    label: 'Mathematics, Years 7–10',
    short: 'Maths 7–10',
    years: 'Years 7–10',
    rateBand: 'years_7_10',
    blurb: 'Number, algebra, measurement, geometry, statistics and probability, built up in the order the NSW syllabus teaches them.',
  },
  {
    key: 'maths_standard',
    label: 'Mathematics Standard 2',
    short: 'Maths Standard',
    years: 'Years 11–12',
    rateBand: 'hsc',
    blurb: 'Financial maths, measurement, networks, statistics and the HSC exam technique that turns knowing into marks.',
  },
  {
    key: 'maths_advanced',
    label: 'Mathematics Advanced',
    short: 'Maths Advanced',
    years: 'Years 11–12',
    rateBand: 'hsc',
    blurb: 'Functions, calculus, trigonometry, probability and statistics, taught for understanding first and speed second.',
  },
  {
    key: 'maths_ext1',
    label: 'Mathematics Extension 1',
    short: 'Maths Ext 1',
    years: 'Years 11–12',
    rateBand: 'hsc',
    blurb: 'Proof, vectors, further calculus, combinatorics and the harder problem-solving the Extension 1 paper demands.',
  },
  {
    key: 'maths_ext2',
    label: 'Mathematics Extension 2',
    short: 'Maths Ext 2',
    years: 'Year 12',
    rateBand: 'ext2',
    blurb: 'Complex numbers, mechanics, integration and proof, with a tutor who has done the course at the level it is examined.',
  },
  {
    key: 'physics',
    label: 'Physics',
    short: 'Physics',
    years: 'Years 11–12',
    rateBand: 'hsc',
    blurb: 'Kinematics, dynamics, electricity, waves, fields and the modern physics modules, with the maths behind them made explicit.',
  },
] as const;

export const SUBJECT_KEYS = SUBJECTS.map((s) => s.key) as SubjectKey[];

export function subjectByKey(key: string): Subject | undefined {
  return SUBJECTS.find((s) => s.key === key);
}

export function subjectLabels(keys: readonly string[]): string[] {
  return keys.map((k) => subjectByKey(k)?.short ?? k);
}

// ---------------------------------------------------------------------------
// Year levels offered on the enquiry form.
// ---------------------------------------------------------------------------

export const YEAR_LEVELS = [
  'Year 7',
  'Year 8',
  'Year 9',
  'Year 10',
  'Year 11',
  'Year 12',
  'University',
  'Other',
] as const;
export type YearLevel = (typeof YEAR_LEVELS)[number];

export const NEEDS = [
  { key: 'exam', label: 'Preparing for an exam or the HSC' },
  { key: 'concepts', label: 'Understanding the concepts properly' },
  { key: 'confidence', label: 'Building confidence' },
  { key: 'keeping_up', label: 'Keeping up with class' },
  { key: 'extension', label: 'Getting ahead or extension' },
  { key: 'unsure', label: 'Not sure yet' },
] as const;
export type NeedKey = (typeof NEEDS)[number]['key'];

// ---------------------------------------------------------------------------
// Rate card. Per hour, AUD, full price. Online is the default; in-home rates
// cover the tutor's travel.
// ---------------------------------------------------------------------------

export type RateBandKey = 'years_7_10' | 'hsc' | 'ext2' | 'university';
export type Mode = 'online' | 'in_home';

export type RateBand = {
  key: RateBandKey;
  label: string;
  detail: string;
  online: number | null;    // dollars per hour
  inHome: number | null;    // dollars per hour; null = not offered
  fromPrice?: boolean;      // "from $X" rather than a fixed price
};

export const RATE_CARD: readonly RateBand[] = [
  {
    key: 'years_7_10',
    label: 'Years 7–10 Mathematics',
    detail: 'Stage 4 and Stage 5, all pathways',
    online: 80,
    inHome: 95,
  },
  {
    key: 'hsc',
    label: 'Years 11–12 HSC',
    detail: 'Maths Standard 2, Advanced, Extension 1, and Physics',
    online: 95,
    inHome: 110,
  },
  {
    key: 'ext2',
    label: 'Mathematics Extension 2',
    detail: 'Year 12 specialist',
    online: 110,
    inHome: 125,
  },
  {
    key: 'university',
    label: 'University maths and physics',
    detail: 'First-year units, by arrangement',
    online: 100,
    inHome: null,
    fromPrice: true,
  },
] as const;

export function rateBand(key: RateBandKey): RateBand {
  const band = RATE_CARD.find((b) => b.key === key);
  if (!band) throw new Error(`Unknown rate band: ${key}`);
  return band;
}

/** Hourly rate in cents for a subject and delivery mode, or null when not offered. */
export function hourlyRateCents(subject: SubjectKey, mode: Mode): number | null {
  const s = subjectByKey(subject);
  if (!s) return null;
  const band = rateBand(s.rateBand);
  const dollars = mode === 'online' ? band.online : band.inHome;
  return dollars == null ? null : dollars * 100;
}

/** Rate band for an enquiry year level, used before a subject is chosen. */
export function rateBandForYearLevel(year: string): RateBandKey | null {
  if (/^Year (7|8|9|10)$/.test(year)) return 'years_7_10';
  if (/^Year (11|12)$/.test(year)) return 'hsc';
  if (year === 'University') return 'university';
  return null;
}

export function formatRate(dollars: number | null, fromPrice = false): string {
  if (dollars == null) return '—';
  return `${fromPrice ? 'from ' : ''}$${dollars}`;
}

// ---------------------------------------------------------------------------
// Tutor pay bands. Internal. Shown to the owner in the admin screens only,
// never on the public site until confirmed. Per hour, AUD, before super.
// ---------------------------------------------------------------------------

export const TUTOR_PAY_BANDS: Record<Exclude<RateBandKey, 'university'>, { online: number; inHome: number }> = {
  years_7_10: { online: 40, inHome: 50 },
  hsc: { online: 50, inHome: 60 },
  ext2: { online: 60, inHome: 70 },
};

// ---------------------------------------------------------------------------
// What is included with every match — shown on pricing and the home page.
// ---------------------------------------------------------------------------

export const INCLUDED = [
  'A tutor matched to your child, not assigned from a list',
  'First lesson guaranteed — re-match or refund',
  'The same tutor every week',
  'A short written note after every lesson',
  'No joining fee, no lock-in, cancel any time',
  'A direct line to the founder',
] as const;

// ---------------------------------------------------------------------------
// FAQ. Used on the home page, the FAQ page, and as FAQPage JSON-LD.
// ---------------------------------------------------------------------------

export type Faq = { q: string; a: string };

export const FAQS: readonly Faq[] = [
  {
    q: 'How does matching work?',
    a: `You tell us the year level, the subject and whether you want lessons online or at home. We hand-pick a tutor for that subject and that student, from tutors we have interviewed and checked ourselves. If the fit is not right after the first lesson, we re-match you.`,
  },
  {
    q: 'Online or in-home — which should I choose, and where do you cover?',
    a: `Online works anywhere in Australia and is the most popular option. In-home covers Sydney, and we match by suburb to keep your tutor local — ${AGENCY.serviceArea.inHomeFocus} are the best covered. You can switch between online and in-home whenever you like.`,
  },
  {
    q: 'Are the tutors safe and qualified?',
    a: `Every tutor is 18 or older, interviewed, ID-checked and holds a NSW Working With Children Check that we verify before they meet a student. For in-home lessons with a child, we ask that a parent or guardian is home during the lesson.`,
  },
  {
    q: 'What does it cost, and am I locked in?',
    a: `Rates are on the pricing page and are the full price per hour. There is no joining fee and no lock-in contract. You can pause or stop at any time.`,
  },
  {
    q: 'What is the first-lesson guarantee?',
    a: `If the first lesson with a new tutor is not the right fit, we re-match you with another tutor or refund that lesson. Just tell us before the second lesson.`,
  },
  {
    q: 'What is your cancellation policy?',
    a: `Give us ${AGENCY.policies.cancellationHours} hours' notice and we reschedule at no charge. Lessons cancelled inside ${AGENCY.policies.cancellationHours} hours are charged, so the tutor is paid for the time they held for you.`,
  },
  {
    q: 'How do I pay?',
    a: `By card, after each lesson, through a secure payment link — or in prepaid blocks if you prefer. Nothing is charged to your card without your say-so.`,
  },
  {
    q: 'Which subjects and year levels do you cover?',
    a: `Mathematics from Year 7 to Year 12, including Standard 2, Advanced, Extension 1 and Extension 2, and Physics for Years 11 and 12. University maths and physics by arrangement. If you need something else, ask — if we cannot cover it well, we will say so.`,
  },
] as const;

// ---------------------------------------------------------------------------
// Tutor application options.
// ---------------------------------------------------------------------------

export const WWCC_STATUSES = [
  { key: 'current', label: 'Yes, current' },
  { key: 'applying', label: 'Applying now' },
  { key: 'not_yet', label: 'Not yet, willing to get one' },
] as const;
export type WwccStatus = (typeof WWCC_STATUSES)[number]['key'];

export const TUTOR_MODES = [
  { key: 'online', label: 'Online only' },
  { key: 'in_home', label: 'In-home only' },
  { key: 'both', label: 'Both' },
] as const;
export type TutorMode = (typeof TUTOR_MODES)[number]['key'];

export const ENQUIRY_MODES = [
  { key: 'online', label: 'Online' },
  { key: 'in_home', label: 'In-home' },
  { key: 'either', label: 'Either' },
] as const;
export type EnquiryMode = (typeof ENQUIRY_MODES)[number]['key'];
