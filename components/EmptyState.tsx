import { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ title, description, action }: Props) {
  return (
    <div className="card px-8 py-16 text-center">
      <div className="font-display text-2xl text-ink tracking-tightest mb-2">{title}</div>
      {description && (
        <p className="text-sm text-ink-muted max-w-md mx-auto mb-5 text-balance">{description}</p>
      )}
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
}
