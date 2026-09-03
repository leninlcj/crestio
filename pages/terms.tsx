import type { GetStaticProps } from 'next';
import LegalPage from '../components/LegalPage';
import { serverSideTranslations } from '../lib/i18nServer';
import { AGENCY } from '../lib/agency';

const TOC = [
  { id: 'what-we-do', label: 'What we do' },
  { id: 'matching', label: 'Bookings and matching' },
  { id: 'guarantee', label: 'First-lesson guarantee' },
  { id: 'fees', label: 'Fees and payment' },
  { id: 'cancellations', label: 'Cancellations and rescheduling' },
  { id: 'safety', label: 'Safety and conduct' },
  { id: 'accounts', label: 'Your account and the app' },
  { id: 'tutors', label: 'Tutors' },
  { id: 'liability', label: 'Liability' },
  { id: 'ending', label: 'Ending the arrangement' },
  { id: 'law', label: 'Governing law' },
  { id: 'contact', label: 'Contact' },
];

const H = AGENCY.policies.cancellationHours;

export default function Terms() {
  return (
    <LegalPage title="Terms of service" lastUpdated="4 September 2026" toc={TOC}>
      <p>
        These terms apply to tutoring arranged through {AGENCY.name} (&ldquo;Crestio&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), run by {AGENCY.founder.name} in Sydney, Australia. By booking a tutor or using the app at crestio.ai, you agree to them. Nothing in these terms takes away rights you have under the Australian Consumer Law.
      </p>

      <h2 id="what-we-do">What we do</h2>
      <p>
        Crestio is an introduction and administration agency for tutoring. We find and vet tutors, match a tutor to your child, arrange lessons online or in-home, collect payment, and run the notes, records and communication through the app at crestio.ai. The tutoring itself is provided to you by the tutor, who is an independent tutor introduced by Crestio and acting as your child's tutor under this arrangement. Crestio collects your payment on the tutor's behalf, keeps a service fee for its own work, and pays the tutor. Crestio's own promises to you — vetting, matching, the first-lesson guarantee, replies within a day — are Crestio's and are set out here.
      </p>

      <h2 id="matching">Bookings and matching</h2>
      <p>
        You tell us the year level, subject and preferred format; we propose a tutor. There is no charge to enquire and no charge until a lesson is held. A booking exists once you accept a proposed tutor and a first lesson time. Ongoing lessons are booked as a recurring weekly slot unless we agree otherwise.
      </p>

      <h2 id="guarantee">First-lesson guarantee</h2>
      <p>
        {AGENCY.policies.firstLessonGuarantee} To use the guarantee, tell us before the second lesson with that tutor. The guarantee applies once per tutor match.
      </p>

      <h2 id="fees">Fees and payment</h2>
      <ul>
        <li>Rates are published at crestio.ai/pricing and are per hour, per student, for the student's level and lesson format at the time of booking. Each rate is made up of the tutor's fee and Crestio's service fee; the split is shown on your invoice. We give at least 30 days' notice of any rate change.</li>
        <li>Lessons are invoiced after they are held. Invoices are payable within 7 days by card through the secure payment link, or you may buy a prepaid block of hours in advance, which is drawn down per lesson.</li>
        <li>Crestio collects payment as the tutor's agent and pays the tutor from it. Nothing is charged to your card without your authorisation. If you save a card for convenience, we charge it only for lessons held or late cancellations under these terms, and we tell you each time.</li>
        <li>Longer or shorter lessons are charged pro rata. Travel is included in the in-home rate.</li>
        <li>If an invoice is more than 14 days overdue we may pause lessons until it is paid.</li>
      </ul>

      <h2 id="cancellations">Cancellations and rescheduling</h2>
      <ul>
        <li>Give at least {H} hours' notice to cancel or reschedule a lesson at no charge.</li>
        <li>A lesson cancelled with less than {H} hours' notice, or a student who does not attend, is charged at the full rate, because the tutor is paid for the time they held for you. We may waive this at our discretion for illness or emergencies.</li>
        <li>If a tutor cancels or does not attend, you are not charged, and we offer a replacement time or a replacement tutor.</li>
        <li>Online lessons start at the booked time; the lesson length is not extended for a late start by the student.</li>
      </ul>

      <h2 id="safety">Safety and conduct</h2>
      <ul>
        <li>Every tutor is 18 or older and holds a NSW Working With Children Check, which we verify with the NSW Office of the Children's Guardian before the tutor meets a student.</li>
        <li>For in-home lessons with a child, a parent or guardian must be home during the lesson. Lessons take place in a shared living area, not a bedroom.</li>
        <li>Tutors follow our code of conduct. Lesson arrangements, changes and payments go through Crestio or the parent — never privately between a tutor and a student.</li>
        <li>If anything concerns you about a tutor or a lesson, tell us at once at <a href={`mailto:${AGENCY.email}`}>{AGENCY.email}</a> or through <a href="/report">crestio.ai/report</a>. Our <a href="/child-safe">Child Safe Policy</a> sets out how we respond.</li>
      </ul>

      <h2 id="accounts">Your account and the app</h2>
      <p>
        Parents and students may be given access to the Crestio app to see lessons, notes, homework, files and invoices. You are responsible for keeping your sign-in details private. Files and notes shared through the app are for the student's own use and may not be redistributed. Our <a href="/privacy">privacy policy</a> explains what we collect and how we use it.
      </p>

      <h2 id="tutors">Tutors</h2>
      <p>
        Tutors are independent tutors running their own businesses. They are not employees of Crestio, and not employees of yours. Each tutor has agreed to Crestio's Tutor Agreement and Code of Conduct, holds a verified Working With Children Check, and is paid by Crestio from the payment we collect from you. Families agree not to engage a Crestio tutor privately for paid tutoring, outside Crestio, for 12 months after their last Crestio lesson; if you would like to change how you work with your tutor, talk to us.
      </p>

      <h2 id="liability">Liability</h2>
      <p>
        Crestio provides its matching, administration and payment services with due care and skill. The tutor is responsible for the lessons they deliver. Neither Crestio nor the tutor guarantees any particular mark, grade or result — that depends on the student, the school and many things outside a lesson. To the extent the law allows, Crestio's liability for any claim relating to its services is limited to re-supplying the service or refunding the Crestio service fee for the lessons in question. Nothing in these terms excludes rights you have under the Australian Consumer Law.
      </p>

      <h2 id="ending">Ending the arrangement</h2>
      <p>
        There is no lock-in. You can pause or stop at any time by telling us, with at least {H} hours' notice before the next lesson. Unused prepaid hours are refunded on request. We may end an arrangement if these terms are breached, if a tutor's safety or wellbeing is at risk, or if invoices remain unpaid.
      </p>

      <h2 id="law">Governing law</h2>
      <p>These terms are governed by the laws of New South Wales, Australia.</p>

      <h2 id="contact">Contact</h2>
      <p>{AGENCY.name} · Sydney, NSW, Australia · <a href={`mailto:${AGENCY.email}`}>{AGENCY.email}</a>.</p>
    </LegalPage>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['legal']),
  },
});
