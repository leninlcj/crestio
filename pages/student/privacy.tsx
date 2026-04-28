import Link from 'next/link';
import Head from 'next/head';

export default function StudentPrivacy() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <Head>
        <title>Privacy for students</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="max-w-[640px] mx-auto px-6 py-12">
        <Link href="/student" className="text-sm text-ink-muted">← Back</Link>
        <h1 className="font-display text-3xl tracking-tightest mt-4">Privacy for students</h1>
        <p className="text-sm text-ink-muted mt-2">Plain language. No legalese.</p>

        <div className="mt-8 space-y-6 text-base leading-relaxed">
          <section>
            <h2 className="font-display text-xl mb-2">Who keeps your information</h2>
            <p>
              Your tutor's practice keeps your information. Crestio is the software they use, but the
              data is theirs — they decide what to do with it. We never sell anything about you.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl mb-2">What your parent can see</h2>
            <p>
              Your parent can see everything you can see (your sessions, notes, homework, files), plus
              your invoices and account settings. This is on purpose: it means an adult always has eyes
              on what's happening.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl mb-2">What we don't do</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>We never send you ads.</li>
              <li>We never share your information with anyone outside your tutor's practice.</li>
              <li>We never use your information to train models.</li>
              <li>We never connect you to other students. There's no friend list, no leaderboard, no chat.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl mb-2">When you turn 18</h2>
            <p>
              On your 18th birthday, we'll email you. From then on, you control your account. You can
              keep using it, take ownership of all your data, or delete it.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl mb-2">If anything feels wrong</h2>
            <p>
              Tell your parent. Tell your tutor. Or email{' '}
              <a href="mailto:support@crestio.app" className="underline">support@crestio.app</a>{' '}
              directly. We'll read it.
            </p>
          </section>
        </div>

        <p className="mt-12 text-sm text-ink-muted">
          The full <Link href="/privacy" className="underline">privacy policy</Link> covers everything in more detail. This page covers the bits that matter most to you.
        </p>
      </main>
    </div>
  );
}
