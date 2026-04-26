import { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export default function EmptyState({ title, description, action, icon }: Props) {
  return (
    <div className="card px-8 py-14 md:py-16 text-center">
      {icon && (
        <div
          aria-hidden="true"
          className="mx-auto mb-5 flex items-center justify-center w-12 h-12 rounded-full bg-ruleSoft text-ink-soft"
        >
          {icon}
        </div>
      )}
      <div className="font-display text-2xl text-ink tracking-tightest mb-2">{title}</div>
      {description && (
        <p className="text-sm md:text-base text-ink-muted max-w-md mx-auto mb-6 text-balance leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
}
