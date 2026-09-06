// Group classes taught by the founder. Decided 6 September 2026
// (04_STRATEGY_AND_OPERATING_MODEL.md, section 8). Small groups, capped at
// six, senior maths and physics, hybrid: a hired room in Kogarah plus an
// online seat. Nothing here is a booking system: a family registers interest
// through the call-back form, the founder calls, and the class runs once four
// families have confirmed.

import { AGENCY } from './agency';

export type ClassKey =
  | 'y12_maths_advanced'
  | 'y12_maths_ext1'
  | 'y12_physics'
  | 'y11_maths_advanced'
  | 'y10_maths'
  | 'jan_physics_intensive'
  | 'jan_ext1_headstart';

export type ClassFormat = 'hybrid' | 'online';

export type GroupClass = {
  key: ClassKey;
  title: string;
  level: string;
  /** The year level written on the enquiry (YEAR_LEVELS value). */
  enquiryYear: 'Year 10' | 'Year 11' | 'Year 12';
  subject: string;
  /** Hours of class time each week (term classes) or per session (intensives). */
  hoursPerWeek: number;
  /** Dollars per student per hour of class. */
  pricePerHour: number;
  /** Number of weeks (term classes) or sessions (intensives). */
  weeks: number;
  format: ClassFormat;
  term: string;
  when: string;
  blurb: string;
};

export const CLASS_RULES = {
  minStudents: 4,
  maxStudents: 6,
  venue: 'A hired room at the St George Community Centre in Kogarah, with an online seat through Google Meet for students who cannot travel',
  onlineOnly: 'Online through Google Meet until four in-person students have confirmed',
  teacher: `${AGENCY.founder.name}, founder`,
  /** What a family pays if they join after a term has started. */
  proRata: 'Join mid-term and you pay only for the weeks left.',
  refund: 'A term fee is refunded in full for any weeks not yet taught if you withdraw, and in full if the class does not reach four students and does not run.',
} as const;

export const TERM_1_2027 = {
  label: 'Term 1 2027',
  studentsStart: '3 February 2027',
  ends: '9 April 2027',
  classWeeks: 10,
} as const;

export const GROUP_CLASSES: readonly GroupClass[] = [
  {
    key: 'y12_maths_advanced',
    title: 'Year 12 Mathematics Advanced',
    level: 'Year 12',
    enquiryYear: 'Year 12',
    subject: 'Mathematics Advanced',
    hoursPerWeek: 2,
    pricePerHour: 45,
    weeks: 10,
    format: 'hybrid',
    term: TERM_1_2027.label,
    when: 'One two-hour class a week; the day and time are set with the first four families, from weekday evenings and Saturday mornings.',
    blurb: 'Works through the Year 12 course in step with school, one topic ahead, with a marked past-paper set every week.',
  },
  {
    key: 'y12_maths_ext1',
    title: 'Year 12 Mathematics Extension 1',
    level: 'Year 12',
    enquiryYear: 'Year 12',
    subject: 'Mathematics Extension 1',
    hoursPerWeek: 2,
    pricePerHour: 45,
    weeks: 10,
    format: 'hybrid',
    term: TERM_1_2027.label,
    when: 'One two-hour class a week; the day and time are set with the first four families, from weekday evenings and Saturday mornings.',
    blurb: 'Proof, vectors, further calculus and the harder problem types, with the Extension 1 paper practised under time from week one.',
  },
  {
    key: 'y12_physics',
    title: 'Year 12 Physics',
    level: 'Year 12',
    enquiryYear: 'Year 12',
    subject: 'Physics',
    hoursPerWeek: 2,
    pricePerHour: 45,
    weeks: 10,
    format: 'hybrid',
    term: TERM_1_2027.label,
    when: 'One two-hour class a week; the day and time are set with the first four families, from weekday evenings and Saturday mornings.',
    blurb: 'Modules 5 to 8 with the maths behind each one made explicit, and the extended-response questions marked the way the HSC marks them.',
  },
  {
    key: 'y11_maths_advanced',
    title: 'Year 11 Mathematics Advanced',
    level: 'Year 11',
    enquiryYear: 'Year 11',
    subject: 'Mathematics Advanced',
    hoursPerWeek: 2,
    pricePerHour: 45,
    weeks: 10,
    format: 'hybrid',
    term: TERM_1_2027.label,
    when: 'One two-hour class a week; the day and time are set with the first four families, from weekday evenings and Saturday mornings.',
    blurb: 'Functions, trigonometry and the start of calculus, built properly so Year 12 is not a repair job.',
  },
  {
    key: 'y10_maths',
    title: 'Year 10 Mathematics',
    level: 'Year 10',
    enquiryYear: 'Year 10',
    subject: 'Mathematics (Stage 5)',
    hoursPerWeek: 1.5,
    pricePerHour: 40,
    weeks: 10,
    format: 'hybrid',
    term: TERM_1_2027.label,
    when: 'One ninety-minute class a week; the day and time are set with the first four families, from weekday evenings and Saturday mornings.',
    blurb: 'The Stage 5 course with an eye on Year 11: algebra, surds, quadratics and trigonometry done until they are automatic.',
  },
  {
    key: 'jan_physics_intensive',
    title: 'HSC Physics: Year 12 head start',
    level: 'Year 12 in 2027',
    enquiryYear: 'Year 12',
    subject: 'Physics',
    hoursPerWeek: 2,
    pricePerHour: 45,
    weeks: 3,
    format: 'online',
    term: 'January 2027 holidays',
    when: 'Three two-hour online sessions in the week of 18 January 2027.',
    blurb: 'Modules 5 and 6 previewed and the Year 11 skills every Year 12 question assumes: vectors, graphs, units, uncertainty.',
  },
  {
    key: 'jan_ext1_headstart',
    title: 'Mathematics Extension 1: Year 12 head start',
    level: 'Year 12 in 2027',
    enquiryYear: 'Year 12',
    subject: 'Mathematics Extension 1',
    hoursPerWeek: 2,
    pricePerHour: 45,
    weeks: 3,
    format: 'online',
    term: 'January 2027 holidays',
    when: 'Three two-hour online sessions in the week of 18 January 2027.',
    blurb: 'Proof by induction, vectors and the further-calculus foundations, so Term 1 starts from strength.',
  },
] as const;

export const CLASS_KEYS = GROUP_CLASSES.map((c) => c.key) as ClassKey[];

export function classByKey(key: string | null | undefined): GroupClass | undefined {
  if (!key) return undefined;
  return GROUP_CLASSES.find((c) => c.key === key);
}

/** Dollars a student pays each week (term classes) or each session (intensives). */
export function classWeeklyPrice(c: GroupClass): number {
  return Math.round(c.hoursPerWeek * c.pricePerHour * 100) / 100;
}

/** Dollars for the whole term or the whole intensive. */
export function classTermPrice(c: GroupClass): number {
  return Math.round(classWeeklyPrice(c) * c.weeks * 100) / 100;
}

export function formatDollars(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}
