import Link from 'next/link';
import { Fragment, ReactNode } from 'react';

export type Crumb = {
  label: string;
  href?: string;
};

type Props = {
  items: Crumb[];
  separator?: ReactNode;
};

// Up to 3 levels, clickable. On mobile only the last item shows.
export function Breadcrumb({ items, separator = '/' }: Props) {
  const visible = items.slice(-3);
  if (visible.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-ink-muted min-w-0">
      <ol className="hidden md:flex items-center gap-1.5 min-w-0">
        {visible.map((crumb, i) => {
          const last = i === visible.length - 1;
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              {crumb.href && !last ? (
                <li className="truncate">
                  <Link href={crumb.href} className="hover:text-ink transition-colors duration-100">
                    {crumb.label}
                  </Link>
                </li>
              ) : (
                <li className={`truncate ${last ? 'text-ink' : ''}`} aria-current={last ? 'page' : undefined}>
                  {crumb.label}
                </li>
              )}
              {!last && (
                <li aria-hidden="true" className="text-ink-soft">
                  {separator}
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
      <span className="md:hidden text-ink truncate font-medium">{visible[visible.length - 1].label}</span>
    </nav>
  );
}

export default Breadcrumb;
