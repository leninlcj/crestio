import Link from 'next/link';
import Head from 'next/head';

export default function StudentTerms() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <Head>
        <title>Terms for students</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="max-w-[640px] mx-auto px-6 py-12">
        <Link href="/student" className="text-sm text-ink-muted">← Back</Link>
        <h1 className="font-display text-3xl tracking-tightest mt-4">Terms for students</h1>
        <p className="text-sm text-ink-muted mt-2">Plain language. The basics.</p>

        <div className="mt-8 space-y-6 text-base leading-relaxed">
          <section>
            <h2 className="font-display text-xl mb-2">Who can use this portal</h2>
            <p>
              Your tutor invites you to this portal. You can sign up only if your tutor has invited you.
              If you're under 16, your parent must approve before your account is created.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl mb-2">What you can do here</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>See your sessions and tutoring schedule.</li>
              <li>Read notes from your tutor after each lesson.</li>
              <li>Mark homework done.</li>
              <li>Open files your tutor shares with you.</li>
            </ul>
          </section>
          <section>
            <h2 className="font-display text-xl mb-2">What's not allowed</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Sharing your sign-in with anyone else.</li>
              <li>Trying to download or screenshot files your tutor has marked private.</li>
              <li>Trying to access another student's information.</li>
            </ul>
          </section>
          <section>
            <h2 className="font-display text-xl mb-2">Changes</h2>
            <p>
              If we change these terms, we'll email you before they take effect.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl mb-2">If anything feels wrong</h2>
            <p>
              Tell your parent. Tell your tutor. Or email{' '}
              <a href="mailto:support@crestio.app" className="underline">support@crestio.app</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
