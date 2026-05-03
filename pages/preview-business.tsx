import { useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { PLAN_CATALOGUE, type BillingInterval } from '../lib/plans';

const planOrder = ['solo', 'team', 'growth'] as const;

const competitorInsights = [
  'TutorCruncher and Teachworks lead with broad company operations: scheduling, CRM, billing, payroll, and reporting.',
  'Newer AI tutoring tools are moving toward retention: parents get updates, tutors save admin time, and invoices follow the lesson.',
  'Solo tutors still compare everything to Google Calendar, notes, WhatsApp, and Stripe links, so the first screen must prove immediate admin relief.',
];

const workflow = [
  {
    step: '01',
    title: 'Capture the lesson',
    body: 'Log the student, time, topic, homework, private notes, and billable status while the session is still fresh.',
    outcome: 'A complete session record in under a minute.',
  },
  {
    step: '02',
    title: 'Polish the parent update',
    body: 'Turn rough tutor shorthand into a warm, professional summary while keeping private tutor notes private.',
    outcome: 'Parents see progress without reading your raw notes.',
  },
  {
    step: '03',
    title: 'Share the right version',
    body: 'Release updates, homework, files, and milestones into a parent portal that builds trust between sessions.',
    outcome: 'Parents stop wondering what happened this week.',
  },
  {
    step: '04',
    title: 'Get paid cleanly',
    body: 'Completed lessons become invoice line items and Stripe payment links, so billing follows the teaching workflow.',
    outcome: 'No spreadsheet rebuild at the end of the month.',
  },
];

const proofCards = [
  {
    title: 'Founder-led, not faceless',
    body: 'Crestio should keep saying the truth: it is built by Lenin, a working tutor, with visible product updates instead of fake team claims.',
  },
  {
    title: 'Tutor-first privacy',
    body: 'Private notes stay internal. Parents only see released summaries, invoices, homework, and files intended for them.',
  },
  {
    title: 'A narrow first wedge',
    body: 'The homepage should sell one memorable loop: finish a lesson, send the parent update, track homework, and invoice.',
  },
  {
    title: 'Clear value math',
    body: 'At $24 AUD/month, Solo pays for itself if it saves one short admin block or helps retain one parent relationship.',
  },
];

const faqs = [
  {
    question: 'Is this replacing the current homepage?',
    answer: 'No. This route is a noindex local preview so you can inspect the new direction before choosing what to merge into the public site.',
  },
  {
    question: 'Why focus the message this tightly?',
    answer: 'Broad all-in-one tutoring software already exists. Crestio can stand out by owning the high-frequency moment after every lesson.',
  },
  {
    question: 'What happens after signup?',
    answer: 'The signup page now reads the selected plan query locally and repeats the plan, trial, and price before account creation.',
  },
  {
    question: 'What should be published later?',
    answer: 'After you approve the preview, the next publishable step is to move the strongest sections into the real homepage and localized marketing copy.',
  },
];

export default function BusinessPreview() {
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const annualSavings = useMemo(() => {
    const solo = PLAN_CATALOGUE.solo;
    return solo.prices.monthly.dollars * 12 - solo.prices.annual.dollars;
  }, []);

  return (
    <>
      <Head>
        <title>Crestio preview | Session-to-parent-update operating system</title>
        <meta
          name="description"
          content="A local noindex preview of a sharper Crestio business homepage before publishing."
        />
        <meta name="robots" content="noindex,nofollow,noarchive" />
      </Head>

      <main className="min-h-screen bg-cream text-ink">
        <div className="border-b border-rule bg-ruleSoft px-4 py-2 text-center text-xs text-ink-muted">
          Local preview only. Not published, indexed, or wired to replace the current homepage.
        </div>

        <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
          <Link href="/" className="font-display text-2xl tracking-tighter">
            crest<span className="italic text-forest">io</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-ink-muted md:flex" aria-label="Preview sections">
            <a href="#workflow" className="transition-colors hover:text-ink">Workflow</a>
            <a href="#proof" className="transition-colors hover:text-ink">Trust</a>
            <a href="#pricing" className="transition-colors hover:text-ink">Pricing</a>
            <a href="#launch" className="transition-colors hover:text-ink">Launch notes</a>
          </nav>
          <Link href="/auth/signup?plan=solo&interval=monthly" className="btn-primary">
            Start Solo
          </Link>
        </header>

        <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-14 pt-8 md:grid-cols-[0.9fr_1.1fr] md:px-8 md:pb-20 md:pt-14">
          <div className="flex min-w-0 flex-col justify-center">
            <p className="mb-5 max-w-fit rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted">
              Built by a Sydney tutor for tutors who do not want Sunday admin
            </p>
            <h1 className="max-w-2xl text-balance font-display text-5xl font-semibold tracking-tighter text-ink md:text-6xl">
              Finish the lesson. Send the update. Get paid.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-ink-muted md:text-lg">
              Crestio turns rough session notes into parent-ready updates, keeps homework and files tidy, and turns completed lessons into invoices without stitching together five tools.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/auth/signup?plan=solo&interval=monthly" className="btn-primary h-12 px-5">
                Start Solo free for 7 days
              </Link>
              <Link href="/sandbox" className="btn-secondary h-12 px-5">
                Try the sandbox
              </Link>
            </div>
            <div className="mt-5 grid gap-3 text-sm text-ink-muted sm:grid-cols-3">
              <Metric value="5 min" label="target post-session admin" />
              <Metric value="$24" label="AUD/month for Solo" />
              <Metric value="$48" label={`annual Solo saving`} />
            </div>
            <p className="mt-4 text-xs text-ink-soft">
              No card required for signup. Cancel before billing starts. Parent-facing data is released by the tutor.
            </p>
          </div>

          <ProductStory />
        </section>

        <section className="border-y border-rule bg-surface">
          <div className="mx-auto grid max-w-6xl gap-0 px-5 md:grid-cols-3 md:px-8">
            {competitorInsights.map((insight, index) => (
              <div key={insight} className="border-b border-rule py-6 md:border-b-0 md:border-r md:px-6 md:last:border-r-0">
                <div className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Market read {index + 1}</div>
                <p className="mt-3 text-sm leading-6 text-ink-muted">{insight}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="workflow" className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-forest">The wedge</p>
            <h2 className="mt-4 text-balance font-display text-4xl font-semibold tracking-tighter md:text-5xl">
              Own the workflow that happens after every single lesson.
            </h2>
            <p className="mt-4 text-sm leading-7 text-ink-muted">
              Competitors can be broader. Crestio should be more memorable: the place a tutor goes immediately after teaching.
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {workflow.map((item) => (
              <article key={item.step} className="card p-5">
                <div className="text-xs font-semibold uppercase tracking-widest text-forest">{item.step}</div>
                <h3 className="mt-4 text-xl font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-ink-muted">{item.body}</p>
                <p className="mt-5 border-t border-rule pt-4 text-xs font-medium text-ink">{item.outcome}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="proof" className="bg-forest-ink text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[0.85fr_1.15fr] md:px-8 md:py-24">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Trust</p>
              <h2 className="mt-4 text-balance font-display text-4xl font-semibold tracking-tighter text-white md:text-5xl">
                Early-stage trust should feel honest, specific, and calm.
              </h2>
              <p className="mt-4 text-sm leading-7 text-white/70">
                No invented testimonials. No inflated team language. Show the product, show the founder, show the privacy boundaries, and make the promise small enough to believe.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {proofCards.map((card) => (
                <article key={card.title} className="rounded-md border border-white/12 bg-white/[0.04] p-5">
                  <h3 className="font-sans text-base font-semibold text-white">{card.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/70">{card.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-16 md:grid-cols-[1fr_0.9fr] md:px-8 md:py-24">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-forest">Plan-aware conversion</p>
            <h2 className="mt-4 text-balance font-display text-4xl font-semibold tracking-tighter md:text-5xl">
              The signup page now repeats the plan users selected.
            </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-ink-muted">
              This preview does not merely draw a fake signup card. Locally, pricing clicks now carry the selected plan and billing interval into signup before the user enters an email.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/auth/signup?plan=solo&interval=monthly" className="btn-secondary">Solo signup</Link>
              <Link href="/auth/signup?plan=team&interval=annual" className="btn-secondary">Team annual signup</Link>
            </div>
          </div>
          <PlanAwareCard />
        </section>

        <section id="pricing" className="border-y border-rule bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-forest">Pricing</p>
                <h2 className="mt-4 text-balance font-display text-4xl font-semibold tracking-tighter md:text-5xl">
                  Simple enough to choose in one minute.
                </h2>
                <p className="mt-4 text-sm leading-7 text-ink-muted">
                  Monthly keeps the first yes easy. Annual gives a clear saving for tutors already committed to using Crestio every week.
                </p>
              </div>
              <div className="inline-flex w-fit rounded-md border border-rule bg-cream p-1" aria-label="Billing interval">
                {(['monthly', 'annual'] as BillingInterval[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setInterval(option)}
                    className={`h-9 rounded-sm px-4 text-sm font-medium transition-colors whitespace-nowrap ${
                      interval === option ? 'bg-forest text-white' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {option === 'monthly' ? 'Monthly' : `Annual, save $${annualSavings}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {planOrder.map((tier) => {
                const plan = PLAN_CATALOGUE[tier];
                const price = plan.prices[interval];
                const featured = tier === 'team';
                const href = plan.isContactSales
                  ? 'mailto:support@crestio.ai?subject=Growth%20plan'
                  : `/auth/signup?plan=${tier}&interval=${interval}`;

                return (
                  <article key={tier} className={`card p-6 ${featured ? 'border-forest' : ''}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-semibold tracking-tight">{plan.label}</h3>
                        <p className="mt-2 text-sm leading-6 text-ink-muted">{plan.pitch}</p>
                      </div>
                      <span className="pill-forest">{plan.trialDays ? `${plan.trialDays}-day trial` : 'Contact'}</span>
                    </div>
                    <div className="mt-6 flex items-end gap-2">
                      <span className="font-display text-5xl font-semibold tracking-tighter">${price.dollars}</span>
                      <span className="pb-1 text-sm text-ink-muted">AUD{price.periodLabel}</span>
                    </div>
                    <ul className="mt-6 space-y-2 text-sm text-ink-muted">
                      {plan.features.slice(0, 5).map((feature) => (
                        <li key={feature} className="flex gap-2">
                          <span aria-hidden="true" className="text-forest">✓</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href={href} className={`mt-6 w-full ${featured ? 'btn-primary' : 'btn-secondary'}`}>
                      {plan.isContactSales ? 'Contact for Growth' : `Start ${plan.label}`}
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="launch" className="mx-auto grid max-w-6xl gap-8 px-5 py-16 md:grid-cols-[0.8fr_1.2fr] md:px-8 md:py-24">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-forest">Launch notes</p>
            <h2 className="mt-4 text-balance font-display text-4xl font-semibold tracking-tighter md:text-5xl">
              The preview is deliberately undoable.
            </h2>
            <p className="mt-4 text-sm leading-7 text-ink-muted">
              It is one isolated route plus the plan-aware signup improvement. Nothing has been deployed, and the preview can be removed without disturbing the existing public pages.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {faqs.map((faq) => (
              <article key={faq.question} className="card p-5">
                <h3 className="font-sans text-base font-semibold">{faq.question}</h3>
                <p className="mt-3 text-sm leading-6 text-ink-muted">{faq.answer}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 rounded-md border border-rule bg-surface px-3 py-3">
      <div className="num text-lg font-semibold text-ink">{value}</div>
      <div className="mt-1 text-xs leading-5 text-ink-muted">{label}</div>
    </div>
  );
}

function ProductStory() {
  return (
    <div className="card bg-surface p-3 shadow-lift">
      <div className="rounded-md border border-rule bg-cream p-4">
        <div className="flex flex-col gap-4 border-b border-rule pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Today, 4:00 PM</div>
            <h2 className="mt-1 font-sans text-xl font-semibold tracking-tight">Jesper · Year 8 Maths</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="pill-amber">ready to polish</span>
            <span className="pill-forest">billable</span>
          </div>
        </div>

        <div className="grid gap-3 pt-4 md:grid-cols-2">
          <Panel eyebrow="Private tutor notes">
            Fractions messy at first. Slowed down with number lines. Got equivalent fractions by end. Homework: textbook 4B, q1-8. Mention confidence improved.
          </Panel>
          <Panel eyebrow="Parent update">
            Jesper made good progress with equivalent fractions today. We slowed the process down, used number lines to make the idea visual, and by the end he was choosing common denominators with more confidence.
          </Panel>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <StatusTile title="Homework" body="Exercise 4B, q1-8" />
          <StatusTile title="Portal" body="Ready for Priya" />
          <StatusTile title="Invoice" body="$75 line item" />
        </div>
      </div>
    </div>
  );
}

function Panel({ eyebrow, children }: { eyebrow: string; children: string }) {
  return (
    <div className="min-h-[190px] rounded-md border border-rule bg-surface p-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-ink-soft">{eyebrow}</div>
      <p className="mt-3 text-sm leading-6 text-ink-muted">{children}</p>
    </div>
  );
}

function StatusTile({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-[76px] rounded-md border border-rule bg-surface p-3">
      <div className="text-xs font-semibold uppercase tracking-widest text-ink-soft">{title}</div>
      <div className="mt-2 text-sm font-medium text-ink">{body}</div>
    </div>
  );
}

function PlanAwareCard() {
  return (
    <div className="card p-6 shadow-lift">
      <div className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Create account</div>
      <h3 className="mt-3 font-display text-3xl font-semibold tracking-tighter">Starting Solo</h3>
      <p className="mt-2 text-sm leading-6 text-ink-muted">
        7-day free trial, then $24 AUD/month. No card required for account creation.
      </p>
      <div className="mt-5 space-y-3">
        <div className="input flex items-center text-ink-soft">Email</div>
        <div className="input flex items-center text-ink-soft">Password</div>
        <div className="btn-primary h-11 w-full">Create account and start trial</div>
      </div>
      <p className="mt-4 text-xs leading-5 text-ink-soft">
        This is now backed by the real signup page query handling in the local app.
      </p>
    </div>
  );
}
