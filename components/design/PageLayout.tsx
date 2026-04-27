import { ReactNode } from 'react';
import Layout from '../Layout';
import Breadcrumb, { Crumb } from './Breadcrumb';
import TabStrip, { Tab } from './TabStrip';

type Props = {
  // Browser tab title and breadcrumb leaf default. Required.
  title: string;
  // Tab title override (e.g. for shorter browser tab text).
  pageTitle?: string;
  breadcrumb?: Crumb[];
  tabs?: Tab[];
  // One primary action button on the right of the header.
  primaryAction?: ReactNode;
  // Secondary actions (rendered before primary on desktop).
  secondaryActions?: ReactNode;
  // Render-prop for an optional filter row beneath the tabs.
  filterBar?: ReactNode;
  // Optional sub-line under the title (small muted text).
  subtitle?: string;
  children: ReactNode;
};

// Single shared page layout — every /app route should use this.
// Header: breadcrumb (in top bar), page title (24/600), primary action.
// Optional tab strip below the header (sticky).
// Optional filter bar (single row, never two).
export function PageLayout({
  title,
  pageTitle,
  breadcrumb,
  tabs,
  primaryAction,
  secondaryActions,
  filterBar,
  subtitle,
  children,
}: Props) {
  // Derive a default breadcrumb if none supplied.
  const trail = breadcrumb && breadcrumb.length > 0
    ? breadcrumb
    : [{ label: title }];

  return (
    <Layout pageTitle={pageTitle ?? title} breadcrumbItems={trail}>
      <div className="px-4 md:px-8 pt-6 md:pt-8 pb-2 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] font-display font-semibold tracking-tighter text-ink leading-tight m-0">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-ink-muted mt-1 max-w-2xl">{subtitle}</p>
          )}
        </div>
        {(primaryAction || secondaryActions) && (
          <div className="flex items-center gap-2 shrink-0">
            {secondaryActions}
            {primaryAction}
          </div>
        )}
      </div>

      {tabs && tabs.length > 0 && (
        <div className="mt-2">
          <TabStrip tabs={tabs} ariaLabel={`${title} sections`} />
        </div>
      )}

      {filterBar && (
        <div className="px-4 md:px-8 py-3 border-b border-rule bg-cream">
          {filterBar}
        </div>
      )}

      <div className="px-4 md:px-8 py-6 md:py-8">
        {children}
      </div>
    </Layout>
  );
}

export default PageLayout;
