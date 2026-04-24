import type { AppProps } from 'next/app';
import Head from 'next/head';
import { Analytics } from '@vercel/analytics/react';
import { OrganizationProvider } from '../lib/organizationContext';
import { MembershipProvider } from '../lib/membershipContext';
import { AssistantConversationProvider } from '../lib/assistantConversation';
import { BillingProvider } from '../lib/billingContext';
import { LocaleProvider } from '../lib/localeContext';
import BillingRequiredModal from '../components/BillingRequiredModal';
import ErrorBoundary from '../components/ErrorBoundary';
import ReferralCapture from '../components/ReferralCapture';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
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
      <Analytics />
    </>
  );
}
