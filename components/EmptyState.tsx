import { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

// Compact empty state — 24px icon, two short lines, one CTA. Centered in the
// available content area, max ~320px wide. No illustrations, factual voice.
export default function EmptyState({ title, description, action, icon }: Props) {
  return (
    <div className="px-4 py-12 md:py-16 flex justify-center">
      <div className="text-center max-w-[320px]">
        {icon && (
          <div
            aria-hidden="true"
            className="mx-auto mb-3 flex items-center justify-center w-6 h-6 text-ink-soft [&>svg]:w-6 [&>svg]:h-6"
          >
            {icon}
          </div>
        )}
        <div className="text-sm text-ink font-medium">{title}</div>
        {description && (
          <p className="text-xs text-ink-muted mt-1 leading-relaxed">{description}</p>
        )}
        {action && <div className="flex justify-center mt-4">{action}</div>}
      </div>
    </div>
  );
}
