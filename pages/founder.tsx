import Head from 'next/head';
import type { GetStaticProps } from 'next';
import MarketingNav from '../components/marketing/MarketingNav';
import MarketingFooter from '../components/marketing/MarketingFooter';
import FounderUpdate from '../components/marketing/FounderUpdate';
import { loadFounderNotes, type FounderNote } from '../lib/founderNotes';
import { serverSideTranslations } from '../lib/i18nServer';

type Props = { notes: FounderNote[] };

export default function FounderPage({ notes }: Props) {
  return (
    <>
      <Head>
        <title>Founder updates · Crestio</title>
        <meta name="description" content="Monthly notes from Lenin, founder of Crestio. Honest, peer-to-peer, not promotional." />
        <meta property="og:title" content="Founder updates · Crestio" />
        <meta property="og:image" content="/api/og?type=marketing&title=From%20the%20founder&subtitle=Monthly%20notes%20on%20building%20Crestio." />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main>
          <section className="px-6 md:px-12 pt-12 md:pt-20 pb-8 max-w-3xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
              <FounderAvatar />
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-soft mb-0.5">Founder</div>
                <div className="font-display text-lg tracking-tightest text-ink">Lenin</div>
              </div>
            </div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tighter mb-4 leading-[1.05] text-balance">
              From the founder.
            </h1>
            <p className="text-base text-ink-muted leading-relaxed max-w-prose">
              Monthly notes on what's working, what's not, and what's next. No promotional copy. Reply directly: <a href="mailto:lenin@crestio.ai" className="text-forest underline underline-offset-2">lenin@crestio.ai</a>.
            </p>
          </section>

          <section className="px-6 md:px-12 pb-16 md:pb-24 max-w-3xl mx-auto">
            {notes.length === 0 ? (
              <div className="rounded-md border border-rule bg-surface p-6 text-sm text-ink-muted">
                The first update is in flight.
              </div>
            ) : (
              <div className="border-t border-rule pt-10 md:pt-14">
                {notes.map((note) => (
                  <FounderUpdate key={note.date} note={note} variant="page" />
                ))}
              </div>
            )}
          </section>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}

function FounderAvatar() {
  // TODO: replace with founder photo at /public/marketing/lenin-founder.jpg
  // when available. Until then, render initial-only avatar.
  return (
    <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-forest-soft text-forest-ink grid place-items-center font-display text-xl md:text-2xl tracking-tightest shrink-0" aria-hidden>
      L
    </div>
  );
}

export const getStaticProps: GetStaticProps<Props> = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['marketing']),
    notes: loadFounderNotes(),
  },
  revalidate: 3600,
});
