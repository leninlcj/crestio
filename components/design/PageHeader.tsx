import { ReactNode } from 'react';

type Props = {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ kicker, title, subtitle, actions }: Props) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
      <div>
        {kicker && (
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">{kicker}</div>
        )}
        <h1 className="font-display text-3xl md:text-4xl tracking-tightest text-ink leading-none">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-ink-muted mt-2 max-w-xl">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export default PageHeader;
