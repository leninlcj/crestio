import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import type { GetStaticProps } from 'next';
import MarketingNav from '../components/marketing/MarketingNav';
import MarketingFooter from '../components/marketing/MarketingFooter';
import { serverSideTranslations } from '../lib/i18nServer';

const TOOLS = ['TeachWorks', 'Wyzant', 'TutorBird', 'TutorCruncher', 'Notion', 'Spreadsheet', 'Other'];

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function Migrate() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [tool, setTool] = useState('TeachWorks');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');
    try {
      const res = await fetch('/api/migrate-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, current_tool: tool, message, kind: 'migration' }),
      });
      if (!res.ok) throw new Error('not ok');
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }

  return (
    <>
      <Head>
        <title>Switch to Crestio · Migration concierge</title>
        <meta name="description" content="Switching to Crestio is free and white-glove. Send your export, we'll move every student, session, and invoice in 24 hours." />
        <meta property="og:title" content="Switch to Crestio — we'll move you in 24 hours" />
        <meta property="og:image" content="/api/og?type=marketing&title=We'll%20move%20your%20practice%20in%2024%20hours.&subtitle=Free%20white-glove%20migration%20from%20your%20current%20tool." />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main>
          <section className="px-6 md:px-12 pt-12 md:pt-20 pb-8 max-w-3xl mx-auto">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Migration</div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tighter mb-5 leading-[1.05] text-balance">
              We'll move your practice over in 24 hours.
            </h1>
            <p className="text-base md:text-lg text-ink-muted leading-relaxed max-w-prose">
              Send us your export from your current tool. We'll set up your Crestio account with every student, every session, and every invoice already in place. Free for the first 100 practices.
            </p>
          </section>

          <section className="px-6 md:px-12 mb-12 max-w-3xl mx-auto">
            <div className="grid md:grid-cols-3 gap-4 md:gap-5">
              <Step n={1} title="Send your export">
                CSV, Excel, even a screenshot. Whatever your current tool gives you. We'll figure it out.
              </Step>
              <Step n={2} title="We move it in 24h">
                Students, sessions, invoices, parent emails. We email you when it's ready, with a checklist of anything ambiguous.
              </Step>
              <Step n={3} title="One email to parents">
                You send a single email to your parents with the new login link. We give you a template that converts at 95%+.
              </Step>
            </div>
          </section>

          <section className="px-6 md:px-12 mb-16 max-w-2xl mx-auto">
            <div className="rounded-md border border-rule bg-surface p-6 md:p-8">
              {status === 'sent' ? (
                <SentState email={email} />
              ) : (
                <form onSubmit={onSubmit} className="space-y-5">
                  <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2">
                    Tell us about your practice
                  </div>
                  <Field label="Your name" required>
                    <input
                      type="text"
                      required
                      placeholder="Sarah K."
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input"
                    />
                  </Field>
                  <Field label="Email" required>
                    <input
                      type="email"
                      required
                      placeholder="you@your-practice.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input"
                    />
                  </Field>
                  <Field label="What are you using now?">
                    <select
                      value={tool}
                      onChange={(e) => setTool(e.target.value)}
                      className="input"
                    >
                      {TOOLS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Anything we should know? (optional)">
                    <textarea
                      rows={4}
                      placeholder="Number of students, special billing arrangements, anything tricky..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="input"
                      style={{ height: 'auto', minHeight: 96 }}
                    />
                  </Field>

                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-3">
                    <button
                      type="submit"
                      disabled={status === 'sending'}
                      className="btn-primary text-sm px-6"
                    >
                      {status === 'sending' ? 'Sending…' : 'Send to Lenin'}
                    </button>
                    <span className="text-2xs text-ink-soft">
                      We reply the same day. Honest.
                    </span>
                  </div>

                  {status === 'error' && (
                    <div className="rounded border border-claret/30 bg-claret/5 px-3 py-2 text-2xs text-claret">
                      Couldn't send. Email <a href="mailto:lenin@crestio.ai" className="underline">lenin@crestio.ai</a> directly.
                    </div>
                  )}
                </form>
              )}
            </div>
          </section>

          <section className="px-6 md:px-12 pb-16 md:pb-20 max-w-3xl mx-auto text-center border-t border-rule pt-12">
            <p className="text-sm text-ink-muted leading-relaxed mb-4 max-w-prose mx-auto">
              Want to see what you're switching into first?
            </p>
            <Link href="/sandbox" className="btn-secondary text-sm px-6">
              Open the sandbox
            </Link>
          </section>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-rule bg-surface p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-forest text-cream grid place-items-center text-2xs font-display tracking-tighter">{n}</div>
        <h2 className="font-display text-base tracking-tightest text-ink m-0">{title}</h2>
      </div>
      <p className="text-sm text-ink-muted leading-relaxed">{children}</p>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1.5 font-medium">
        {label}
        {required && <span aria-hidden className="text-claret ml-0.5">*</span>}
      </div>
      {children}
    </label>
  );
}

function SentState({ email }: { email: string }) {
  return (
    <div className="text-center py-4">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-forest-soft text-forest-ink grid place-items-center" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="font-display text-xl tracking-tighter text-ink mb-2">On its way.</h2>
      <p className="text-sm text-ink-muted leading-relaxed max-w-md mx-auto">
        We'll reply to <strong className="text-ink">{email}</strong> within the day with the next steps.
      </p>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['marketing']),
  },
});
