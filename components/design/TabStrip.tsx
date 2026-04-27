import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactNode } from 'react';

export type Tab = {
  key: string;
  label: string;
  href: string;          // canonical href for this tab
  match?: (pathname: string, query: Record<string, any>) => boolean;
  badge?: ReactNode;
};

type Props = {
  tabs: Tab[];
  ariaLabel?: string;
};

// Sticky tab strip — used under the page header on consolidated pages.
// Active state: 2px forest underline + dark text. Inactive: muted text.
export function TabStrip({ tabs, ariaLabel = 'Page sections' }: Props) {
  const router = useRouter();
  return (
    <div
      className="sticky top-14 z-10 bg-cream/95 backdrop-blur supports-[backdrop-filter]:bg-cream/85 border-b border-rule"
      role="tablist"
      aria-label={ariaLabel}
    >
      <div className="px-4 md:px-8 -mb-px overflow-x-auto scrollbar-thin">
        <div className="flex items-center gap-1 min-w-max">
          {tabs.map((tab) => {
            const isActive = tab.match
              ? tab.match(router.pathname, router.query)
              : router.asPath.split('?')[0] === tab.href.split('?')[0];
            return (
              <Link
                key={tab.key}
                href={tab.href}
                role="tab"
                aria-selected={isActive}
                className={[
                  'relative inline-flex items-center gap-2 px-3 py-3 text-sm transition-colors duration-100',
                  isActive ? 'text-ink font-medium' : 'text-ink-muted hover:text-ink',
                ].join(' ')}
              >
                <span>{tab.label}</span>
                {tab.badge}
                <span
                  aria-hidden="true"
                  className={[
                    'absolute left-2 right-2 -bottom-px h-0.5 rounded-full transition-opacity duration-100',
                    isActive ? 'bg-forest opacity-100' : 'opacity-0',
                  ].join(' ')}
                />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TabStrip;
