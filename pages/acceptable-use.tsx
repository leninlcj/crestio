import type { GetStaticProps } from 'next';
import LegalPage from '../components/LegalPage';
import { serverSideTranslations } from '../lib/i18nServer';

const TOC = [
  { id: 'spirit', label: 'The spirit' },
  { id: 'students', label: 'Students under 18' },
  { id: 'parents', label: 'Communication with parents' },
  { id: 'content', label: 'Content you upload' },
  { id: 'platform', label: 'Platform integrity' },
  { id: 'enforcement', label: 'Enforcement' },
  { id: 'reporting', label: 'Reporting' },
  { id: 'contact', label: 'Contact' },
];

export default function AcceptableUse() {
  return (
    <LegalPage title="Acceptable use" lastUpdated="2 May 2026" toc={TOC}>
      <h2 id="spirit">The spirit</h2>
      <p>
        Crestio is built for tutors who care about the kids they teach. The acceptable-use policy is short because the rules are obvious. Don't use this software to harm students, deceive parents, or weaponise the platform against another tutor.
      </p>
      <p>
        If you're reading this and unsure whether something is OK, the safest answer is: ask first. Email <a href="mailto:lenin@crestio.ai">lenin@crestio.ai</a>.
      </p>

      <h2 id="students">Students under 18</h2>
      <p>
        Most students on Crestio are under 18. That means the bar is high.
      </p>
      <ul>
        <li>Don't add a student to Crestio without the consent of a parent or legal guardian (under 18) or the student themselves (18+).</li>
        <li>Don't use Crestio to communicate with a student without their parent's awareness.</li>
        <li>Don't share files with a student that contain content unsuitable for their age group.</li>
        <li>Don't use the student portal to send marketing, promotional, or personal-life content. The portal is for tutoring information only.</li>
        <li>Don't request data from a student (photos, personal details, location) outside what the platform's documented features collect.</li>
      </ul>
      <p>
        Behaviour that puts a student at risk — grooming, sexual content, bullying, manipulation outside the tutoring relationship — results in immediate account termination and, where applicable, reporting to law enforcement.
      </p>

      <h2 id="parents">Communication with parents</h2>
      <ul>
        <li>Don't impersonate a parent or send messages on behalf of one without their explicit authorisation.</li>
        <li>Don't pressure a parent into payment outside the documented invoice and Stripe payment flow.</li>
        <li>Don't use AI-polished notes to misrepresent what happened in a session.</li>
      </ul>

      <h2 id="content">Content you upload</h2>
      <ul>
        <li>You hold the rights to share what you upload. If a PDF you share isn't yours to share — that's a violation.</li>
        <li>Don't upload content that infringes copyright, trademarks, or other third-party rights.</li>
        <li>Don't upload images of children that you don't have explicit parental consent to share.</li>
        <li>Don't use Crestio file storage for content unrelated to tutoring (personal media, business documents from another role, etc.).</li>
      </ul>

      <h2 id="platform">Platform integrity</h2>
      <ul>
        <li>Don't try to access another tutor's data, another organisation's records, or any account that is not yours.</li>
        <li>Don't attempt to bypass watermarking, audit logs, signed URLs, or other access controls.</li>
        <li>Don't run automated scripts that scrape, mass-export, or stress-test the platform without prior written permission.</li>
        <li>Don't use Crestio for anything that could be reasonably described as "credential stuffing", "denial of service", or other abuse against the platform or its users.</li>
        <li>Don't resell, sublicense, or repackage Crestio access.</li>
      </ul>

      <h2 id="enforcement">Enforcement</h2>
      <p>
        Most violations get a single email asking you to stop. Persistent or severe violations result in account suspension or termination, with notice where possible. For violations involving student safety, payment fraud, or platform integrity, we may suspend access immediately and ask questions afterwards.
      </p>
      <p>
        We retain the right to remove specific files, messages, or sessions that violate this policy without removing the entire account.
      </p>

      <h2 id="reporting">Reporting</h2>
      <p>
        If you see something on Crestio that violates this policy — whether you're a tutor, a parent, or a student — please email <a href="mailto:lenin@crestio.ai">lenin@crestio.ai</a> with what you saw and where. Reports are read by a human within 24 hours.
      </p>
      <p>
        For urgent safety concerns involving a child, also contact your local child-safety authority. We will cooperate with lawful requests from those authorities.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        <a href="mailto:lenin@crestio.ai">lenin@crestio.ai</a>.
      </p>
    </LegalPage>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['legal']),
  },
});
