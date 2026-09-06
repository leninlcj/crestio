// The tutor handbook: the practical side of the tutor agreement and code of
// conduct. Public at /tutors/handbook, printed for the onboarding pack.
// Every figure here comes from lib/agency.ts or lib/agencyLegal.ts so the
// handbook cannot drift from the agreement.

import { AGENCY, TUTOR_PAY_BANDS } from './agency';
import type { LegalDoc } from './agencyLegal';

export const TUTOR_HANDBOOK_VERSION = '2026-09-05';

const H = AGENCY.policies.cancellationHours;

export const TUTOR_HANDBOOK: LegalDoc = {
  title: 'Tutor handbook',
  kicker: 'For tutors',
  version: TUTOR_HANDBOOK_VERSION,
  intro: `This is the practical side of tutoring with Crestio: what happens before your first student, how a lesson runs, how you are paid, and what to do when something goes wrong. The tutor agreement and the code of conduct are the rules; this is how they work day to day. Read it once before your first lesson and come back to it when you need it.`,
  sections: [
    {
      id: 'before',
      heading: '1. Before your first student',
      paragraphs: ['Nine things, most of them once. Crestio ticks each one off on your profile, and you cannot be matched until they are done.'],
      bullets: [
        'Accept the tutor agreement and the code of conduct in the app. They are shown at your first sign-in and stay at crestio.ai/tutors/agreement.',
        `A NSW Working With Children Check for paid work, current. Apply through Service NSW ($112, valid five years) if you do not have one. Give Crestio the number and the expiry; Crestio verifies it with the Office of the Children's Guardian and records the date. You cannot meet a student until it shows as cleared.`,
        'Photo ID: a driver licence or passport, shown on a video call or in person. Crestio records that it was sighted and keeps no copy.',
        'An Australian Business Number. It is free and takes about fifteen minutes at abr.gov.au: register as a sole trader in your own name. You need it before your first paid lesson; without one, tax must be withheld from your fees at the top marginal rate.',
        'Your ABN and bank details in the app, under your profile, so payouts have somewhere to go.',
        `The Office of the Children's Guardian's free online child-safe e-learning, about an hour. Tell Crestio when it is done.`,
        'Two referees who can speak to your reliability, if asked.',
        'Insurance: Crestio tells you in writing whether its policy covers you for in-home lessons. If it does not, you hold your own public liability insurance before your first in-home lesson.',
        'Your own equipment. Online: a laptop with camera and microphone, a reliable connection, and a way to write maths the student can see (a tablet, a document camera, or the shared whiteboard). In-home: your own transport, paper and a calculator. Crestio does not supply equipment.',
      ],
    },
    {
      id: 'matching',
      heading: '2. How a match happens',
      bullets: [
        'Crestio sends you a student profile: year, course, what the family wants, suburb or online, the proposed weekly time, and the tutor fee for that student, in writing.',
        'You reply yes or no. No is fine and needs no reason. Please reply within two days so the family is not kept waiting.',
        `Once you say yes, Crestio confirms with the family, books the first lesson in the app, and introduces you to the family by email: your first name, your subject, a line about you. You never negotiate price or chase payment.`,
      ],
    },
    {
      id: 'first-lesson',
      heading: '3. The first lesson',
      bullets: [
        'Ten minutes with the parent and the student together: what the school is covering, the assessment schedule, what the family wants by the end of term. Write these down.',
        'A short diagnostic: six to eight questions across the recent topics, taken from the student\'s own school work or a past paper at the level. Watch how they work, not only whether they get it right.',
        'Teach one thing properly in the time left, so the student leaves able to do something they could not do an hour earlier.',
        'Agree the weekly slot and the homework habit: a small amount every week, checked at the start of the next lesson.',
        'Write the note that night. The first note matters most: it tells the family what you found and what the plan is.',
        `The first lesson is guaranteed to the family: if it is not the right fit, Crestio re-matches them or refunds that lesson. You are still paid for it.`,
      ],
    },
    {
      id: 'every-lesson',
      heading: '4. Every lesson',
      bullets: [
        'Start on time. A 60-minute lesson is 60 minutes of teaching; set-up happens before it.',
        'A shape that works: five minutes on homework and last week\'s topic, forty-five minutes of new work with the student doing most of the writing, ten minutes to summarise and set homework.',
        'Explain one thing at a time. Ask the student to explain it back. If they cannot, it is not learned yet.',
        'Phones away, yours included, except as a calculator or a camera for the lesson.',
        'In-home lessons with a child: a parent or guardian is home and the lesson is in a shared living area, such as the kitchen table, the dining room or the living room. Never a bedroom. Show your ID at the door the first time.',
        'Online lessons: cameras on for both of you, the parent welcome to sit in, and the lesson runs through the video link Crestio or the family sets up. No private calls or messages to the student outside the lesson.',
        'If the student is unwell or distressed, or the parent is not home for an in-home lesson with a child, do not start. Message Crestio.',
      ],
    },
    {
      id: 'note',
      heading: '5. The lesson note',
      bullets: [
        'Within 24 hours, in the app: what was covered, what was strong, what is next, homework set. Four short lines are enough; the app tidies rough notes into a parent-ready update.',
        'Specific beats kind. "Solved quadratics by factorising, still guessing when the leading coefficient is not 1" tells a parent more than "good lesson".',
        'Never write anything you would not say to the student\'s face. The family reads every note.',
      ],
    },
    {
      id: 'cancellations',
      heading: '6. Cancellations and changes',
      bullets: [
        `Families give ${H} hours' notice. Inside ${H} hours, or if the student does not turn up, you are paid the full fee for that lesson. Crestio handles the charging; you log the lesson as a late cancellation in the app.`,
        `If you must cancel, give Crestio and the family at least ${H} hours' notice and offer a make-up time. You are not paid for lessons you cancel. Repeated late cancellations end the agreement.`,
        'Any change to times, format or money goes through Crestio or the parent, never through the student.',
        'Lessons continue through school holidays unless the family pauses them. The app shows what is booked.',
      ],
    },
    {
      id: 'pay',
      heading: '7. Getting paid',
      bullets: [
        'Log every lesson in the app on the day it happens. Unlogged lessons are unpaid lessons.',
        'Crestio pays the tutor fee for every logged lesson within seven days of the end of that week, to your nominated account, whether or not the family has paid yet.',
        `The fee for each student is confirmed in writing when you accept them. The schedule: Years 7 to 10 Mathematics and Science $${TUTOR_PAY_BANDS.years_7_10.online} online and $${TUTOR_PAY_BANDS.years_7_10.inHome} in-home; Years 11 and 12 HSC subjects (Standard 2, Advanced, Extension 1, Physics, Chemistry, Biology and the by-request subjects) $${TUTOR_PAY_BANDS.hsc.online} and $${TUTOR_PAY_BANDS.hsc.inHome}; Extension 2 and IB Diploma subjects $${TUTOR_PAY_BANDS.ext2.online} and $${TUTOR_PAY_BANDS.ext2.inHome}. Per hour of lesson delivered; in-home fees include your travel.`,
        'Invoicing: with your written consent, Crestio issues a recipient-created tax invoice for you each week. Otherwise you send Crestio a weekly invoice. The app shows every lesson and every payout.',
        'Tax is yours to declare. With your ABN on file, Crestio does not withhold tax, and it does not pay superannuation, because you are an independent tutor. Keep your own records; the payout history in the app is the starting point.',
        'If you are registered for GST, tell Crestio; your fee is then treated as GST-inclusive.',
      ],
    },
    {
      id: 'safety',
      heading: '8. Safety and conduct, in short',
      bullets: [
        'Student safety comes before everything, including a lesson going ahead.',
        'No private messaging, no social media contact, no photos or recordings of students. Contact goes through the app and the parent.',
        'No lessons in bedrooms, in cars, or alone with a child anywhere.',
        'If a student tells you something that worries you: listen, do not promise to keep it secret, and tell Crestio the same day. If a child is in immediate danger, call 000. The NSW Child Protection Helpline is 132 111.',
        'Dress neatly, without logos or slogans, and carry photo ID to in-home lessons.',
        'The full rules are in the code of conduct and the child safe policy. They are short. Read them.',
      ],
    },
    {
      id: 'problems',
      heading: '9. When something goes wrong',
      bullets: [
        'The student will not engage: say so plainly in the note, and tell Crestio. A different approach or a different tutor is a normal fix, not a failure.',
        'A family asks to pay you directly or to book you outside Crestio: say no politely and refer them to Crestio. The agreement covers this for 12 months after your last Crestio lesson with them.',
        'You want to stop with a family: 14 days\' notice to Crestio, and deliver the lessons already booked.',
        'You are sick on lesson day: tell Crestio and the family as early as you can and offer a make-up.',
        'A parent raises a complaint with you: do not argue it in the moment. Note what was said, tell Crestio, and let Crestio handle it.',
        'Something happened in a lesson and you are unsure about it: report it the same day at crestio.ai/report or by email. Reporting early is never held against you.',
      ],
    },
    {
      id: 'contacts',
      heading: '10. Contacts',
      bullets: [
        `Everything operational: ${AGENCY.email}, or a message in the app.`,
        `${AGENCY.founder.name}, the founder, reads every message and replies within a business day.`,
      ],
    },
  ],
};
