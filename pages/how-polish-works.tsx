import Head from 'next/head';
import Link from 'next/link';
import type { GetStaticProps } from 'next';
import MarketingNav from '../components/marketing/MarketingNav';
import MarketingFooter from '../components/marketing/MarketingFooter';
import FinalCTA from '../components/marketing/FinalCTA';
import { serverSideTranslations } from '../lib/i18nServer';

export default function HowPolishWorks() {
  return (
    <>
      <Head>
        <title>How polish actually works · Crestio</title>
        <meta
          name="description"
          content="The honest version: how Crestio's note polish actually works. Anthropic Claude, your style learned over time, what it sees and doesn't see."
        />
        <meta property="og:title" content="How polish actually works · Crestio" />
        <meta
          property="og:description"
          content="The honest version: how Crestio's note polish actually works."
        />
        <meta
          property="og:image"
          content="/api/og?type=marketing&title=How%20polish%20actually%20works.&subtitle=The%20honest%20version%20%E2%80%94%20Anthropic%20Claude%2C%20your%20style%2C%20review%20before%20send."
        />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main>
          <section className="px-6 md:px-12 pt-12 md:pt-20 pb-8 max-w-3xl mx-auto">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">How it works</div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tighter leading-[1.05] text-balance mb-5">
              How polish actually works.
            </h1>
            <p className="text-base md:text-lg text-ink-muted leading-relaxed max-w-prose">
              The homepage demo is a fixed templated rewrite — it parses your text with regexes and fills a few sentence templates. The real product does something different.
            </p>
          </section>

          <section className="px-6 md:px-12 pb-12 max-w-3xl mx-auto space-y-10 md:space-y-12">
            <Block n="1" title="The model">
              <p>
                Crestio uses <strong>Anthropic Claude</strong>. Lighter sessions go to <strong>Claude Haiku</strong> (fast, cheap, plenty for a 60-word note). Anything that needs more reasoning — lesson plans, longer notes, the in-app assistant — goes to <strong>Claude Sonnet</strong>.
              </p>
              <p>
                Anthropic is SOC 2 Type II audited, and under their commercial terms your prompts and outputs are <strong>not used to train their models</strong>. We send only what's needed: the rough note, a brief description of the student (year level, subject), and the most recent few notes for that student so the new note reads continuously.
              </p>
            </Block>

            <Block n="2" title="Your voice, learned over time">
              <p>
                The first polish you ever do uses a generic warm-but-precise template — almost identical to the homepage demo. It's good enough but it isn't <em>you</em>.
              </p>
              <p>
                Every time you send a polish, Crestio quietly takes the version you actually sent (after any edits) and adds it to a small style profile for your account. After about <strong>20 sent polishes</strong>, the next polish starts using your phrases, your sentence rhythm, the specific way you describe progress and homework. Most tutors stop editing after that point.
              </p>
              <p>
                The profile lives only in your account. It isn't shared between tutors and it isn't sent to Anthropic for training.
              </p>
            </Block>

            <Block n="3" title="What it sees and doesn't see">
              <p>
                Polish receives: the rough note you wrote, the student's first name and year/subject, and a short window of recent session notes for that student.
              </p>
              <p>
                Polish does <strong>not</strong> receive: the parent's email or phone, internal tutor-only notes (a separate column with separate visibility), payment information, or any other student's data.
              </p>
            </Block>

            <Block n="4" title="Review before send">
              <p>
                The polished output is a <strong>draft</strong>, not a sent message. You see it in a preview pane with the rough version side-by-side, and you can edit any character before pressing Send. AI output can be wrong; you're the last review.
              </p>
              <p>
                There's an undo window after send — about 8 seconds. After that, the parent has the message in their inbox.
              </p>
            </Block>

            <Block n="5" title="When it gets it wrong">
              <p>
                It will, sometimes. The most common failure modes: misreading a student name as a topic, omitting a homework note that wasn't formatted as a list, or being too warm when the rough notes were straightforwardly factual.
              </p>
              <p>
                If a polish is genuinely wrong (a quality issue, not just a style preference), email <a href="mailto:lenin@crestio.ai" className="text-forest underline underline-offset-2">lenin@crestio.ai</a> with the rough note and the polished output. That's how the prompts get tuned.
              </p>
            </Block>
          </section>

          <section className="px-6 md:px-12 py-10 md:py-14 max-w-3xl mx-auto">
            <div className="rounded-md border border-rule bg-surface p-6 md:p-8">
              <h2 className="font-display text-xl tracking-tightest text-ink mb-3">
                The short version
              </h2>
              <ul className="space-y-2 text-sm text-ink-muted leading-relaxed">
                <li>· Real polish uses Anthropic Claude — Haiku for speed, Sonnet for depth.</li>
                <li>· Your voice is learned from your sent edits, in your account only.</li>
                <li>· Anthropic does not train on your prompts or outputs.</li>
                <li>· You review every polish before it sends.</li>
                <li>· The homepage demo is a regex+template approximation — fast, free, no signup.</li>
              </ul>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link href="/sandbox" className="btn-primary text-sm px-5">Try the sandbox</Link>
                <Link href="/security" className="text-sm text-forest hover:underline">Read the security page →</Link>
              </div>
            </div>
          </section>

          <FinalCTA />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}

function Block({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <article>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="font-display text-2xs uppercase tracking-widest text-ink-soft num tabular">{n.padStart(2, '0')}</span>
        <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-ink m-0 leading-tight">
          {title}
        </h2>
      </div>
      <div className="space-y-3 text-base text-ink-muted leading-relaxed max-w-prose">
        {children}
      </div>
    </article>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['marketing']),
  },
});
