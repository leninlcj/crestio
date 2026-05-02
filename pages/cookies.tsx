import type { GetStaticProps } from 'next';
import LegalPage from '../components/LegalPage';
import { serverSideTranslations } from '../lib/i18nServer';

const TOC = [
  { id: 'what-cookies', label: 'What we use' },
  { id: 'strictly-necessary', label: 'Strictly necessary' },
  { id: 'no-tracking', label: 'What we do not use' },
  { id: 'changes', label: 'Changes' },
  { id: 'contact', label: 'Contact' },
];

export default function Cookies() {
  return (
    <LegalPage title="Cookie policy" lastUpdated="2 May 2026" toc={TOC}>
      <h2 id="what-cookies">What we use</h2>
      <p>
        Crestio uses only the cookies and local storage entries that are strictly necessary to keep you signed in and remember your preferences within the app. We do not use advertising cookies, retargeting pixels, or analytics that identify individuals.
      </p>

      <h2 id="strictly-necessary">Strictly necessary</h2>
      <ul>
        <li>
          <strong>Authentication session.</strong> A short-lived secure cookie that proves you signed in. Lives for the session duration. If you sign out, it is invalidated.
        </li>
        <li>
          <strong>Refresh token.</strong> A longer-lived cookie that lets the app refresh your session without re-prompting for your password. Stored as a secure, HTTP-only cookie.
        </li>
        <li>
          <strong>Locale preference.</strong> A small browser cookie remembering which language you chose. So you don't have to pick it again on the next visit.
        </li>
        <li>
          <strong>Marketing micro-state.</strong> Browser local storage entries used by the homepage (sandbox visit flag, sticky-bar dismissal). Never sent to a server, lives only in your browser.
        </li>
      </ul>

      <h2 id="no-tracking">What we do not use</h2>
      <ul>
        <li>No third-party advertising cookies.</li>
        <li>No retargeting pixels.</li>
        <li>No cross-site tracking.</li>
        <li>No analytics that identify individuals or build behavioural profiles.</li>
      </ul>
      <p>
        We do use a privacy-respecting page-view counter to know which marketing pages get visited. It does not store cookies on your device, does not track across sites, and is opted out of fingerprinting.
      </p>

      <h2 id="changes">Changes</h2>
      <p>
        If we ever add an optional cookie (for example, a usage analytics cookie that helps us understand how the dashboard is used), we will update this page and ask for your consent before setting it.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        Questions about cookies or anything we set in your browser: email <a href="mailto:lenin@crestio.ai">lenin@crestio.ai</a>.
      </p>
    </LegalPage>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['legal']),
  },
});
