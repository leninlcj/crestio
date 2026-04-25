import LegalPage from '../components/LegalPage';

const TOC = [
  { id: 'agreement', label: 'Agreement' },
  { id: 'who-can-use', label: 'Who can use Crestio' },
  { id: 'your-account', label: 'Your account' },
  { id: 'your-content', label: 'Your content' },
  { id: 'uploaded-content', label: 'User uploaded content' },
  { id: 'acceptable-use', label: 'Acceptable use' },
  { id: 'billing', label: 'Subscription and billing' },
  { id: 'ai-content', label: 'AI-generated content' },
  { id: 'availability', label: 'Service availability' },
  { id: 'termination', label: 'Termination' },
  { id: 'disclaimer', label: 'Disclaimer and limitation of liability' },
  { id: 'governing-law', label: 'Governing law' },
  { id: 'changes', label: 'Changes to these terms' },
  { id: 'contact', label: 'Contact' },
];

export default function Terms() {
  return (
    <LegalPage title="Terms of service" lastUpdated="24 April 2026" toc={TOC}>
      <h2 id="agreement">Agreement</h2>
      <p>
        By creating a Crestio account, you agree to these terms. Read them carefully. If you don't agree, don't use the service.
      </p>

      <h2 id="who-can-use">Who can use Crestio</h2>
      <p>
        You must be at least 18 years old and have the legal authority to enter into contracts in your country.
      </p>

      <h2 id="your-account">Your account</h2>
      <ul>
        <li>You're responsible for your account security.</li>
        <li>Don't share credentials with anyone else.</li>
        <li>Notify us immediately if you suspect unauthorised access.</li>
        <li>We may suspend accounts that violate these terms, with notice where possible.</li>
      </ul>

      <h2 id="your-content">Your content</h2>
      <p>
        You own the content you add to Crestio — student records, session notes, lesson plans, invoices, and messages. By using Crestio, you grant us a limited license to store, display, and process this content solely to provide the service to you.
      </p>

      <h2 id="uploaded-content">User uploaded content</h2>
      <p>
        Crestio lets tutors upload files — PDFs, images, and other documents — to share with their students and the parents linked to those students. By uploading a file, you warrant that:
      </p>
      <ul>
        <li>You hold all necessary rights to share the file (copyright, model release, parental consent for any image of a child, etc).</li>
        <li>The file does not infringe any third party's rights and does not contain unlawful, harmful, or harassing material.</li>
        <li>You have permission from the relevant parents to share files concerning their children.</li>
      </ul>
      <p>
        You retain ownership of files you upload. By uploading, you grant Crestio a limited licence to store, process, and deliver the file to the people you have explicitly linked to (your students' parents, your organisation's tutors). You agree to indemnify Crestio against any third-party claim arising from a file you upload.
      </p>
      <p>
        <strong>Takedown.</strong> If you believe a file on Crestio infringes your rights or contains harmful material, email <a href="mailto:support@crestio.ai">support@crestio.ai</a> with the file URL or a description, the rights you hold, and your contact details. We will review within 5 business days and remove or restrict access where appropriate.
      </p>
      <p>
        Crestio does not actively review uploaded files. We may remove files that violate these terms or applicable law.
      </p>

      <h2 id="acceptable-use">Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use Crestio for illegal purposes.</li>
        <li>Add student or parent information without appropriate consent.</li>
        <li>Share your account with others (team accounts exist for this purpose).</li>
        <li>Attempt to access other users' data.</li>
        <li>Upload harmful code, executables, or files that attempt to disrupt the service.</li>
        <li>Upload material you do not have the right to share.</li>
        <li>Attempt to bypass the file viewer's access controls (signed URLs, watermarks, view restrictions).</li>
        <li>Resell access to Crestio.</li>
      </ul>

      <h2 id="billing">Subscription and billing</h2>
      <p>Crestio is a paid service. Available plans:</p>
      <ul>
        <li><strong>Solo</strong> — $24 AUD per month, or $240 AUD per year (saves 2 months).</li>
        <li><strong>Team</strong> — $59 AUD per month, or $590 AUD per year (saves 2 months).</li>
        <li><strong>Growth</strong> — tailored pricing for larger practices. Contact us.</li>
      </ul>
      <p>
        New Solo accounts get a 7-day free trial. New Team accounts get a 14-day free trial. A valid payment method is required at signup. Your card is charged at the end of the trial unless you cancel first.
      </p>
      <p>
        You can cancel anytime from the billing portal. Access continues until the end of your paid billing period. No refunds for partial months except where required by law.
      </p>
      <p>
        Prices are in Australian Dollars, inclusive of GST where applicable. We may change prices with at least 30 days' email notice; changes apply at your next billing cycle.
      </p>

      <h2 id="ai-content">AI-generated content</h2>
      <p>
        Some Crestio features use AI to help you — polishing notes, suggesting lesson plans, and powering the in-app assistant. AI output can contain errors. You are responsible for reviewing all AI-generated content before sharing it with parents, students, or using it with learners. Crestio makes no warranty about the quality, accuracy, or appropriateness of AI-generated content.
      </p>

      <h2 id="availability">Service availability</h2>
      <p>
        We aim to keep Crestio available at all times, but we don't guarantee uninterrupted access. We may perform maintenance, and occasional outages happen. We won't be liable for brief periods of unavailability.
      </p>

      <h2 id="termination">Termination</h2>
      <p>
        You can delete your account anytime from settings. We may suspend or terminate accounts that violate these terms, with notice where possible. On termination, your data is removed per our privacy policy.
      </p>

      <h2 id="disclaimer">Disclaimer and limitation of liability</h2>
      <p>
        Crestio is provided "as is" and "as available" without warranties of any kind, whether express or implied, including but not limited to merchantability, fitness for a particular purpose, or non-infringement.
      </p>
      <p>
        To the maximum extent permitted by law, Crestio's total liability to you for any claim arising out of or relating to these terms or the service is limited to the fees you paid to Crestio in the 12 months preceding the claim. Crestio is not liable for indirect, incidental, special, consequential, or punitive damages.
      </p>
      <p>
        Nothing in these terms excludes any rights you have under the Australian Consumer Law or equivalent mandatory consumer protection laws in your country.
      </p>

      <h2 id="governing-law">Governing law</h2>
      <p>
        These terms are governed by the laws of New South Wales, Australia. Disputes will be resolved in the courts of New South Wales unless your local consumer protection laws require otherwise.
      </p>

      <h2 id="changes">Changes to these terms</h2>
      <p>
        We may update these terms. Material changes will be notified by email at least 14 days in advance. Continuing to use Crestio after changes take effect means you accept the new terms.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        Questions: <a href="mailto:support@crestio.ai">support@crestio.ai</a>.
      </p>
    </LegalPage>
  );
}
