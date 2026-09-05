import type { ReactNode } from 'react';
import { AgencyPage } from './AgencyPage';
import { breadcrumb } from '../../lib/agencySchema';

// Layout for the privacy policy, terms and cookie policy: the normal site
// navigation and footer, a contents list, and prose styles for the body.

type Props = {
  title: string;
  description: string;
  path: string;
  kicker?: string;
  lastUpdated: string;
  toc: Array<{ id: string; label: string }>;
  children: ReactNode;
};

export function LegalArticle({ title, description, path, kicker = 'Legal', lastUpdated, toc, children }: Props) {
  return (
    <AgencyPage
      title={title}
      description={description}
      path={path}
      jsonLd={[breadcrumb([{ name: 'Home', url: '/' }, { name: title, url: path }])]}
    >
      <article className="max-w-2xl mx-auto px-6 md:px-12 pt-14 md:pt-20 pb-16 md:pb-24">
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">{kicker}</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter text-ink text-balance leading-[1.05] mb-3">{title}</h1>
        <div className="text-sm text-ink-muted mb-10">Last updated {lastUpdated}</div>

        {toc.length > 0 && (
          <nav aria-label="Contents" className="rounded-md border border-rule bg-surface p-5 md:p-6 mb-10">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Contents</div>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-ink">
              {toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="text-ink hover:text-forest underline underline-offset-2">{item.label}</a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <section className="legal-prose text-ink leading-relaxed">{children}</section>
      </article>
    </AgencyPage>
  );
}
