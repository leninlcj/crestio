import Link from 'next/link';
import Head from 'next/head';

// Public page (no auth) — students can reach this even when signed out, e.g.
// from the bottom of the help page.

export default function StudentSafety() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <Head>
        <title>If something feels wrong</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="max-w-[640px] mx-auto px-6 py-12">
        <Link href="/student/help" className="text-sm text-ink-muted">← Back</Link>
        <h1 className="font-display text-3xl tracking-tightest mt-4">If something feels wrong</h1>
        <p className="text-base text-ink leading-relaxed mt-4">
          Your tutoring should feel safe. If anything in your sessions or in this portal makes you uncomfortable, you can:
        </p>
        <ul className="mt-4 space-y-3 text-base text-ink leading-relaxed">
          <li>
            <strong>Tell your parent.</strong> They can see everything you can see, plus a few things you can't (like your invoices and account settings). They can step in.
          </li>
          <li>
            <strong>Tell another adult you trust.</strong> A teacher, family member, or friend's parent.
          </li>
          <li>
            <strong>Email Crestio support directly.</strong>{' '}
            <a href="mailto:support@crestio.app" className="underline">support@crestio.app</a>.
            Tell us what happened. We'll read it, take it seriously, and write back.
          </li>
        </ul>
        <p className="mt-8 text-sm text-ink-muted">
          You can also read our{' '}
          <Link href="/student/privacy" className="underline">privacy notice for students</Link>
          . It's short and plain-language.
        </p>
      </main>
    </div>
  );
}
