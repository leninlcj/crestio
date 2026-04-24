import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMembership } from '../lib/membershipContext';
import { useOrganization } from '../lib/organizationContext';
import { planAllowsFeature } from '../lib/billing';
import { cx } from '../lib/utils';

type Tab = {
  href: string;
  label: string;
  ownerOnly?: boolean;
  requires?: 'multi_tutor';
};

const TABS: Tab[] = [
  { href: '/app/settings/account', label: 'Account' },
  { href: '/app/settings/organisation', label: 'Organisation', ownerOnly: true },
  { href: '/app/settings/billing', label: 'Billing', ownerOnly: true },
  { href: '/app/settings/referrals', label: 'Referrals', ownerOnly: true },
  { href: '/app/settings/team', label: 'Team', ownerOnly: true, requires: 'multi_tutor' },
  { href: '/app/settings/preferences', label: 'Preferences' },
  { href: '/app/settings/notifications', label: 'Notifications' },
];

export function SettingsTabs() {
  const router = useRouter();
  const { membership } = useMembership();
  const { organization } = useOrganization();
  const isOwner = membership?.role === 'owner';
  const planTier = organization?.plan_tier ?? 'solo';

  const tabs = TABS.filter((t) => {
    if (t.ownerOnly && !isOwner) return false;
    if (t.requires === 'multi_tutor' && !planAllowsFeature(planTier, 'multi_tutor')) return false;
    return true;
  });

  return (
    <div className="border-b border-rule -mx-5 md:-mx-12 px-5 md:px-12 mb-8 overflow-x-auto">
      <nav role="tablist" aria-label="Settings sections" className="flex gap-1 min-w-max">
        {tabs.map((t) => {
          const active = router.pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              role="tab"
              aria-selected={active}
              className={cx(
                'inline-flex items-center px-4 py-3 text-sm -mb-px border-b-2 transition-colors',
                active
                  ? 'border-forest text-ink font-medium'
                  : 'border-transparent text-ink-muted hover:text-ink'
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default SettingsTabs;
