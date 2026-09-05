// The agency's legal documents as data, so the public pages, the in-app
// acceptance step and the audit trail all use the same words and version.
//
// Model: Crestio Tutoring is an introduction and administration agency.
// Families engage tutors; Crestio matches, vets, schedules, collects payment
// on the tutor's behalf and keeps a service fee. Tutors are independent
// contractors to the family, not employees or contractors of Crestio.
//
// These drafts were written for a lawyer to review before the first tutor
// signs. Bump the version when the text changes; acceptances record it.

import { AGENCY, TUTOR_PAY_BANDS } from './agency';

export const TUTOR_AGREEMENT_VERSION = '2026-09-05';
export const CODE_OF_CONDUCT_VERSION = '2026-09-05';
export const CHILD_SAFE_POLICY_VERSION = '2026-09-05';

export type LegalSection = { id: string; heading: string; paragraphs?: string[]; bullets?: string[] };
export type LegalDoc = { title: string; kicker: string; version: string; intro: string; sections: LegalSection[] };

const H = AGENCY.policies.cancellationHours;

export const TUTOR_AGREEMENT: LegalDoc = {
  title: 'Tutor agreement',
  kicker: 'For tutors',
  version: TUTOR_AGREEMENT_VERSION,
  intro: `This agreement is between ${AGENCY.name} ("Crestio", "we") and you, the tutor. It sets out how Crestio introduces you to families, runs the administration, collects payment on your behalf and pays you. It is not a contract of employment.`,
  sections: [
    {
      id: 'nature',
      heading: '1. What Crestio is, and what you are',
      paragraphs: [
        'Crestio is an introduction and administration agency for tutoring. Crestio finds and vets tutors, matches them to families, schedules lessons, collects payment from families and handles notes, records and communication.',
        'You are an independent tutor running your own business. You provide tutoring services to the families Crestio introduces you to. You are not an employee, partner or agent of Crestio for any purpose. Crestio does not pay superannuation, leave or workers compensation for you, and you are responsible for your own tax, ABN and insurance.',
        'Nothing in this agreement obliges Crestio to introduce you to any particular number of students, or obliges you to accept any student.',
      ],
    },
    {
      id: 'agent',
      heading: '2. You appoint Crestio as your agent',
      paragraphs: [
        'You appoint Crestio as your non-exclusive agent to: introduce you to families; agree lesson times and formats with them on your behalf; collect payment from families for your lessons; deduct the Crestio service fee; and pay you the balance. Crestio may act for other tutors, and you may tutor for other agencies or privately, except as set out in clause 8.',
      ],
    },
    {
      id: 'fees',
      heading: '3. Fees and payment',
      bullets: [
        'The family pays Crestio one price per lesson, published at crestio.ai/pricing. Out of that price you receive the tutor fee for the level and format, set out in the Schedule and confirmed to you in writing before you accept each student. The difference is Crestio\'s service fee for matching, administration and payment handling.',
        `Crestio pays you the tutor fee for every lesson you deliver and log in the Crestio app, within 7 days of the end of the week in which it was delivered, to the bank account you nominate. Crestio pays you whether or not the family has paid, and carries the collection risk.`,
        `If a family cancels with less than ${H} hours' notice, or the student does not attend, you are paid the full tutor fee for that lesson. If you cancel, you are not paid for that lesson.`,
        'You must hold an Australian Business Number (ABN) and give it to Crestio before your first paid lesson. Without an ABN, the law requires tax to be withheld from payments to you at the top marginal rate.',
        'If you are registered for GST, tell Crestio and your tutor fee will be treated as GST-inclusive. With your written consent, Crestio issues recipient-created tax invoices on your behalf; otherwise you invoice Crestio weekly.',
        'Crestio may change the published family price or the tutor fee schedule with 30 days\' written notice. Changes do not apply to lessons already booked.',
      ],
    },
    {
      id: 'delivery',
      heading: '4. Delivering lessons',
      bullets: [
        'You set your own availability, may decline any student, and may end a match with a family with 14 days\' notice to Crestio.',
        'Because families choose you personally and every tutor is vetted, you may not send anyone else to deliver a lesson in your place.',
        'You use your own equipment: computer, internet connection, materials, and transport for in-home lessons.',
        `You give at least ${H} hours' notice to Crestio and the family if you must cancel a lesson, and arrange a make-up time where possible. Repeated late cancellations are grounds for ending this agreement.`,
        'After every lesson you record a short note in the Crestio app within 24 hours: what was covered, what was strong, what is next, any homework set. Crestio sends it to the family.',
        'Lesson arrangements, changes and anything to do with payment go through Crestio or the parent, never directly between you and a student.',
      ],
    },
    {
      id: 'checks',
      heading: '5. Checks, conduct and child safety',
      bullets: [
        `You must be ${AGENCY.policies.minimumTutorAge} or older and hold a current NSW Working With Children Check for paid work. You give Crestio the number and expiry so Crestio can verify it with the Office of the Children's Guardian, and you tell Crestio at once if it is cancelled, suspended or changes.`,
        'You show photo identification before your first lesson and provide two referees if asked.',
        'You read and follow the Crestio Code of Conduct and the Child Safe Policy, complete the free NSW Office of the Children\'s Guardian child-safe e-learning before your first lesson, and repeat it when Crestio asks.',
        'For in-home lessons with a child, a parent or guardian must be home and the lesson takes place in a shared living area. You do not give lessons in a bedroom, in a car, or alone with a child anywhere.',
        'You report any concern about a student\'s safety or wellbeing to Crestio the same day, and to the police or the NSW Child Protection Helpline (132 111) if a child is in immediate danger.',
      ],
    },
    {
      id: 'privacy',
      heading: '6. Privacy and confidentiality',
      paragraphs: [
        'Information about families and students is confidential. You use it only to deliver lessons, keep it only in the Crestio app or on a device you control, and delete any copies when a match ends. You do not photograph, record or post about students. You comply with the Privacy Act 1988 (Cth) and the Crestio privacy policy.',
      ],
    },
    {
      id: 'materials',
      heading: '7. Teaching materials',
      paragraphs: [
        'Materials you create remain yours; you give Crestio and the family a licence to use them for the student\'s tutoring. Materials in the Crestio resource library are licensed to you for Crestio lessons only and may not be shared or sold. You must not copy or distribute textbooks or other copyright material beyond what the law allows.',
      ],
    },
    {
      id: 'non-circumvention',
      heading: '8. Families Crestio introduces you to',
      paragraphs: [
        'For 12 months after your last Crestio lesson with a family, you will not tutor that family, or any student in it, privately or through another agency, and you will not solicit them to do so. If a family asks, refer them to Crestio. This protects the matching work Crestio did; it does not stop you tutoring anyone Crestio did not introduce.',
      ],
    },
    {
      id: 'insurance',
      heading: '9. Insurance and liability',
      bullets: [
        'You are responsible for your own conduct and for any loss or injury caused by your negligence. Crestio recommends you hold public liability insurance and requires it for in-home lessons unless Crestio\'s policy covers agency tutors, which Crestio will confirm in writing.',
        'Crestio is responsible for its own services: matching, administration and payment handling. Crestio is not responsible for the outcome of lessons or for a student\'s results.',
        'Each party indemnifies the other for loss caused by its breach of this agreement, to the extent the law allows.',
      ],
    },
    {
      id: 'term',
      heading: '10. Term and ending this agreement',
      bullets: [
        'This agreement starts when you accept it in the Crestio app and continues until ended.',
        'Either party may end it with 14 days\' written notice. Lessons already booked in that period are delivered and paid as normal unless the family agrees otherwise.',
        'Crestio may end it immediately if your Working With Children Check lapses or is cancelled, if you breach the Code of Conduct or clause 5 or 8, or if a safety concern arises. You may end it immediately if Crestio fails to pay you within 14 days of a fee falling due.',
        'Clauses 6, 7, 8 and 9 continue after this agreement ends.',
      ],
    },
    {
      id: 'general',
      heading: '11. General',
      bullets: [
        'This agreement is governed by the laws of New South Wales, Australia.',
        'Crestio may update this agreement with 30 days\' notice; you accept the new version in the app or end the agreement.',
        'Notices are sent by email to the addresses each party has on file.',
      ],
    },
    {
      id: 'schedule',
      heading: 'Schedule: tutor fees',
      paragraphs: [
        'Per hour of lesson delivered. Confirmed in writing for each student before you accept them.',
      ],
      bullets: [
        `Years 7–10 Mathematics: $${TUTOR_PAY_BANDS.years_7_10.online} online · $${TUTOR_PAY_BANDS.years_7_10.inHome} in-home`,
        `Years 11–12 HSC (Mathematics Standard 2, Advanced, Extension 1, Physics): $${TUTOR_PAY_BANDS.hsc.online} online · $${TUTOR_PAY_BANDS.hsc.inHome} in-home`,
        `Mathematics Extension 2: $${TUTOR_PAY_BANDS.ext2.online} online · $${TUTOR_PAY_BANDS.ext2.inHome} in-home`,
        'In-home fees include your travel. Lessons longer or shorter than an hour are paid pro rata.',
        `Paid weekly, within 7 days of the end of the week of the lesson. Late cancellation by the family (under ${H} hours): full fee.`,
      ],
    },
  ],
};

export const CODE_OF_CONDUCT: LegalDoc = {
  title: 'Code of conduct',
  kicker: 'For tutors',
  version: CODE_OF_CONDUCT_VERSION,
  intro: 'Every Crestio tutor agrees to this code before their first lesson. It exists so that students are safe, families can trust us, and tutors know exactly what is expected.',
  sections: [
    {
      id: 'safety',
      heading: 'Student safety comes first',
      bullets: [
        'Hold a current NSW Working With Children Check for paid work at all times and tell Crestio immediately if anything changes.',
        'For in-home lessons with a child, a parent or guardian is home and the lesson happens in a shared living area, never a bedroom.',
        'Never be alone with a student in a car or a private place. Do not drive students.',
        'No physical contact beyond a handshake or what is needed to demonstrate a written method.',
        'Report any concern about a student\'s safety, wellbeing or home situation to Crestio the same day. If a child is in immediate danger, call 000. The NSW Child Protection Helpline is 132 111.',
        'Complete the NSW Office of the Children\'s Guardian child-safe e-learning before your first lesson.',
      ],
    },
    {
      id: 'boundaries',
      heading: 'Communication and boundaries',
      bullets: [
        'All scheduling, changes and payment questions go through Crestio or the parent. Never arrange lessons directly with a student.',
        'No private contact with students: no personal phone numbers, social media connections, direct messages, gifts or meetings outside lessons.',
        'Online lessons use the video link the family or Crestio provides, with your camera on. Do not record lessons.',
        'Do not photograph students, their work or their home, and do not post about students anywhere.',
        'Speak to students the way you would with their parent in the room. No swearing, no sarcasm about ability, no comments on appearance.',
      ],
    },
    {
      id: 'professional',
      heading: 'Being professional',
      bullets: [
        'Arrive, or join online, on time and prepared. Dress neatly for in-home lessons.',
        'Give at least 24 hours\' notice if you must cancel, and offer a make-up time.',
        'Write the lesson note in the app within 24 hours: what was covered, what was strong, what is next.',
        'Be honest with families about progress. Do not promise marks.',
        'Teach the student\'s school course and notation. Do not do the student\'s assessments for them.',
        'Keep family and student information confidential and only in the Crestio app.',
      ],
    },
    {
      id: 'breaches',
      heading: 'If the code is broken',
      paragraphs: [
        'Minor lapses are raised with you and fixed. Any breach of the safety or boundaries sections ends the agreement immediately, and where the law requires it Crestio reports the matter to the police, the NSW Office of the Children\'s Guardian or the Department of Communities and Justice.',
      ],
    },
  ],
};

export const CHILD_SAFE_POLICY: LegalDoc = {
  title: 'Child safe policy',
  kicker: 'Safety',
  version: CHILD_SAFE_POLICY_VERSION,
  intro: `${AGENCY.name} arranges tutoring for children and young people. Under the NSW Child Safe Scheme, tutoring services must have child safe systems, policies and processes based on the NSW Child Safe Standards. This policy is ours. Every tutor agrees to it and to the Code of Conduct before meeting a student.`,
  sections: [
    {
      id: 'commitment',
      heading: 'Our commitment',
      paragraphs: [
        'Children have the right to be safe, heard and respected in every lesson we arrange. We have zero tolerance for abuse or neglect of any kind. We take every concern seriously, act on it, and tell the authorities when the law requires it.',
      ],
    },
    {
      id: 'recruitment',
      heading: 'How we choose tutors',
      bullets: [
        'Every tutor is interviewed on video by the founder before any student is matched.',
        'Every tutor is 18 or older, holds a NSW Working With Children Check for paid work, and we verify the number with the Office of the Children\'s Guardian and record the date we did so. We are notified if a check is cancelled and we act on it immediately.',
        'We sight photo identification and speak to referees.',
        'Every tutor signs the Tutor Agreement and the Code of Conduct and completes the Office of the Children\'s Guardian child-safe e-learning before their first lesson.',
        'Working With Children Check expiry dates are tracked, and a tutor whose check lapses is stood down until it is renewed.',
      ],
    },
    {
      id: 'lessons',
      heading: 'How lessons run',
      bullets: [
        'In-home lessons with a child happen with a parent or guardian at home, in a shared living area.',
        'Online lessons use a video link the family or Crestio provides; tutors keep their camera on and do not record.',
        'Tutors do not contact students privately, do not drive them, and do not give or receive gifts.',
        'All scheduling, changes and payments go through Crestio or the parent.',
        'After every lesson the tutor writes a note that the parent can read in the Crestio app, so families always know what happened in the lesson.',
      ],
    },
    {
      id: 'concerns',
      heading: 'Raising a concern or complaint',
      paragraphs: [
        `Anyone, whether a parent, a student, a tutor or a member of the public, can raise a concern by emailing ${AGENCY.email} or using the report form at crestio.ai/report. Concerns go directly to the founder and are logged, investigated and answered. A student who feels unsafe can tell a parent, the founder, or a trusted adult, and will be believed and helped.`,
        'If a child is in immediate danger, call 000. Concerns about a child\'s safety can also be reported to the NSW Child Protection Helpline on 132 111. Complaints about how Crestio handled a concern can be made to the NSW Office of the Children\'s Guardian.',
      ],
    },
    {
      id: 'response',
      heading: 'What we do with a concern',
      bullets: [
        'We record it the day we receive it, including what was reported, by whom, and what we did.',
        'We stand a tutor down from all lessons while a safety concern is investigated.',
        'We report to the police, the Office of the Children\'s Guardian or the Department of Communities and Justice when the law requires it, and we cooperate fully.',
        'We tell the family what we found and what we changed.',
      ],
    },
    {
      id: 'review',
      heading: 'Records and review',
      paragraphs: [
        'Recruitment checks, agreement acceptances, verification dates, concerns and outcomes are kept in the Crestio app. This policy is reviewed every twelve months and whenever the law or a concern shows it needs to change.',
      ],
    },
  ],
};

export const LEGAL_DOCS: Record<'tutor-agreement' | 'code-of-conduct' | 'child-safe', LegalDoc> = {
  'tutor-agreement': TUTOR_AGREEMENT,
  'code-of-conduct': CODE_OF_CONDUCT,
  'child-safe': CHILD_SAFE_POLICY,
};
