import type { GetStaticProps } from 'next';
import LegalPage from '../components/LegalPage';
import { serverSideTranslations } from '../lib/i18nServer';

const TOC = [
  { id: 'who-we-are', label: 'Who we are' },
  { id: 'what-we-collect', label: 'What we collect and why' },
  { id: 'how-we-use', label: 'How we use your information' },
  { id: 'third-parties', label: 'Third-party service providers' },
  { id: 'where-data-lives', label: 'Where your data lives' },
  { id: 'retention', label: 'How long we keep data' },
  { id: 'your-rights', label: 'Your rights' },
  { id: 'children', label: "Children's data" },
  { id: 'cookies', label: 'Cookies and tracking' },
  { id: 'security', label: 'Security' },
  { id: 'changes', label: 'Changes to this policy' },
  { id: 'contact', label: 'Contact' },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy policy"
      lastUpdated="2 May 2026 (sole-founder voice clarified)"
      toc={TOC}
    >
      <h2 id="who-we-are">Who we are</h2>
      <p>
        Crestio is a tutoring management platform run by Lenin Joaquin (sole founder), based in Sydney, Australia, serving tutors worldwide.
      </p>
      <p>
        Questions about this policy or your data: email <a href="mailto:lenin@crestio.ai">lenin@crestio.ai</a>.
      </p>

      <h2 id="what-we-collect">What Crestio collects and why</h2>
      <p>
        To run Crestio, the following information you add to the platform is stored:
      </p>
      <ul>
        <li>Your account details — name, email, and a hashed password.</li>
        <li>Your organisation's name.</li>
        <li>The student records you choose to add — names, year level, subjects, parent contacts.</li>
        <li>Session notes and lesson plans you create.</li>
        <li>Messages you send through the in-app assistant.</li>
        <li>Billing information, handled by Stripe. Crestio never stores or sees your full card number.</li>
      </ul>
      <p>You stay in control. You can export, correct, or delete any of this at any time.</p>
      <p>
        Crestio doesn't read your session notes, doesn't train AI models on your data, and doesn't sell data to anyone. The only reason Crestio stores what you enter is to show it back to you and the people you choose to share it with — like the parents of your students.
      </p>

      <h2 id="how-we-use">How Crestio uses your information</h2>
      <p>Crestio uses the information you provide to:</p>
      <ul>
        <li>Provide the service you pay for.</li>
        <li>Authenticate you and keep your account secure.</li>
        <li>Send transactional emails — invitations you issue, billing receipts, password resets.</li>
        <li>Respond when you contact support.</li>
        <li>Investigate abuse and comply with legal obligations.</li>
      </ul>
      <p>
        Crestio doesn't use your data to target advertising and doesn't use it for analytics that identify individuals.
      </p>

      <h2 id="third-parties">Third-party service providers</h2>
      <p>
        Crestio relies on a small set of vetted providers to deliver the service. Data flows to them only when the specific feature they support is in use.
      </p>
      <ul>
        <li><strong>Supabase</strong> — authentication and database. Data is stored in Sydney, Australia.</li>
        <li><strong>Vercel</strong> — web hosting and application delivery.</li>
        <li><strong>Stripe</strong> — payment processing. Stripe sees your name, email, country, and card details; Crestio does not.</li>
        <li>
          <strong>Anthropic</strong> (United States) — powers Polish notes, Generate lesson plan, and the in-app Assistant. Message content is sent only when you invoke these features; nothing is sent in the background. Anthropic is audited under SOC 2 Type II, and under their commercial terms customer prompts and outputs are not used to train their models.
        </li>
        <li><strong>Resend</strong> — transactional email delivery.</li>
      </ul>

      <h2 id="where-data-lives">Where your data lives</h2>
      <p>
        Your data is stored on servers located in Sydney, Australia, operated by Supabase. Backups are encrypted at rest. Data sent to third parties is transmitted over encrypted connections (TLS 1.3).
      </p>

      <h2 id="retention">How long Crestio keeps data</h2>
      <p>
        Crestio keeps your data for as long as your account is active. If you cancel or delete your account, all associated data is permanently removed within 30 days. Billing records are retained for 7 years as required by Australian tax law.
      </p>
      <p>
        Files you upload (PDFs, images) are stored on Crestio's behalf by Supabase in Sydney, Australia. They are private — only you, tutors in your organisation, and parents you have explicitly linked to a student can view them. Files are deleted as part of the same 30-day account-deletion window. If your subscription is cancelled, your files remain intact for 60 days so you can re-subscribe without losing them; they are then permanently deleted.
      </p>

      <h2 id="your-rights">Your rights</h2>
      <p>
        Under the Australian Privacy Act 1988 and equivalent laws in your country, you have the right to:
      </p>
      <ul>
        <li>Access a copy of your data</li>
        <li>Correct any errors</li>
        <li>Request deletion</li>
        <li>Object to certain processing</li>
        <li>Request a portable export of your data</li>
      </ul>
      <p>
        Email <a href="mailto:lenin@crestio.ai">lenin@crestio.ai</a> and Crestio will respond within 14 days.
      </p>

      <h2 id="children">Children's data</h2>
      <p>
        Crestio handles information about children (students). Only tutors and parents have administrative accounts. Tutors are responsible for obtaining appropriate consent from parents before adding a student's details to Crestio. Parents who join the parent portal are consenting to Crestio processing their child's tutoring information on their tutor's behalf.
      </p>

      <h2 id="students-under-18">Students under 18</h2>
      <p>
        Crestio offers an optional <strong>student portal</strong> at <code>/student</code>. Tutors can opt individual students in. Students do not sign up by themselves — there is no public student signup. The portal collects only what is needed for the student to see their own sessions: email, full name, date of birth (for age verification), and which homework items they've marked done.
      </p>
      <p>
        <strong>Data minimization.</strong> Students never see other students, never see invoices or payments, never see internal tutor notes, and never see marketing of any kind. Crestio never sends students promotional email.
      </p>
      <p>
        <strong>Parental consent under 16.</strong> When a tutor enables portal access for a student under 16, the invitation routes to the student's parent first. The student's account is not created until the parent explicitly approves. Parents can revoke access at any time from the parent portal — revocation immediately deactivates the student's sign-in.
      </p>
      <p>
        <strong>Tutor-only data control.</strong> All student-portal data lives within the tutor's organisation. Crestio does not share student data with third parties beyond the infrastructure providers needed to operate the service (covered in <a href="#third-parties">Third parties</a>). Crestio does not sell student data or use it for training third-party models.
      </p>
      <p>
        <strong>Marketing.</strong> Crestio sends students no marketing email, no "tips and tricks" series, and no newsletters. Operational email — invitation, welcome, new note, new homework — is sent only when triggered by the tutor. Crestio never sends students promotional content of any kind.
      </p>
      <p>
        <strong>Deletion when access ends.</strong> When a tutor or parent disables a student's portal access, the student's authentication is revoked immediately. The student's tutoring records remain with the tutor's organisation so the tutor can continue teaching the student. If the tutor's organisation is deleted, all student-portal accounts are deleted within 30 days, with 30 days' notice by email.
      </p>
      <p>
        <strong>Account ownership at 18.</strong> When a student turns 18, their data status flips to "self-managed adult". They are notified by email and can choose to take ownership of their account or delete it.
      </p>
      <p>
        <strong>Compliance.</strong> Where applicable, Crestio follows the GDPR Article 8 standard for processing children's data, the Australian Privacy Principles, and the U.S. Children's Online Privacy Protection Act (COPPA). Under-13 students require additional verifiable parental consent before access can be enabled — captured by the parent's signed consent action in the parent portal.
      </p>
      <p>
        <strong>If something feels wrong.</strong> Students can email <a href="mailto:lenin@crestio.ai">lenin@crestio.ai</a> directly, or speak to a parent or another adult they trust.
      </p>

      <h2 id="cookies">Cookies and tracking</h2>
      <p>
        Crestio uses only essential cookies needed to keep you signed in. Crestio does not use advertising cookies, tracking pixels, or analytics that identify individuals.
      </p>

      <h2 id="security">Security</h2>
      <p>
        Crestio uses industry-standard security practices including encrypted connections, encrypted data storage, and regular security reviews. No system is perfectly secure, but Crestio takes the responsibility seriously. If you believe you've found a security issue, email <a href="mailto:lenin@crestio.ai">lenin@crestio.ai</a>.
      </p>

      <h2 id="changes">Changes to this policy</h2>
      <p>
        If Crestio makes material changes to this policy, you'll be emailed at least 14 days before the change takes effect.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        Questions or requests: <a href="mailto:lenin@crestio.ai">lenin@crestio.ai</a>.
      </p>
    </LegalPage>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['legal']),
  },
});
