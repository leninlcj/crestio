import Link from 'next/link';
import { useTranslation } from 'react-i18next';

type TabKey = 'home' | 'students' | 'sessions' | 'invoices' | 'messages' | 'calendar';

type Props = { active?: TabKey };

export default function ParentTabStrip({ active }: Props) {
  const { t } = useTranslation('parent');
  const tabs: { key: TabKey; label: string; href: string }[] = [
    { key: 'home',     label: t('tabs.home'),     href: '/parent/dashboard' },
    { key: 'students', label: t('tabs.students'), href: '/parent/dashboard#students' },
    { key: 'sessions', label: t('tabs.sessions'), href: '/parent/sessions' },
    { key: 'invoices', label: t('tabs.invoices'), href: '/parent/invoices' },
    { key: 'messages', label: t('tabs.messages'), href: '/parent/messages' },
    { key: 'calendar', label: t('tabs.calendar'), href: '/parent/calendar' },
  ];

  return (
    <div className="bg-surface border-b border-rule">
      <div className="max-w-6xl mx-auto px-4 md:px-12">
        <nav
          aria-label={t('tabs.aria')}
          className="flex gap-1 overflow-x-auto scrollbar-thin -mx-4 px-4 md:mx-0 md:px-0"
        >
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={[
                'inline-block px-4 py-3 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors',
                active === tab.key
                  ? 'border-forest text-ink font-medium'
                  : 'border-transparent text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
