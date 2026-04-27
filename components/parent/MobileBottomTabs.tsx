import Link from 'next/link';
import { useTranslation } from 'react-i18next';

type TabKey = 'home' | 'students' | 'sessions' | 'invoices' | 'messages' | 'calendar';

type Props = { active?: TabKey };

export default function MobileBottomTabs({ active }: Props) {
  const { t } = useTranslation('parent');
  const tabs: { key: TabKey; label: string; href: string; icon: 'home' | 'sessions' | 'invoices' | 'messages' }[] = [
    { key: 'home',     label: t('tabs.home'),     href: '/parent/dashboard', icon: 'home' },
    { key: 'sessions', label: t('tabs.sessions'), href: '/parent/sessions',  icon: 'sessions' },
    { key: 'invoices', label: t('tabs.invoices'), href: '/parent/invoices',  icon: 'invoices' },
    { key: 'messages', label: t('tabs.messages'), href: '/parent/messages',  icon: 'messages' },
  ];

  return (
    <nav
      aria-label={t('tabs.bottom_aria')}
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-rule pb-safe"
    >
      <div className="flex items-stretch">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={[
              'flex-1 flex flex-col items-center justify-center py-2 gap-1 transition-colors',
              active === tab.key ? 'text-forest' : 'text-ink-muted',
            ].join(' ')}
          >
            <TabIcon name={tab.icon} active={active === tab.key} />
            <span className="text-[10px] uppercase tracking-widest">{tab.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? 2 : 1.5;
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'home':
      return <svg {...common}><path d="M3 11l9-8 9 8M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" /></svg>;
    case 'sessions':
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
    case 'invoices':
      return <svg {...common}><path d="M5 3h11l4 4v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M16 3v4h4M8 13h8M8 17h5" /></svg>;
    case 'messages':
      return <svg {...common}><path d="M21 12c0 4-4 7-9 7-1.6 0-3-.3-4.3-.8L3 20l1-3.7C3.3 15.2 3 13.6 3 12c0-4 4-7 9-7s9 3 9 7z" /></svg>;
    default: return null;
  }
}
