// Holiday programs. Facts only: dates from the NSW Department of Education
// calendar, prices from the rate card, content that a tutor can deliver in
// four hours. Nothing here promises a result.

import { rateBand, type RateBandKey } from './agency';

export type ProgramKey = 'hsc-head-start' | 'year-11-bridging';

export type Program = {
  key: ProgramKey;
  name: string;
  short: string;
  who: string;
  window: string;          // when the four lessons happen
  windowNote: string;
  lessons: number;
  rateBand: RateBandKey;   // the band the four lessons are charged at
  altRateBand?: { label: string; band: RateBandKey }; // e.g. Extension 2 students on the head start
  enquiryYear: 'Year 10' | 'Year 11' | 'Year 12';
  enquiryMessage: string;  // prefilled into the enquiry form's message field
  plan: Array<{ n: number; title: string; body: string }>;
  outcome: string;         // what the family has at the end: things, not promises
};

export const PROGRAMS: readonly Program[] = [
  {
    key: 'hsc-head-start',
    name: 'January HSC head start',
    short: 'HSC head start',
    who: 'Students sitting the 2027 HSC in Mathematics Standard 2, Advanced, Extension 1, Extension 2 or Physics. They have been on the HSC course since Term 4, and Term 1 starts on Wednesday 3 February 2027.',
    window: 'Monday 11 January to Friday 29 January 2027',
    windowNote: 'Four one-hour lessons, one-on-one, online or at home in Sydney, at times you choose inside that window. Two a week, over two weeks, leaves time for the homework between lessons.',
    lessons: 4,
    rateBand: 'hsc',
    altRateBand: { label: 'Extension 2', band: 'ext2' },
    enquiryYear: 'Year 12',
    enquiryMessage: 'January HSC head start (four lessons, 11 to 29 January 2027).',
    plan: [
      { n: 1, title: 'Where things stand', body: 'A short diagnostic on the Term 4 topics from your school\'s own program, plus the assessment schedule for Term 1. The tutor writes down what is solid and what is not.' },
      { n: 2, title: 'The weakest Term 4 topic', body: 'Taught again from the start, with the student doing the work. Not a summary, a rebuild.' },
      { n: 3, title: 'The first Term 1 topic', body: 'A head start on what the class meets in February, so the first weeks of term are revision rather than new ground.' },
      { n: 4, title: 'Exam habits and a plan', body: 'A short timed set under exam conditions, marked together, and a written study plan for Term 1 that the family keeps.' },
    ],
    outcome: 'A written note after every lesson, a marked diagnostic, and a Term 1 plan. If it works, the same tutor continues weekly in February. If not, no obligation.',
  },
  {
    key: 'year-11-bridging',
    name: 'Year 10 to 11 maths bridging',
    short: 'Year 11 bridging',
    who: 'Year 10 students starting Year 11 in 2027 in Mathematics Standard 2, Advanced, or Advanced with Extension 1. Year 11 is where the maths gets steeper, and the gaps that hurt are Year 9 and 10 gaps.',
    window: 'Monday 23 November 2026 to Friday 29 January 2027',
    windowNote: 'Four one-hour lessons, one-on-one, online or at home in Sydney, spread across the summer at times you choose. Two in December and two in January keeps the maths warm without taking over the holidays.',
    lessons: 4,
    rateBand: 'years_7_10',
    enquiryYear: 'Year 10',
    enquiryMessage: 'Year 10 to 11 maths bridging (four lessons, 23 November 2026 to 29 January 2027).',
    plan: [
      { n: 1, title: 'A diagnostic on the foundations', body: 'Algebra, indices and surds, quadratics, linear functions and trigonometry: the Year 9 and 10 work that Year 11 builds on. The tutor marks it and tells you plainly whether the chosen course looks right.' },
      { n: 2, title: 'The weakest foundation', body: 'Rebuilt properly, with practice the student does in the lesson and between lessons.' },
      { n: 3, title: 'The second weakest', body: 'Same again. Two solid foundations change how Year 11 feels.' },
      { n: 4, title: 'A preview of Year 11', body: 'The first topic of the chosen course, so the first weeks of term are familiar: functions for Advanced, the further work on functions for Extension 1, formulae and equations for Standard 2.' },
    ],
    outcome: 'A marked diagnostic, honest advice on the course choice, and a written note after every lesson. The tutor can continue weekly from February.',
  },
] as const;

export function programByKey(key: string): Program | undefined {
  return PROGRAMS.find((p) => p.key === key);
}

/** Total price of a program at the given band and mode, in dollars, or null if not offered. */
export function programPrice(program: Program, mode: 'online' | 'in_home', band: RateBandKey = program.rateBand): number | null {
  const b = rateBand(band);
  const hourly = mode === 'online' ? b.online : b.inHome;
  return hourly == null ? null : hourly * program.lessons;
}
