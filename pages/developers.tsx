import Head from 'next/head';
import { useState } from 'react';
import type { GetStaticProps } from 'next';
import MarketingNav from '../components/marketing/MarketingNav';
import MarketingFooter from '../components/marketing/MarketingFooter';
import { serverSideTranslations } from '../lib/i18nServer';

export default function Developers() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    try {
      await fetch('/api/migrate-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'api_waitlist', email, message: 'Notify me when the API ships.' }),
      });
    } catch { /* swallow */ }
    setSubmitted(true);
  }

  return (
    <>
      <Head>
        <title>Developers · Crestio</title>
        <meta name="description" content="Crestio API — coming soon. REST endpoints for sessions, students, invoices, and webhooks." />
        <meta property="og:title" content="Crestio for developers" />
        <meta property="og:image" content="/api/og?type=marketing&title=Crestio%20API&subtitle=Coming%20soon%20%E2%80%94%20sessions%2C%20students%2C%20invoices%2C%20webhooks." />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main className="px-6 md:px-12 py-12 md:py-20 max-w-3xl mx-auto">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Developers</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter mb-4 leading-[1.05] text-balance">
            Crestio API — coming soon.
          </h1>
          <p className="text-base text-ink-muted leading-relaxed mb-10 max-w-prose">
            REST endpoints for everything in the app, plus webhooks for the events you actually care about. Built for tutors who want to wire Crestio into their existing tools — Zapier, Make, custom dashboards. Targeting Q4 2026.
          </p>

          <div className="rounded-md border border-rule bg-surface p-5 md:p-6 mb-12">
            {submitted ? (
              <div className="text-sm text-ink">
                Thanks. We'll email <strong>{email}</strong> when the API ships.
              </div>
            ) : (
              <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3">
                <label className="sr-only" htmlFor="api-email">Email</label>
                <input
                  id="api-email"
                  type="email"
                  required
                  placeholder="you@your-domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input flex-1"
                />
                <button type="submit" className="btn-primary text-sm whitespace-nowrap">
                  Notify me
                </button>
              </form>
            )}
          </div>

          <h2 className="font-display text-xl tracking-tightest text-ink mb-4">What it'll look like</h2>

          <CodeBlock label="GET /v1/sessions" code={SAMPLE_SESSIONS} />
          <CodeBlock label="POST /v1/students" code={SAMPLE_STUDENTS} />
          <CodeBlock label="POST /v1/invoices/:id/send" code={SAMPLE_INVOICE} />

          <p className="text-2xs text-ink-soft leading-relaxed mt-8 max-w-prose">
            Endpoints, payloads, and authentication may change before launch. The shape above is the current draft.
          </p>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="mb-5 rounded-md border border-rule overflow-hidden bg-ink/[0.02]">
      <div className="px-4 py-2 border-b border-rule bg-cream flex items-center justify-between">
        <code className="text-2xs font-mono text-ink-muted">{label}</code>
        <span className="text-2xs uppercase tracking-widest text-ink-soft">draft</span>
      </div>
      <pre className="p-4 text-xs font-mono text-ink overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const SAMPLE_SESSIONS = `curl https://api.crestio.ai/v1/sessions \\
  -H "Authorization: Bearer ck_live_..."

{
  "data": [
    {
      "id": "ses_01H...",
      "student_id": "stu_01H...",
      "scheduled_at": "2026-04-28T16:00:00+10:00",
      "duration_minutes": 60,
      "subject": "HSC English",
      "status": "completed",
      "notes_internal": "...",
      "notes_parent_facing": "..."
    }
  ],
  "has_more": false
}`;

const SAMPLE_STUDENTS = `curl -X POST https://api.crestio.ai/v1/students \\
  -H "Authorization: Bearer ck_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Hector Patel",
    "year_level": "Year 11",
    "subjects": ["HSC English"],
    "parent_email": "priya@example.com",
    "hourly_rate_cents": 8500
  }'`;

const SAMPLE_INVOICE = `curl -X POST https://api.crestio.ai/v1/invoices/inv_01H.../send \\
  -H "Authorization: Bearer ck_live_..."

{
  "id": "inv_01H...",
  "status": "sent",
  "sent_at": "2026-04-28T17:32:00Z",
  "payment_link_url": "https://buy.stripe.com/..."
}`;

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['marketing']),
  },
});
