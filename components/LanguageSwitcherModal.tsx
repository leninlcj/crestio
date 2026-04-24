import { useEffect, useState } from 'react';
import { useLocale } from '../lib/localeContext';
import { LOCALE_NATIVE_NAME, SUPPORTED_LOCALES, type SupportedLocale } from '../lib/i18n';

// Simple language-picker modal. Opens from the account dropdown or any
// "Language" button. Updates profiles.locale + parents.locale via
// useLocale().setLocale, which also rewires <html lang> / dir.
export default function LanguageSwitcherModal({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const { locale, setLocale } = useLocale();
  const [busy, setBusy] = useState<SupportedLocale | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function pick(next: SupportedLocale) {
    if (next === locale) { onClose(); return; }
    setBusy(next);
    await setLocale(next);
    setBusy(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="bg-cream border border-rule rounded shadow-lift max-w-sm w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Language</div>
        <h2 className="font-display text-xl tracking-tightest mb-4">Choose a language</h2>
        <ul className="space-y-1 max-h-80 overflow-y-auto">
          {SUPPORTED_LOCALES.map((code) => (
            <li key={code}>
              <button
                type="button"
                onClick={() => pick(code)}
                disabled={busy !== null}
                className={[
                  'w-full text-left px-3 py-2 rounded flex items-center justify-between transition-colors',
                  code === locale ? 'bg-forest-soft border border-forest/20' : 'hover:bg-ruleSoft',
                ].join(' ')}
              >
                <span className="text-sm text-ink">{LOCALE_NATIVE_NAME[code]}</span>
                {code === locale && <span className="text-2xs text-forest">Current</span>}
                {busy === code && <span className="text-2xs text-ink-soft">Applying…</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end pt-3 mt-3 border-t border-rule">
          <button type="button" onClick={onClose} className="btn-ghost text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}
