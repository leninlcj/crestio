import type { AppProps } from 'next/app';
import Head from 'next/head';
import i18nSingleton from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { Analytics } from '@vercel/analytics/react';
import { OrganizationProvider } from '../lib/organizationContext';
import { MembershipProvider } from '../lib/membershipContext';
import { AssistantConversationProvider } from '../lib/assistantConversation';
import { BillingProvider } from '../lib/billingContext';
import { LocaleProvider } from '../lib/localeContext';
import {
  createServerI18n,
  initI18nFromSsrProps,
  type I18nResources,
} from '../lib/i18n';
import BillingRequiredModal from '../components/BillingRequiredModal';
import ErrorBoundary from '../components/ErrorBoundary';
import ReferralCapture from '../components/ReferralCapture';
import '../styles/globals.css';

type SsrI18n = { locale: string; resources: I18nResources };

export default function App({ Component, pageProps }: AppProps) {
  const ssr = (pageProps as { _i18n?: SsrI18n })._i18n;

  // Per-request fresh instance on the server (no cross-request leakage); on
  // the client we patch the singleton synchronously and reuse it. Pages that
  // don't preload translations (e.g. /app routes) get the bare singleton —
  // LocaleProvider boots it via initI18n() in its useEffect as before.
  const i18nInstance =
    typeof window === 'undefined'
      ? ssr
        ? createServerI18n(ssr.locale, ssr.resources)
        : i18nSingleton
      : (ssr && initI18nFromSsrProps(ssr.locale, ssr.resources), i18nSingleton);

  return (
    <>
      <Head>
        <title>Crestio — run your tutoring business</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta
          name="description"
          content="The calm, deliberate software for independent tutors and tutoring businesses."
        />
      </Head>
      <I18nextProvider i18n={i18nInstance}>
        <LocaleProvider>
          <OrganizationProvider>
            <MembershipProvider>
              <BillingProvider>
                <ErrorBoundary>
                  <AssistantConversationProvider>
                    <ReferralCapture />
                    <Component {...pageProps} />
                    <BillingRequiredModal />
                  </AssistantConversationProvider>
                </ErrorBoundary>
              </BillingProvider>
            </MembershipProvider>
          </OrganizationProvider>
        </LocaleProvider>
      </I18nextProvider>
      <Analytics />
    </>
  );
}
