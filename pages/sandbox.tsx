import Head from 'next/head';
import dynamic from 'next/dynamic';
import type { GetStaticProps } from 'next';
import SandboxLayout from '../components/sandbox/SandboxLayout';
import { serverSideTranslations } from '../lib/i18nServer';

// The sandbox dashboard is a separate bundle (lazy-loaded) so it doesn't bloat
// the homepage. The interactive bits use local React state — no API calls.
const SandboxDashboard = dynamic(() => import('../components/sandbox/SandboxDashboard'), {
  ssr: false,
  loading: () => <SandboxLoadingSkeleton />,
});

export default function Sandbox() {
  return (
    <>
      <Head>
        <title>Sandbox · Try Crestio without signing up</title>
        <meta name="description" content="A real working version of Crestio with fake data. Click around — nothing saves. No signup needed." />
        <meta property="og:title" content="Crestio sandbox" />
        <meta property="og:description" content="A real working version of the app. Click around. No signup." />
        <meta property="og:image" content="/api/og?type=marketing&title=Click%20around%20before%20you%20sign%20up.&subtitle=A%20real%20working%20version%20of%20Crestio%2C%20pre-populated%20with%20fake%20data." />
        <meta name="robots" content="noindex" />
      </Head>

      <SandboxLayout page="home">
        <SandboxDashboard />
      </SandboxLayout>
    </>
  );
}

function SandboxLoadingSkeleton() {
  return (
    <div className="px-4 md:px-8 pt-8 pb-12 max-w-[1200px] mx-auto">
      <div className="skeleton-shimmer h-8 w-72 mb-3" />
      <div className="skeleton-shimmer h-4 w-48 mb-8" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card p-5">
            <div className="skeleton-shimmer h-3 w-16 mb-3" />
            <div className="skeleton-shimmer h-9 w-20 mb-3" />
            <div className="skeleton-shimmer h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['marketing', 'common']),
  },
});
