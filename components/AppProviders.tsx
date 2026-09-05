import type { ReactNode } from 'react';
import i18nSingleton from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { OrganizationProvider } from '../lib/organizationContext';
import { MembershipProvider } from '../lib/membershipContext';
import { AssistantConversationProvider } from '../lib/assistantConversation';
import { BillingProvider } from '../lib/billingContext';
import { LocaleProvider } from '../lib/localeContext';
import { createServerI18n, initI18nFromSsrProps, type I18nResources } from '../lib/i18n';
import BillingRequiredModal from './BillingRequiredModal';
import ErrorBoundary from './ErrorBoundary';
import ReferralCapture from './ReferralCapture';
import { ToastProvider } from './design/Toast';
import { KeyboardShortcutsOverlay } from './design/KeyboardShortcutsOverlay';
import GlobalKeyboardNav from './GlobalKeyboardNav';
import { TimeTickProvider } from '../lib/useTimeAgo';
import { UndoProvider } from '../lib/useUndo';
import { InlineComposer } from './design/InlineComposer';
import { QuickCreate } from './quickcreate/QuickCreate';
import { DetailPaneStackProvider, DetailPaneStackOverlay } from './depth/DetailPaneStack';
import { UndoKeybind } from './UndoKeybind';
import { TrashZone } from './depth/TrashZone';
// Side-effect import: registers default pane renderers with the stack.
import './panes/StackPanes';

// Everything the signed-in app needs around a page: i18n, organisation and
// membership context, billing, the assistant, toasts, undo, keyboard
// navigation, quick create and the detail-pane stack. Loaded only for app
// routes (see pages/_app.tsx) so the public site ships none of it.

export type SsrI18n = { locale: string; resources: I18nResources };

export function AppProviders({ ssr, children }: { ssr?: SsrI18n; children: ReactNode }) {
  // Per-request fresh instance on the server (no cross-request leakage); on
  // the client we patch the singleton synchronously and reuse it. Pages that
  // don't preload translations (e.g. /app routes) get the bare singleton;
  // LocaleProvider boots it via initI18n() in its useEffect.
  const i18nInstance =
    typeof window === 'undefined'
      ? ssr
        ? createServerI18n(ssr.locale, ssr.resources)
        : i18nSingleton
      : (ssr && initI18nFromSsrProps(ssr.locale, ssr.resources), i18nSingleton);

  return (
    <I18nextProvider i18n={i18nInstance}>
      <LocaleProvider>
        <OrganizationProvider>
          <MembershipProvider>
            <BillingProvider>
              <ErrorBoundary>
                <AssistantConversationProvider>
                  <ToastProvider>
                    <UndoProvider>
                      <TimeTickProvider>
                        <DetailPaneStackProvider>
                          <KeyboardShortcutsOverlay />
                          <GlobalKeyboardNav />
                          <UndoKeybind />
                          <ReferralCapture />
                          {children}
                          <BillingRequiredModal />
                          <InlineComposer />
                          <QuickCreate />
                          <TrashZone />
                          <DetailPaneStackOverlay />
                        </DetailPaneStackProvider>
                      </TimeTickProvider>
                    </UndoProvider>
                  </ToastProvider>
                </AssistantConversationProvider>
              </ErrorBoundary>
            </BillingProvider>
          </MembershipProvider>
        </OrganizationProvider>
      </LocaleProvider>
    </I18nextProvider>
  );
}
