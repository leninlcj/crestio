import { ReactNode } from 'react';

type Props = {
  icon?: ReactNode;
  title: string;
  description?: string;
  cta?: ReactNode;
};

export function EmptyState({ icon, title, description, cta }: Props) {
  return (
    <div className="card p-8 md:p-12 text-center">
      {icon && <div className="flex justify-center mb-4 text-ink-soft">{icon}</div>}
      <div className="font-display text-2xl tracking-tightest mb-2 text-ink">{title}</div>
      {description && (
        <p className="text-sm text-ink-muted max-w-md mx-auto mb-5">{description}</p>
      )}
      {cta && <div className="flex justify-center">{cta}</div>}
    </div>
  );
}

export default EmptyState;
