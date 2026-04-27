import Head from 'next/head';
import Link from 'next/link';
import type { GetStaticPaths, GetStaticProps } from 'next';
import MarketingNav from '../../components/marketing/MarketingNav';
import MarketingFooter from '../../components/marketing/MarketingFooter';
import { CUSTOMER_STORIES, getCustomerStory, type CustomerStory } from '../../content/customer-stories';
import { serverSideTranslations } from '../../lib/i18nServer';

type Props = { story: CustomerStory };

export default function CustomerStoryPage({ story }: Props) {
  const ogTitle = story.result_one_line;
  const ogSub = `${story.name} · ${story.context}`;
  const ogUrl = `/api/og?type=customer&accent=${encodeURIComponent(story.name)}&title=${encodeURIComponent(ogTitle)}&subtitle=${encodeURIComponent(ogSub)}`;

  return (
    <>
      <Head>
        <title>{`${story.name} · Crestio`}</title>
        <meta name="description" content={`${story.result_one_line}. ${story.subject}, ${story.city}.`} />
        <meta property="og:title" content={`${story.name} · ${story.result_one_line}`} />
        <meta property="og:description" content={`${story.subject}, ${story.city}. ${story.result_one_line}.`} />
        <meta property="og:image" content={ogUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogUrl} />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main>
          <section className="px-6 md:px-12 pt-10 md:pt-16 pb-8 md:pb-10 max-w-3xl mx-auto">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">
              <Link href="/customers" className="hover:text-ink transition-colors">Customers</Link>
              <span aria-hidden> / </span>
              <span>{story.name}</span>
            </div>
            <div className="flex items-start gap-4 mb-6">
              <Avatar name={story.name} />
              <div className="min-w-0">
                <h1 className="font-display text-3xl md:text-4xl tracking-tighter leading-tight m-0 mb-1">
                  {story.name}
                </h1>
                <div className="text-sm text-ink-muted">{story.practice} · {story.city}</div>
                <div className="text-2xs text-ink-soft mt-0.5">{story.subject}</div>
              </div>
            </div>
            <p className="font-display text-2xl md:text-3xl tracking-tighter text-ink leading-tight text-balance mb-2">
              {story.result_one_line}.
            </p>
          </section>

          <section className="px-6 md:px-12 mb-10 max-w-3xl mx-auto">
            <div className="grid grid-cols-3 gap-3 md:gap-5">
              {story.stats.map((s, i) => (
                <div key={i} className="rounded-md border border-rule bg-surface p-4 md:p-5">
                  <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1.5">{s.label}</div>
                  <div className="font-display text-2xl md:text-3xl tracking-tightest text-ink num tabular leading-none">
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="px-6 md:px-12 mb-12 max-w-2xl mx-auto">
            <SubHead>The problem</SubHead>
            <Prose text={story.problem} />

            <SubHead>What changed</SubHead>
            <Prose text={story.solution} />

            <blockquote className="border-l-2 border-forest/30 pl-5 my-10">
              <p className="font-display italic text-xl md:text-2xl tracking-tight text-ink leading-snug text-balance">
                "{story.quote}"
              </p>
              <footer className="text-2xs uppercase tracking-widest text-ink-soft mt-3">
                — {story.name}
              </footer>
            </blockquote>

            <SubHead>The numbers</SubHead>
            <Prose text={story.results} />

            {!story.is_real && (
              <div className="mt-10 rounded-md border border-amber/30 bg-amber-soft/30 px-4 py-3 text-2xs text-amber-ink leading-relaxed">
                <strong>Composite story.</strong> This piece is composed from feedback across multiple early Crestio practices. Real customer stories — with first names and verifiable numbers — go up as tutors give the OK.
              </div>
            )}
          </section>

          <section className="px-6 md:px-12 py-16 md:py-20 max-w-3xl mx-auto text-center border-t border-rule">
            <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-ink mb-3 text-balance">
              Your week could look like {story.name.split(' ')[0]}'s.
            </h2>
            <p className="text-sm text-ink-muted mb-6 max-w-prose mx-auto">
              7-day free trial. No card needed. Cancel from the app, no email required.
            </p>
            <Link href="/auth/signup" className="btn-primary text-sm px-6">
              Start free trial
            </Link>
          </section>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-forest-soft text-forest-ink grid place-items-center font-display text-xl md:text-2xl tracking-tightest shrink-0">
      {initials}
    </div>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-lg tracking-tightest text-ink mt-8 mb-3 first:mt-0">{children}</h2>
  );
}

function Prose({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/);
  return (
    <div className="text-base text-ink-muted leading-relaxed space-y-4">
      {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
    </div>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: CUSTOMER_STORIES.map((s) => ({ params: { slug: s.slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async ({ params, locale }) => {
  const slug = String(params?.slug ?? '');
  const story = getCustomerStory(slug);
  if (!story) return { notFound: true };
  return {
    props: {
      story,
      ...serverSideTranslations(locale, ['marketing']),
    },
  };
};
