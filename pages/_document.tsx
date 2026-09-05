import { Html, Head, Main, NextScript } from 'next/document';
import { AGENCY } from '../lib/agency';

const GOOGLE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || AGENCY.googleSiteVerification;

// Site-wide head tags. Page titles, descriptions, canonical URLs and Open
// Graph tags are set per page (components/agency/AgencyPage.tsx); this file
// carries only what every page shares.

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Favicons: ICO for older browsers and crawlers, SVG for the rest. */}
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* Installable app (tutors and parents add the app to a home screen). */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FAFAF8" />
        <meta name="application-name" content="Crestio Tutoring" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Crestio" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />

        {GOOGLE_VERIFICATION && <meta name="google-site-verification" content={GOOGLE_VERIFICATION} />}
        <meta property="og:site_name" content="Crestio Tutoring" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
