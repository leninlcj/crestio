import LegalPage from '../components/LegalPage';

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
      lastUpdated="24 April 2026"
      toc={TOC}
    >
      <h2 id="who-we-are">Who we are</h2>
      <p>
        Crestio is a tutoring management platform operated by the Crestio team. We're based in Australia and serve tutors worldwide.
      </p>
      <p>
        Questions about this policy or your data: email <a href="mailto:support@crestio.ai">support@crestio.ai</a>.
      </p>

      <h2 id="what-we-collect">What we collect and why</h2>
      <p>
        To run Crestio, we store the information you add to the platform:
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
        We don't read your session notes. We don't train AI models on your data. We don't sell data to anyone. The only reason we store what you enter is to show it back to you and the people you choose to share it with — like the parents of your students.
      </p>

      <h2 id="how-we-use">How we use your information</h2>
      <p>We use the information you provide to:</p>
      <ul>
        <li>Provide the service you pay for.</li>
        <li>Authenticate you and keep your account secure.</li>
        <li>Send transactional emails — invitations you issue, billing receipts, password resets.</li>
        <li>Respond when you contact support.</li>
        <li>Investigate abuse and comply with legal obligations.</li>
      </ul>
      <p>
        We don't use your data to target advertising. We don't use it for analytics that identify individuals.
      </p>

      <h2 id="third-parties">Third-party service providers</h2>
      <p>
        We rely on a small set of vetted providers to deliver Crestio. Data flows to them only when the specific feature they support is in use.
      </p>
      <ul>
        <li><strong>Supabase</strong> — authentication and database. Data is stored in Sydney, Australia.</li>
        <li><strong>Vercel</strong> — web hosting and application delivery.</li>
        <li><strong>Stripe</strong> — payment processing. Stripe sees your name, email, country, and card details; we do not.</li>
        <li>
          <strong>A third-party AI service provider based in the United States</strong> — used only when you invoke Polish notes, Generate lesson plan, or the in-app Assistant. Message content is sent only when you use these features; nothing is sent in the background. This provider is certified to industry security standards (SOC 2 Type II) and does not train on customer data.
        </li>
        <li><strong>Resend</strong> — transactional email delivery.</li>
      </ul>

      <h2 id="where-data-lives">Where your data lives</h2>
      <p>
        Your data is stored on servers located in Sydney, Australia, operated by Supabase. Backups are encrypted at rest. Data sent to third parties is transmitted over encrypted connections (TLS 1.3).
      </p>

      <h2 id="retention">How long we keep data</h2>
      <p>
        We keep your data for as long as your account is active. If you cancel or delete your account, we permanently remove all associated data within 30 days. Billing records are retained for 7 years as required by Australian tax law.
      </p>
      <p>
        Files you upload (PDFs, images) are stored on our behalf by Supabase in Sydney, Australia. They are private — only you, tutors in your organisation, and parents you have explicitly linked to a student can view them. Files are deleted as part of the same 30-day account-deletion window. If your subscription is cancelled, your files remain intact for 60 days so you can re-subscribe without losing them; they are then permanently deleted.
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
        Email <a href="mailto:support@crestio.ai">support@crestio.ai</a> and we'll respond within 14 days.
      </p>

      <h2 id="children">Children's data</h2>
      <p>
        Crestio handles information about children (students) but children do not directly use our service. Only tutors and parents have accounts. Tutors are responsible for obtaining appropriate consent from parents before adding a student's details to Crestio. Parents who join the parent portal are consenting to Crestio processing their child's tutoring information on their tutor's behalf.
      </p>

      <h2 id="cookies">Cookies and tracking</h2>
      <p>
        Crestio uses only essential cookies needed to keep you signed in. We don't use advertising cookies, tracking pixels, or analytics that identify individuals.
      </p>

      <h2 id="security">Security</h2>
      <p>
        We use industry-standard security practices including encrypted connections, encrypted data storage, and regular security reviews. No system is perfectly secure, but we take the responsibility seriously. If you believe you've found a security issue, email <a href="mailto:support@crestio.ai">support@crestio.ai</a>.
      </p>

      <h2 id="changes">Changes to this policy</h2>
      <p>
        If we make material changes to this policy, we'll email you at least 14 days before the change takes effect.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        Questions or requests: <a href="mailto:support@crestio.ai">support@crestio.ai</a>.
      </p>
    </LegalPage>
  );
}
