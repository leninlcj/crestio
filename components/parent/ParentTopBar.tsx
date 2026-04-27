import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useParentContext } from './ParentContext';
import NotificationBell from '../notifications/NotificationBell';
import { supabase } from '../../lib/supabase';

export default function ParentTopBar() {
  const { t } = useTranslation('parent');
  const { primaryTutorName, primaryOrgName } = useParentContext();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/parent/signin');
  }

  const orgLabel = primaryOrgName ?? (primaryTutorName ? `${primaryTutorName}'s practice` : 'Crestio');
  const portalLabel = primaryTutorName
    ? t('topbar.portal_title_named', { tutor: primaryTutorName })
    : t('topbar.portal_title');

  const tutorInitials = primaryTutorName
    ? primaryTutorName.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : 'C';

  return (
    <header className="bg-surface border-b border-rule">
      <div className="px-4 md:px-12 h-16 flex items-center justify-between gap-4 max-w-6xl mx-auto">
        <Link href="/parent/dashboard" className="flex items-center gap-3 min-w-0 shrink">
          <div className="w-9 h-9 rounded-full bg-forest/10 text-forest-ink flex items-center justify-center font-display text-sm tracking-tightest shrink-0">
            {tutorInitials}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink truncate">{orgLabel}</div>
          </div>
        </Link>

        <div className="hidden md:block text-2xs uppercase tracking-widest text-ink-soft text-center">
          {portalLabel}
        </div>

        <div className="flex items-center gap-2 shrink-0" ref={ref}>
          <NotificationBell mode="parent" />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={open}
            className="w-8 h-8 rounded-full bg-rule/60 text-ink hover:bg-rule transition-colors flex items-center justify-center"
            aria-label={t('topbar.account')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
            </svg>
          </button>
          {open && (
            <div className="absolute right-4 md:right-12 top-14 z-50 w-56 rounded-md bg-surface border border-rule shadow-lift py-1 animate-fade-in">
              <Link
                href="/parent/settings"
                className="block px-4 py-2 text-sm text-ink hover:bg-ruleSoft transition-colors"
                onClick={() => setOpen(false)}
              >
                {t('topbar.settings')}
              </Link>
              <Link
                href="/parent/notifications"
                className="block px-4 py-2 text-sm text-ink hover:bg-ruleSoft transition-colors"
                onClick={() => setOpen(false)}
              >
                {t('topbar.notifications')}
              </Link>
              <div className="border-t border-rule my-1" />
              <button
                type="button"
                onClick={signOut}
                className="w-full text-left px-4 py-2 text-sm text-claret hover:bg-claret/5 transition-colors"
              >
                {t('topbar.sign_out')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
