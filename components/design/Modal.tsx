import { ReactNode, useEffect } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  dismissible?: boolean;
  'aria-label'?: string;
};

const SIZE: Record<NonNullable<Props['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  dismissible = true,
  ...rest
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={rest['aria-label'] ?? title}
      className="fixed inset-0 z-[60] bg-ink/40 flex items-center justify-center p-4 animate-fade-in"
      onClick={dismissible ? onClose : undefined}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={['relative bg-surface border border-rule rounded-lg shadow-lift w-full max-h-[85vh] overflow-hidden flex flex-col', SIZE[size]].join(' ')}
      >
        {(title || dismissible) && (
          <div className="px-5 py-4 border-b border-rule flex items-start justify-between gap-4">
            <div>
              {title && <h2 className="font-display text-xl tracking-tightest text-ink leading-tight">{title}</h2>}
              {subtitle && <p className="text-sm text-ink-muted mt-1">{subtitle}</p>}
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost text-xs"
                aria-label="Close"
              >
                ×
              </button>
            )}
          </div>
        )}
        <div className="px-5 py-5 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-rule bg-ruleSoft/40">{footer}</div>
        )}
      </div>
    </div>
  );
}

export default Modal;
