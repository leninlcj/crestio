import { LegalArticle } from '../components/agency/LegalArticle';
import { AGENCY } from '../lib/agency';

const TOC = [
  { id: 'who-we-are', label: 'Who we are' },
  { id: 'what-we-collect', label: 'What we collect and why' },
  { id: 'how-we-use', label: 'How we use it' },
  { id: 'who-we-share-with', label: 'Who we share it with' },
  { id: 'children', label: "Children's information" },
  { id: 'tutor-applicants', label: 'Tutor applicants and tutors' },
  { id: 'where-data-lives', label: 'Where your information is stored' },
  { id: 'retention', label: 'How long we keep it' },
  { id: 'your-choices', label: 'Your choices and rights' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'security', label: 'Security' },
  { id: 'changes', label: 'Changes' },
  { id: 'contact', label: 'Contact' },
];

const EMAIL = AGENCY.email;

export default function Privacy() {
  return (
    <LegalArticle
      title="Privacy policy"
      description="What Crestio Tutoring collects from parents, students and tutors, why, who it is shared with, where it is stored, and your rights under the Australian Privacy Act."
      path="/privacy"
      lastUpdated="5 September 2026"
      toc={TOC}
    >
      <h2 id="who-we-are">Who we are</h2>
      <p>
        {AGENCY.name} (&ldquo;Crestio&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a tutoring service run by {AGENCY.founder.name} in Sydney, Australia. We match students with tutors, arrange lessons online and in-home, and run the scheduling, lesson notes, invoicing and payments through our own software at crestio.ai.
      </p>
      <p>Questions about this policy or your information: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>

      <h2 id="what-we-collect">What we collect and why</h2>
      <p>We collect only what we need to match a tutor, run lessons and take payment.</p>
      <ul>
        <li><strong>Parents and guardians:</strong> your name, email, phone number and suburb, and the content of your enquiries and messages.</li>
        <li><strong>Students:</strong> first name (and surname once enrolled), year level, school, subjects, lesson notes written by the tutor, homework set and completed, and progress notes. For students who use the optional student portal: email, full name and date of birth, for age verification.</li>
        <li><strong>Tutor applicants and tutors:</strong> contact details, suburb, qualifications and results, Working With Children Check details, ABN, availability, and the notes from our interview and checks.</li>
        <li><strong>Payments:</strong> handled by Stripe. We see your name, email and the last four digits of a card; we never store or see full card numbers.</li>
        <li><strong>Technical:</strong> the pages you visit on crestio.ai and basic device information, used only to keep the site working and secure. A one-way hash of the network address is stored with each form submission to limit spam.</li>
      </ul>

      <h2 id="how-we-use">How we use it</h2>
      <ul>
        <li>To match a tutor to a student and arrange lessons.</li>
        <li>To run lessons, write and send lesson notes, set homework and track progress.</li>
        <li>To send invoices, take payment and keep the financial records the law requires.</li>
        <li>To communicate with you about lessons, changes and your account.</li>
        <li>To vet, onboard and pay tutors.</li>
        <li>To keep the service secure and to meet our legal obligations.</li>
      </ul>
      <p>
        Lesson notes may be tidied by a writing assistant (Anthropic's Claude) before they are sent to you. The note is written by the tutor; the assistant improves the wording. We do not use your information for advertising and we do not sell it to anyone.
      </p>

      <h2 id="who-we-share-with">Who we share it with</h2>
      <ul>
        <li><strong>Your matched tutor</strong>, an independent tutor introduced by Crestio, receives the details needed to arrange and deliver lessons: student name, year level, subjects, the address for in-home lessons, and your contact details. Tutors agree to use them for lessons only.</li>
        <li><strong>Supabase</strong>: authentication and database hosting. Data is stored in Sydney, Australia.</li>
        <li><strong>Vercel</strong>: web hosting.</li>
        <li><strong>Stripe</strong>: payment processing. Stripe sees your name, email and card details; we do not.</li>
        <li><strong>Resend</strong>: sends our emails (confirmations, lesson notes, invoices).</li>
        <li><strong>Anthropic</strong> (United States): the writing assistant used to tidy lesson notes. Note content is sent only when a tutor uses that feature. Under Anthropic's commercial terms, content is not used to train their models.</li>
        <li><strong>NSW Office of the Children's Guardian</strong>: we verify tutors' Working With Children Check details through the official online verification service.</li>
      </ul>
      <p>We do not share your information with anyone else unless the law requires it.</p>

      <h2 id="children">Children's information</h2>
      <p>
        Information about a child is provided by the parent or guardian and is handled with extra care. We collect only what is needed to provide tutoring, and only tutors and parents have administrative accounts.
      </p>
      <p>
        The optional student portal lets a student see their own lessons, homework and files. Students cannot sign up by themselves. For a student under 16, the invitation goes to the parent first and the account is not created until the parent approves; parents can revoke access at any time. Students never see other students, invoices, payments, internal notes or marketing, and we send students no promotional email of any kind.
      </p>
      <p>
        For in-home lessons with a child, we ask that a parent or guardian is home during the lesson. Every tutor holds a NSW Working With Children Check that we verify before they meet a student.
      </p>

      <h2 id="tutor-applicants">Tutor applicants and tutors</h2>
      <p>
        If you apply to tutor, we keep your application and our notes from the selection process. If you are not selected, we keep your application for up to 12 months in case a suitable position opens, then delete it; you can ask us to delete it sooner. If you join, we keep your records for as long as you tutor with us and for the period the law requires afterwards.
      </p>

      <h2 id="where-data-lives">Where your information is stored</h2>
      <p>
        Our database is hosted by Supabase on servers in Sydney, Australia, and is encrypted at rest. Information sent to service providers travels over encrypted connections. Files uploaded to the app are stored privately in Sydney and can be seen only by the tutors in our team and the parents and students linked to them.
      </p>

      <h2 id="retention">How long we keep it</h2>
      <p>
        We keep family and student records for as long as you use the service and for a reasonable period afterwards so we can pick up where we left off if you return. If you ask us to, we delete your records within 30 days. Financial records are kept for 7 years as Australian tax law requires. Enquiries that do not go ahead are deleted after 12 months.
      </p>

      <h2 id="your-choices">Your choices and rights</h2>
      <p>Under the Australian Privacy Act 1988 you can:</p>
      <ul>
        <li>ask for a copy of the information we hold about you or your child;</li>
        <li>ask us to correct anything that is wrong;</li>
        <li>ask us to delete it;</li>
        <li>ask us to stop contacting you.</li>
      </ul>
      <p>Email <a href={`mailto:${EMAIL}`}>{EMAIL}</a> and we will respond within 14 days. If you are not satisfied with our response you can contact the Office of the Australian Information Commissioner.</p>

      <h2 id="cookies">Cookies</h2>
      <p>
        crestio.ai uses only the cookies needed to keep tutors and parents signed in to the app. There are no advertising cookies and no tracking that identifies individuals.
      </p>

      <h2 id="security">Security</h2>
      <p>
        We use encrypted connections, encrypted storage and access controls so that each tutor, parent and student can see only their own information. No system is perfectly secure; if you believe you have found a problem, email <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
      </p>

      <h2 id="changes">Changes</h2>
      <p>
        We may update this policy. The current version is always on this page with the date it was last updated. If a change materially affects how we use your information, we will email you before it takes effect.
      </p>

      <h2 id="contact">Contact</h2>
      <p>{AGENCY.name} · Sydney, NSW, Australia · <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>
    </LegalArticle>
  );
}
