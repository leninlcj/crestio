import { ReactNode } from 'react';
import Head from 'next/head';
import ParentTopBar from './ParentTopBar';
import ParentTabStrip from './ParentTabStrip';
import MobileBottomTabs from './MobileBottomTabs';
import { ParentContextProvider, useParentContext } from './ParentContext';

type Props = {
  children: ReactNode;
  title?: string;
  active?: 'home' | 'students' | 'sessions' | 'invoices' | 'messages' | 'calendar';
  fullBleed?: boolean;
  // Suppress the tab strip on detail / nested pages where the user is "inside"
  // a single thing (e.g. invoice detail, single thread, single student).
  noTabs?: boolean;
};

export default function ParentLayout(props: Props) {
  return (
    <ParentContextProvider>
      <ParentLayoutInner {...props} />
    </ParentContextProvider>
  );
}

function ParentLayoutInner({ children, title, active, fullBleed = false, noTabs = false }: Props) {
  const ctx = useParentContext();
  const browserTitle = title ?? ctx.browserTitle;

  return (
    <div className="min-h-screen bg-cream text-ink flex flex-col">
      <Head>
        <title>{browserTitle}</title>
      </Head>

      <ParentTopBar />

      {!noTabs && <ParentTabStrip active={active} />}

      <main className={fullBleed ? 'flex-1' : 'flex-1 pb-20 md:pb-12'}>
        {children}
      </main>

      <MobileBottomTabs active={active} />
    </div>
  );
}
