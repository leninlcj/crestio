import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

type Props = { open: boolean; onClose: () => void };

export default function VideoModal({ open, onClose }: Props) {
  const { t } = useTranslation('marketing');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('video_modal.aria')}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-ink/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl shadow-lift max-w-3xl w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-rule">
          <div className="text-sm font-medium text-ink">{t('video_modal.title')}</div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1.5 text-ink-muted hover:text-ink rounded transition-colors"
            aria-label={t('video_modal.close')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>
        <div className="aspect-video bg-cream flex items-center justify-center text-center px-8">
          <div>
            <div className="text-forest mx-auto mb-4 inline-block">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
              </svg>
            </div>
            <h3 className="font-display text-2xl tracking-tightest text-ink mb-2">
              {t('video_modal.placeholder_title')}
            </h3>
            <p className="text-sm text-ink-muted max-w-sm mx-auto">
              {t('video_modal.placeholder_body')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
