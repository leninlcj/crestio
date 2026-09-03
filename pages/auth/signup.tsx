import Link from 'next/link';
import Head from 'next/head';
import { AGENCY } from '../../lib/agency';

// Public signup is closed. Crestio runs as an agency: tutors join by
// invitation (/tutor/accept), parents by invitation (/parent/accept), and
// students through their parent. Anyone landing here is pointed to the
// right door.

export default function SignUpClosed() {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Head>
        <title>Sign up · {AGENCY.name}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
        <Link href="/" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
        <Link href="/auth/signin" className="text-sm text-ink-muted hover:text-ink">Sign in</Link>
      </nav>
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Accounts are by invitation</div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tighter text-ink text-balance mb-4">There is no public sign-up.</h1>
          <p className="text-sm text-ink-muted leading-relaxed mb-8">
            Crestio accounts are created when you join us. Tutors receive an invitation after their application is accepted; parents receive one when their child is matched with a tutor.
          </p>
          <div className="space-y-3">
            <Link href="/enquire" className="card p-4 block hover:bg-ruleSoft/40 transition-colors">
              <div className="text-sm font-medium text-ink">Looking for a tutor?</div>
              <div className="text-xs text-ink-muted mt-0.5">Book a free consultation and we will match your child with a tutor.</div>
            </Link>
            <Link href="/tutors/apply" className="card p-4 block hover:bg-ruleSoft/40 transition-colors">
              <div className="text-sm font-medium text-ink">Want to tutor with us?</div>
              <div className="text-xs text-ink-muted mt-0.5">Apply in five minutes. We read every application personally.</div>
            </Link>
            <Link href="/auth/signin" className="card p-4 block hover:bg-ruleSoft/40 transition-colors">
              <div className="text-sm font-medium text-ink">Already have an account?</div>
              <div className="text-xs text-ink-muted mt-0.5">Tutors sign in here; parents sign in at <span className="text-forest">/parent/signin</span>.</div>
            </Link>
          </div>
          <p className="mt-8 text-2xs text-ink-soft">
            Expecting an invitation that has not arrived? Email <a className="underline underline-offset-2" href={`mailto:${AGENCY.email}`}>{AGENCY.email}</a>.
          </p>
        </div>
      </main>
    </div>
  );
}
