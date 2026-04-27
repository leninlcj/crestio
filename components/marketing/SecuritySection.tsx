import type { ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
};

export default function SecuritySection({ title, children, icon }: Props) {
  return (
    <div className="rounded-md border border-rule bg-surface p-6 md:p-7">
      <div className="flex items-start gap-3 mb-3">
        <span className="shrink-0 mt-0.5 text-forest" aria-hidden>
          {icon ?? <LockIcon />}
        </span>
        <h2 className="font-display text-lg tracking-tightest text-ink m-0 leading-tight">{title}</h2>
      </div>
      <div className="text-sm text-ink-muted leading-relaxed space-y-2 pl-7">
        {children}
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
