import type { AppProps } from 'next/app';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { Analytics } from '@vercel/analytics/react';
import { RouteProgressBar } from '../components/design/RouteProgressBar';
import type { SsrI18n } from '../components/AppProviders';
import '../styles/globals.css';

// The public site (crestio.ai) renders with no app context at all, so its
// pages ship none of the app's providers, keyboard handlers or panels.
// Everything else (the app, the portals, sign-in, payment pages) gets the
// full provider tree from components/AppProviders.tsx, loaded as its own chunk.

const AppProviders = dynamic(() => import('../components/AppProviders').then((m) => m.AppProviders), { ssr: true });

const PUBLIC_PATHS = new Set([
  '/', '/how-it-works', '/maths-tutoring', '/physics-tutoring', '/pricing', '/tutors', '/tutors/apply', '/tutors/agreement',
  '/enquire', '/faq', '/about', '/contact', '/child-safe', '/report', '/privacy', '/terms', '/cookies', '/es',
  '/tutoring', '/tutoring/[suburb]', '/programs', '/tutors/handbook', '/review/[token]', '/auth/signup', '/404', '/500',
]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const ssr = (pageProps as { _i18n?: SsrI18n })._i18n;
  const page = <Component {...pageProps} />;

  return (
    <>
      <Head>
        <title>Crestio Tutoring</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta
          name="description"
          content="One-on-one maths and physics tutoring in Sydney and online, Years 7 to 12 and the HSC. Every tutor interviewed, ID-checked and WWCC-verified."
        />
      </Head>
      <RouteProgressBar />
      {isPublicPath(router.pathname) ? page : <AppProviders ssr={ssr}>{page}</AppProviders>}
      <Analytics />
    </>
  );
}
