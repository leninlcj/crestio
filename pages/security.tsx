import Head from 'next/head';
import type { GetStaticProps } from 'next';
import MarketingNav from '../components/marketing/MarketingNav';
import MarketingFooter from '../components/marketing/MarketingFooter';
import SecuritySection from '../components/marketing/SecuritySection';
import { serverSideTranslations } from '../lib/i18nServer';

export default function Security() {
  const ogUrl = `/api/og?type=marketing&title=${encodeURIComponent('Built like a bank. Used like a notebook.')}&subtitle=${encodeURIComponent('How we keep your tutoring data safe.')}`;

  return (
    <>
      <Head>
        <title>Security · Crestio</title>
        <meta name="description" content="How Crestio protects your tutoring data: encryption, row-level access control, audit logs, account deletion, and incident response." />
        <meta property="og:title" content="Crestio security" />
        <meta property="og:description" content="Built like a bank. Used like a notebook." />
        <meta property="og:image" content={ogUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogUrl} />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main className="px-6 md:px-12 py-12 md:py-20 max-w-4xl mx-auto">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Security</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter mb-5 leading-[1.05] text-balance">
            Built like a bank. Used like a notebook.
          </h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed mb-12 max-w-prose">
            We hold session notes about real students and payment details from real parents. We treat both like the kind of data that, if it leaked, would end this company. Here's the specifics.
          </p>

          <div className="space-y-4 md:space-y-5">
            <SecuritySection title="Encryption" icon={<IconKey />}>
              <p>All data in transit is TLS 1.2+ over HTTPS. No HTTP fallback — if your browser doesn't support modern TLS, the site refuses to load.</p>
              <p>All data at rest is AES-256 encrypted by Supabase. Database backups are encrypted with separate keys and stored in a different region.</p>
            </SecuritySection>

            <SecuritySection title="Access control" icon={<IconShield />}>
              <p>Every table has row-level security at the database. The query "show me everyone's invoices" cannot succeed even if a code path forgets to filter by organization. The database refuses.</p>
              <p>Tutor private notes are column-level: even within your own organization, only you can read them. Session notes shared with parents are a separate column with separate policy.</p>
              <p>Admin access at Crestio is two engineers. Both are required for production database access. We log every access to a separate audit stream.</p>
            </SecuritySection>

            <SecuritySection title="Compliance" icon={<IconBalance />}>
              <p>Australian Privacy Act 1988 (we collect minimum necessary data; we honour access and deletion requests).</p>
              <p>GDPR for European customers (legitimate interest for service operation; lawful basis recorded; data export and erasure built into the product, not a support ticket).</p>
              <p>We don't sell data. We don't share with marketing partners. There are no marketing partners.</p>
            </SecuritySection>

            <SecuritySection title="Audit logs" icon={<IconEye />}>
              <p>Every file view by a parent or student writes a row to <code className="text-2xs bg-ruleSoft px-1 py-0.5 rounded">file_views</code> with the IP and user agent. Tutors see view counts and the last viewer in the file detail.</p>
              <p>Every data export is logged with the requesting user, scope, and time. Tutors can see their own organization's export history.</p>
            </SecuritySection>

            <SecuritySection title="Account deletion" icon={<IconTrash />}>
              <p>You can delete your account from the app. The 30-day grace period lets you change your mind.</p>
              <p>Before the cascade runs, we email you a full export of every byte: students, sessions, polished notes, invoices, files. ZIP archive, downloadable for 30 days.</p>
              <p>After deletion, we keep encrypted backups for 90 days for catastrophic-restore purposes. After that, the keys are destroyed and the data is gone.</p>
            </SecuritySection>

            <SecuritySection title="Incident response" icon={<IconAlert />}>
              <p>If something is wrong, we tell you fast. The status page is updated within 5 minutes of detection. Tutors with active sessions during an incident get a direct email.</p>
              <p>Found a vulnerability? Email <a href="mailto:security@crestio.ai" className="text-forest underline underline-offset-2">security@crestio.ai</a>. We respond within 24 hours.</p>
              <p>We don't run a bug bounty yet — too small. We do send a hand-written thank-you to every responsible disclosure.</p>
            </SecuritySection>

            <SecuritySection title="Vendor stack" icon={<IconStack />}>
              <p><strong className="text-ink">Supabase</strong> (hosted in <code className="text-2xs bg-ruleSoft px-1 py-0.5 rounded">ap-southeast-2</code>, Sydney) — database, storage, auth.</p>
              <p><strong className="text-ink">Stripe</strong> — payments. We never see card numbers.</p>
              <p><strong className="text-ink">Vercel</strong> — application hosting and edge.</p>
              <p><strong className="text-ink">Anthropic</strong> — the AI that polishes session notes. <a href="https://www.anthropic.com/legal/commercial-terms" rel="noopener noreferrer" target="_blank" className="text-forest underline underline-offset-2">Their commercial terms</a> mean training is opt-out and we are opted out.</p>
              <p><strong className="text-ink">Resend</strong> — email delivery to parents.</p>
            </SecuritySection>
          </div>

          <div className="mt-16 pt-10 border-t border-rule">
            <h2 className="font-display text-xl tracking-tightest text-ink mb-2">Questions we'll answer directly</h2>
            <p className="text-sm text-ink-muted leading-relaxed mb-4 max-w-prose">
              If your school district or institution has a security review questionnaire, send it. We fill them out the same week.
            </p>
            <a href="mailto:security@crestio.ai" className="btn-secondary text-sm inline-flex">
              Email security@crestio.ai
            </a>
          </div>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}

function IconKey() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M11 12L21 2"/><path d="M17 6l3 3"/></svg>;
}
function IconShield() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/></svg>;
}
function IconBalance() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18"/><path d="M3 7h18"/><path d="M6 7l-3 7a4 4 0 0 0 6 0l-3-7zM18 7l-3 7a4 4 0 0 0 6 0l-3-7z"/></svg>;
}
function IconEye() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>;
}
function IconTrash() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>;
}
function IconAlert() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.41 0z"/></svg>;
}
function IconStack() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 22 8.5 12 15 2 8.5 12 2"/><polyline points="2 15.5 12 22 22 15.5"/></svg>;
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['marketing']),
  },
});
