import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Favicons */}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />

        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FAF8F4" />
        <meta name="application-name" content="Crestio" />

        {/* iOS — Add to Home Screen */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Crestio" />
        <meta name="format-detection" content="telephone=no" />

        {/* Android */}
        <meta name="mobile-web-app-capable" content="yes" />

        {/* Open Graph (shows on iMessage, WhatsApp, LinkedIn, Facebook, etc.) */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Crestio" />
        <meta property="og:title" content="Crestio — run your tutoring business with intent" />
        <meta property="og:description" content="The calm, deliberate software for independent tutors and tutoring businesses. Students, sessions, invoices, lesson plans — one place." />
        <meta property="og:image" content="/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content="en_AU" />

        {/* Twitter / X */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Crestio — run your tutoring business with intent" />
        <meta name="twitter:description" content="The calm, deliberate software for independent tutors and tutoring businesses." />
        <meta name="twitter:image" content="/og-image.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
