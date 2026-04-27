import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import MarketingNav from '../components/marketing/MarketingNav';
import MarketingFooter from '../components/marketing/MarketingFooter';
import ROICalculator from '../components/marketing/ROICalculator';
import { serverSideTranslations } from '../lib/i18nServer';

type Props = {
  initialStudents: number;
  initialHours: number;
  initialRate: number;
  initialCurrency: string;
};

export default function ROI(props: Props) {
  return (
    <>
      <Head>
        <title>What your Sunday actually costs · Crestio</title>
        <meta name="description" content="Calculate the time and money you'd save by switching tutoring admin to Crestio." />
        <meta property="og:title" content="What your Sunday actually costs" />
        <meta property="og:description" content="Hours saved, money recovered. Drag the sliders." />
        <meta property="og:image" content="/api/og?type=marketing&title=What%20your%20Sunday%20actually%20costs.&subtitle=Hours%20saved%2C%20money%20recovered.%20Drag%20the%20sliders." />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main>
          <section className="px-6 md:px-12 pt-12 md:pt-16 pb-4 max-w-3xl mx-auto">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">ROI</div>
            <h1 className="font-display text-3xl md:text-4xl tracking-tighter mb-4 leading-[1.05] text-balance">
              What does your Sunday actually cost?
            </h1>
            <p className="text-base text-ink-muted leading-relaxed max-w-prose">
              Adjust the sliders to your real practice. The numbers update live. Share the link to send these numbers to a friend or your accountant.
            </p>
          </section>

          <ROICalculator
            initialStudents={props.initialStudents}
            initialHours={props.initialHours}
            initialRate={props.initialRate}
            initialCurrency={props.initialCurrency as any}
          />

          <section className="px-6 md:px-12 pb-16 md:pb-24 max-w-3xl mx-auto text-center border-t border-rule pt-12">
            <h2 className="font-display text-xl md:text-2xl tracking-tighter text-ink mb-3 text-balance">
              See the product behind the numbers.
            </h2>
            <p className="text-sm text-ink-muted mb-6 max-w-prose mx-auto">
              The sandbox is a real working version of the app — not a video. Click around. No signup needed.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/sandbox" className="btn-primary text-sm px-6">Open sandbox</Link>
              <Link href="/pricing" className="btn-secondary text-sm px-6">See pricing</Link>
            </div>
          </section>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}

function parseNum(v: string | string[] | undefined, fallback: number, min: number, max: number): number {
  if (Array.isArray(v)) v = v[0];
  if (!v) return fallback;
  const n = parseFloat(v);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const VALID_CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'CAD', 'INR', 'BRL', 'IDR', 'MXN', 'JPY', 'SGD', 'HKD'];

export const getServerSideProps: GetServerSideProps<Props> = async ({ query, locale }) => {
  const currencyRaw = Array.isArray(query.currency) ? query.currency[0] : query.currency;
  const currency = currencyRaw && VALID_CURRENCIES.includes(currencyRaw.toUpperCase()) ? currencyRaw.toUpperCase() : 'AUD';

  return {
    props: {
      initialStudents: parseNum(query.students, 8, 1, 50),
      initialHours: parseNum(query.hours, 6, 0, 20),
      initialRate: parseNum(query.rate, 60, 20, 300),
      initialCurrency: currency,
      ...serverSideTranslations(locale, ['marketing']),
    },
  };
};
