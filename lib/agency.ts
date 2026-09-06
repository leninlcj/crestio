// Crestio Tutoring: single source of truth for the agency's public facts.
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
    homeSuburb: 'Kogarah',
  },
  policies: {
    cancellationHours: 24,
    replyWithinHours: 24,
    matchWithinDays: 3,
    firstLessonGuarantee: 'If the first lesson is not the right fit, we re-match you or refund that lesson.',
    minimumTutorAge: 18,
  },
  // The call-back promise. Every surface that mentions it reads from here.
  callBack: {
    usualHours: 2,
    hoursFrom: '9 am',
    hoursTo: '8 pm',
    withinBusinessDays: 1,
    /** One sentence, used on the form, the confirmation and the emails. */
    promise: 'Lenin will call you shortly: usually within two hours between 9 am and 8 pm, and always within one business day.',
  },
  // Business phone number. Null until the number exists (a second eSIM on the
  // founder's iPhone, planned for December 2026). `phone` is the tel: form,
  // `phoneDisplay` is what people read.
  phone: null as string | null,
  phoneDisplay: null as string | null,
  abn: null as string | null, // Set once "Crestio Tutoring" is registered under the ABN.
  // Google Search Console "HTML tag" verification token (the content="..."
  // value). Not a secret. Paste it here, or set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION.
  googleSiteVerification: 'ueo8wbrFaLCTdgmZ0XWr0fZY2jpRI9S-LnqX7NxqIq8' as string | null,
} as const;

// ---------------------------------------------------------------------------
// Subjects and levels.
//
// Three tiers, decided 6 September 2026 (04_STRATEGY_AND_OPERATING_MODEL.md):
//   core     Maths and the sciences. The founder can test every tutor himself.
//   request  Other HSC subjects. Listed so the enquiry arrives; a family is
//            matched only when a tutor has passed the subject test.
//   ib       IB Diploma, at the Extension 2 price tier.
// ---------------------------------------------------------------------------

export type SubjectKey =
  | 'maths_7_10'
  | 'science_7_10'
  | 'maths_standard'
  | 'maths_advanced'
  | 'maths_ext1'
  | 'maths_ext2'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'english_standard'
  | 'english_advanced'
  | 'economics'
  | 'business_studies'
  | 'legal_studies'
  | 'modern_history'
  | 'ancient_history'
  | 'ib_maths_aa'
  | 'ib_maths_ai'
  | 'ib_physics'
  | 'ib_chemistry'
  | 'ib_biology';

export type SubjectTier = 'core' | 'request' | 'ib';
export type SubjectGroup = 'maths' | 'science' | 'english' | 'humanities' | 'ib';

export type Subject = {
  key: SubjectKey;
  label: string;
  short: string;
  years: string;
  rateBand: RateBandKey;
  tier: SubjectTier;
  group: SubjectGroup;
  /** Which senior years the subject is taken in; 7-10 subjects list the junior years. */
  yearLevels: readonly string[];
  blurb: string;
};

const JUNIOR = ['Year 7', 'Year 8', 'Year 9', 'Year 10'] as const;
const SENIOR = ['Year 11', 'Year 12'] as const;
const YEAR_12_ONLY = ['Year 12'] as const;

export const SUBJECTS: readonly Subject[] = [
  {
    key: 'maths_7_10',
    label: 'Mathematics, Years 7–10',
    short: 'Maths 7–10',
    years: 'Years 7–10',
    rateBand: 'years_7_10',
    tier: 'core',
    group: 'maths',
    yearLevels: JUNIOR,
    blurb: 'Number, algebra, measurement, geometry, statistics and probability, built up in the order the NSW syllabus teaches them.',
  },
  {
    key: 'science_7_10',
    label: 'Science, Years 7–10',
    short: 'Science 7–10',
    years: 'Years 7–10',
    rateBand: 'years_7_10',
    tier: 'core',
    group: 'science',
    yearLevels: JUNIOR,
    blurb: 'The Stage 4 and 5 science course: the physical world, chemical world, living world and Earth and space, with the working-scientifically skills the tests reward.',
  },
  {
    key: 'maths_standard',
    label: 'Mathematics Standard 2',
    short: 'Maths Standard',
    years: 'Years 11–12',
    rateBand: 'hsc',
    tier: 'core',
    group: 'maths',
    yearLevels: SENIOR,
    blurb: 'Financial maths, measurement, networks, statistics and the HSC exam technique that turns knowing into marks.',
  },
  {
    key: 'maths_advanced',
    label: 'Mathematics Advanced',
    short: 'Maths Advanced',
    years: 'Years 11–12',
    rateBand: 'hsc',
    tier: 'core',
    group: 'maths',
    yearLevels: SENIOR,
    blurb: 'Functions, calculus, trigonometry, probability and statistics, taught for understanding first and speed second.',
  },
  {
    key: 'maths_ext1',
    label: 'Mathematics Extension 1',
    short: 'Maths Ext 1',
    years: 'Years 11–12',
    rateBand: 'hsc',
    tier: 'core',
    group: 'maths',
    yearLevels: SENIOR,
    blurb: 'Proof, vectors, further calculus, combinatorics and the harder problem-solving the Extension 1 paper demands.',
  },
  {
    key: 'maths_ext2',
    label: 'Mathematics Extension 2',
    short: 'Maths Ext 2',
    years: 'Year 12',
    rateBand: 'ext2',
    tier: 'core',
    group: 'maths',
    yearLevels: YEAR_12_ONLY,
    blurb: 'Complex numbers, mechanics, integration and proof, with a tutor who has done the course at the level it is examined.',
  },
  {
    key: 'physics',
    label: 'Physics',
    short: 'Physics',
    years: 'Years 11–12',
    rateBand: 'hsc',
    tier: 'core',
    group: 'science',
    yearLevels: SENIOR,
    blurb: 'Kinematics, dynamics, electricity, waves, fields and the modern physics modules, with the maths behind them made explicit.',
  },
  {
    key: 'chemistry',
    label: 'Chemistry',
    short: 'Chemistry',
    years: 'Years 11–12',
    rateBand: 'hsc',
    tier: 'core',
    group: 'science',
    yearLevels: SENIOR,
    blurb: 'Properties and structure of matter, reactions, equilibrium, acids and bases, organic chemistry and the calculation skills every module leans on.',
  },
  {
    key: 'biology',
    label: 'Biology',
    short: 'Biology',
    years: 'Years 11–12',
    rateBand: 'hsc',
    tier: 'core',
    group: 'science',
    yearLevels: SENIOR,
    blurb: 'Cells, organisation, heredity, genetic change, infectious disease and non-infectious disease, with the extended-response writing the exam demands.',
  },
  {
    key: 'english_standard',
    label: 'English Standard',
    short: 'English Standard',
    years: 'Years 11–12',
    rateBand: 'hsc',
    tier: 'request',
    group: 'english',
    yearLevels: SENIOR,
    blurb: 'Reading, analysing and writing about the prescribed texts, and the essay structure the markers look for.',
  },
  {
    key: 'english_advanced',
    label: 'English Advanced',
    short: 'English Advanced',
    years: 'Years 11–12',
    rateBand: 'hsc',
    tier: 'request',
    group: 'english',
    yearLevels: SENIOR,
    blurb: 'Textual conversations, the critical study, craft of writing, and how to argue a thesis under exam time.',
  },
  {
    key: 'economics',
    label: 'Economics',
    short: 'Economics',
    years: 'Years 11–12',
    rateBand: 'hsc',
    tier: 'request',
    group: 'humanities',
    yearLevels: SENIOR,
    blurb: 'Markets, the global economy, economic issues and policies, and the diagrams and data-response skills the exam rewards.',
  },
  {
    key: 'business_studies',
    label: 'Business Studies',
    short: 'Business Studies',
    years: 'Years 11–12',
    rateBand: 'hsc',
    tier: 'request',
    group: 'humanities',
    yearLevels: SENIOR,
    blurb: 'Operations, marketing, finance and human resources, with the report and extended-response formats practised to time.',
  },
  {
    key: 'legal_studies',
    label: 'Legal Studies',
    short: 'Legal Studies',
    years: 'Years 11–12',
    rateBand: 'hsc',
    tier: 'request',
    group: 'humanities',
    yearLevels: SENIOR,
    blurb: 'Crime, human rights and the options topics, with the case law and legislation examples that lift an essay a band.',
  },
  {
    key: 'modern_history',
    label: 'Modern History',
    short: 'Modern History',
    years: 'Years 11–12',
    rateBand: 'hsc',
    tier: 'request',
    group: 'humanities',
    yearLevels: SENIOR,
    blurb: 'Power and authority, national studies, peace and conflict and change in the modern world, argued from sources.',
  },
  {
    key: 'ancient_history',
    label: 'Ancient History',
    short: 'Ancient History',
    years: 'Years 11–12',
    rateBand: 'hsc',
    tier: 'request',
    group: 'humanities',
    yearLevels: SENIOR,
    blurb: 'Cities of Vesuvius, ancient societies, personalities and historical periods, with source analysis practised every week.',
  },
  {
    key: 'ib_maths_aa',
    label: 'IB Mathematics: Analysis and Approaches',
    short: 'IB Maths AA',
    years: 'IB Diploma',
    rateBand: 'ext2',
    tier: 'ib',
    group: 'ib',
    yearLevels: SENIOR,
    blurb: 'SL and HL: functions, calculus, proof and the exploration, taught to the IB mark schemes.',
  },
  {
    key: 'ib_maths_ai',
    label: 'IB Mathematics: Applications and Interpretation',
    short: 'IB Maths AI',
    years: 'IB Diploma',
    rateBand: 'ext2',
    tier: 'ib',
    group: 'ib',
    yearLevels: SENIOR,
    blurb: 'SL and HL: modelling, statistics, technology use and the exploration, taught to the IB mark schemes.',
  },
  {
    key: 'ib_physics',
    label: 'IB Physics',
    short: 'IB Physics',
    years: 'IB Diploma',
    rateBand: 'ext2',
    tier: 'ib',
    group: 'ib',
    yearLevels: SENIOR,
    blurb: 'SL and HL across the five themes, the internal assessment, and the data-based and extended-response papers.',
  },
  {
    key: 'ib_chemistry',
    label: 'IB Chemistry',
    short: 'IB Chemistry',
    years: 'IB Diploma',
    rateBand: 'ext2',
    tier: 'ib',
    group: 'ib',
    yearLevels: SENIOR,
    blurb: 'SL and HL: structure and reactivity, the internal assessment, and the calculation and explanation skills the papers test.',
  },
  {
    key: 'ib_biology',
    label: 'IB Biology',
    short: 'IB Biology',
    years: 'IB Diploma',
    rateBand: 'ext2',
    tier: 'ib',
    group: 'ib',
    yearLevels: SENIOR,
    blurb: 'SL and HL across the four themes, the internal assessment, and the long-answer technique the papers reward.',
  },
] as const;

export const SUBJECT_KEYS = SUBJECTS.map((s) => s.key) as SubjectKey[];
export const CORE_SUBJECTS = SUBJECTS.filter((s) => s.tier === 'core');
export const REQUEST_SUBJECTS = SUBJECTS.filter((s) => s.tier === 'request');
export const IB_SUBJECTS = SUBJECTS.filter((s) => s.tier === 'ib');

export const SUBJECT_TIER_LABEL: Record<SubjectTier, string> = {
  core: 'Maths and science',
  request: 'Other HSC subjects, by request',
  ib: 'IB Diploma',
};

export function subjectByKey(key: string): Subject | undefined {
  return SUBJECTS.find((s) => s.key === key);
}

export function subjectLabels(keys: readonly string[]): string[] {
  return keys.map((k) => subjectByKey(k)?.short ?? k);
}

/** Subjects a student in `year` can be enquiring about. University and Other see everything. */
export function subjectsForYearLevel(year: string): Subject[] {
  if (!/^Year (7|8|9|10|11|12)$/.test(year)) return [...SUBJECTS];
  return SUBJECTS.filter((s) => (s.yearLevels as readonly string[]).includes(year));
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

// Online prices were lowered on 6 September 2026 (from 80 / 95 / 110) after a
// price survey: published online tutoring sits at $59 to $99 an hour and
// buyers compare on price. In-home is unchanged: that is where the trust
// premium is real. See 04_STRATEGY_AND_OPERATING_MODEL.md, section 5.
export const RATE_CARD: readonly RateBand[] = [
  {
    key: 'years_7_10',
    label: 'Years 7–10',
    detail: 'Mathematics and Science, Stage 4 and 5',
    online: 75,
    inHome: 95,
  },
  {
    key: 'hsc',
    label: 'Years 11–12 HSC',
    detail: 'Maths Standard 2, Advanced and Extension 1; Physics, Chemistry, Biology; other HSC subjects by request',
    online: 85,
    inHome: 110,
  },
  {
    key: 'ext2',
    label: 'Extension 2 and IB Diploma',
    detail: 'Mathematics Extension 2; IB Maths, Physics, Chemistry and Biology',
    online: 95,
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
  if (dollars == null) return 'Not offered';
  return `${fromPrice ? 'from ' : ''}$${dollars}`;
}

// ---------------------------------------------------------------------------
// Tutor pay bands. Internal. Shown to the owner in the admin screens only,
// never on the public site until confirmed. Per hour, AUD, before super.
// ---------------------------------------------------------------------------

export const TUTOR_PAY_BANDS: Record<Exclude<RateBandKey, 'university'>, { online: number; inHome: number }> = {
  years_7_10: { online: 40, inHome: 50 },
  hsc: { online: 45, inHome: 60 },
  ext2: { online: 50, inHome: 70 },
};

// ---------------------------------------------------------------------------
// Prepaid blocks, referral credit and reviews. Questionnaire defaults G7 and
// the review engine from 01_BUSINESS_RISK_AND_MONEY.md; change here only.
// ---------------------------------------------------------------------------

/** A family can pay ten hours up front at 5% off; each lesson is drawn from the credit. */
export const PREPAID_BLOCK = {
  hours: 10,
  discountPercent: 5,
} as const;

/** A family that refers another gets a credit once the new family has had this many lessons. */
export const REFERRAL = {
  creditCents: 5000,
  afterLessons: 3,
} as const;

/** When and how families are asked for a review. Nothing shows on the site until the owner approves it. */
export const REVIEWS = {
  askAfterLessons: 4,
  minDaysSinceFirstLesson: 14,
  reminderAfterDays: 7,
  /** Google Business Profile "write a review" link. Null until the profile exists; then the thank-you page offers it. */
  googleReviewUrl: null as string | null,
} as const;

/** Disclosure printed on invoices and the payment page (introduction-agency model). */
export function agencyInvoiceNote(tutorName: string | null | undefined): string {
  const who = tutorName ? `${tutorName}, an independent tutor introduced by ${AGENCY.name}` : `your Crestio tutor, an independent tutor introduced by ${AGENCY.name}`;
  return `Tutoring is provided by ${who}. ${AGENCY.name} collects this payment on the tutor's behalf, pays the tutor their fee, and retains a service fee for matching, administration and payment handling. Questions: ${AGENCY.email}.`;
}

// ---------------------------------------------------------------------------
// What is included with every match. Shown on pricing and the home page.
// ---------------------------------------------------------------------------

export const INCLUDED = [
  'A tutor matched to your child, not assigned from a list',
  'First lesson guaranteed: re-match or refund',
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
    a: `You leave your number, or send the enquiry form, and ${AGENCY.founder.firstName} calls you back: usually within two hours between ${AGENCY.callBack.hoursFrom} and ${AGENCY.callBack.hoursTo}, always within one business day. On that call we work out the year level, the subject, the goal and whether you want lessons online or at home. Then we hand-pick a tutor for that subject and that student, from tutors we have interviewed and checked ourselves. If the fit is not right after the first lesson, we re-match you.`,
  },
  {
    q: 'Online or in-home: which should I choose, and where do you cover?',
    a: `Online works anywhere in Australia for the NSW HSC and the IB, and costs less. In-home covers Sydney, and we match by suburb to keep your tutor local; ${AGENCY.serviceArea.inHomeFocus} are the best covered. You can switch between online and in-home whenever you like.`,
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
    a: `By card, after each lesson, through a secure payment link. Or buy a block of ${PREPAID_BLOCK.hours} hours up front at ${PREPAID_BLOCK.discountPercent}% off and each lesson is drawn from it; your parent portal shows what is left. Nothing is charged to your card without your say-so.`,
  },
  {
    q: 'Which subjects and year levels do you cover?',
    a: `Maths and science are the core: Mathematics and Science for Years 7 to 10, and for Years 11 and 12 Mathematics Standard 2, Advanced, Extension 1 and Extension 2, Physics, Chemistry and Biology. Other HSC subjects (English, Economics, Business Studies, Legal Studies, Modern and Ancient History) are matched by request, only when we have a tutor who has passed our test in that subject. University maths and physics by arrangement.`,
  },
  {
    q: 'Do you tutor the IB Diploma?',
    a: `Yes: IB Mathematics (Analysis and Approaches, Applications and Interpretation), Physics, Chemistry and Biology, at SL and HL, online anywhere in Australia or in-home in Sydney. IB sits in the Extension 2 price tier and is taught by tutors with IB experience. Your tutor works to the IB mark schemes, not the HSC ones.`,
  },
  {
    q: 'Do you run group classes?',
    a: `Yes. Small groups of four to six, taught by ${AGENCY.founder.firstName} himself, for senior maths and physics, in Kogarah and online. Two hours a week for a ten-week term, at less than half the one-to-one price. See the classes page for the current timetable and how to register.`,
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

// ---------------------------------------------------------------------------
// Call requests. The primary way a family reaches us: a number and a good
// time, and the founder calls back. Stored on the enquiry as
// preferred_contact = 'call' plus best_time.
// ---------------------------------------------------------------------------

export const PREFERRED_CONTACT = ['email', 'call'] as const;
export type PreferredContact = (typeof PREFERRED_CONTACT)[number];

export const BEST_TIMES = [
  { key: 'any', label: 'Any time, 9 am to 8 pm' },
  { key: 'morning', label: 'Morning, 9 am to 12 pm' },
  { key: 'afternoon', label: 'Afternoon, 12 pm to 5 pm' },
  { key: 'evening', label: 'Evening, 5 pm to 8 pm' },
  { key: 'weekend', label: 'Weekend' },
] as const;
export type BestTimeKey = (typeof BEST_TIMES)[number]['key'];

export function bestTimeLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return BEST_TIMES.find((b) => b.key === key)?.label ?? key;
}
