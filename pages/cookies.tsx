import { LegalArticle } from '../components/agency/LegalArticle';
import { AGENCY } from '../lib/agency';

const TOC = [
  { id: 'what-we-use', label: 'What we use' },
  { id: 'strictly-necessary', label: 'Strictly necessary' },
  { id: 'analytics', label: 'Page views' },
  { id: 'no-tracking', label: 'What we do not use' },
  { id: 'changes', label: 'Changes' },
  { id: 'contact', label: 'Contact' },
];

export default function Cookies() {
  return (
    <LegalArticle
      title="Cookie policy"
      description="crestio.ai sets only the cookies needed to keep tutors and parents signed in to the app. No advertising cookies, no retargeting, no cross-site tracking."
      path="/cookies"
      lastUpdated="5 September 2026"
      toc={TOC}
    >
      <h2 id="what-we-use">What we use</h2>
      <p>
        The public pages of crestio.ai set no cookies. The app, which tutors and parents sign in to, uses only the cookies and browser storage needed to keep you signed in and remember your settings. There are no advertising cookies, no retargeting pixels and no analytics that identify individuals.
      </p>

      <h2 id="strictly-necessary">Strictly necessary</h2>
      <ul>
        <li><strong>Sign-in session.</strong> A secure cookie that proves you signed in to the app. It is removed when you sign out.</li>
        <li><strong>Refresh token.</strong> A longer-lived, HTTP-only cookie that lets the app keep you signed in without asking for your password again.</li>
        <li><strong>Language.</strong> A small entry that remembers which language you chose for the app.</li>
        <li><strong>Small conveniences.</strong> Browser storage entries used by the app, such as which tab you last opened or a notice you dismissed. They never leave your browser.</li>
      </ul>

      <h2 id="analytics">Page views</h2>
      <p>
        We count page views on the public site with Vercel Web Analytics so we know which pages get visited. It sets no cookies, does not track you across sites and does not identify you.
      </p>

      <h2 id="no-tracking">What we do not use</h2>
      <ul>
        <li>No third-party advertising cookies.</li>
        <li>No retargeting pixels.</li>
        <li>No cross-site tracking.</li>
        <li>No analytics that identify individuals or build behavioural profiles.</li>
      </ul>

      <h2 id="changes">Changes</h2>
      <p>
        If we ever add an optional cookie, we will update this page and ask for your consent before setting it.
      </p>

      <h2 id="contact">Contact</h2>
      <p>Questions about cookies or anything we store in your browser: <a href={`mailto:${AGENCY.email}`}>{AGENCY.email}</a>.</p>
    </LegalArticle>
  );
}
