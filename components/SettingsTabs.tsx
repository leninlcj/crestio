import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useMembership } from '../lib/membershipContext';
import { useOrganization } from '../lib/organizationContext';
import { planAllowsFeature } from '../lib/billing';
import { cx } from '../lib/utils';
import { useIsPlatformOwner } from '../lib/useIsPlatformOwner';
import { effectivePlanTier } from '../lib/agencyPlan';

type Tab = {
  href: string;
  i18nKey: string;
  ownerOnly?: boolean;
  requires?: 'multi_tutor';
  // Optional literal label used when the tab isn't yet in the i18n bundles.
  literal?: string;
};

const TABS: Tab[] = [
  // Reordered for trust: Profile → Organisation → Schedule prefs → Notifications →
  // Billing → Parent payments → Team → Referrals → API → Data → Trash → Activity
  { href: '/app/settings/account', i18nKey: 'account' },
  { href: '/app/settings/organisation', i18nKey: 'organisation', ownerOnly: true },
  { href: '/app/settings/preferences', i18nKey: 'preferences' },
  { href: '/app/settings/voice', i18nKey: 'voice' },
  { href: '/app/settings/notifications', i18nKey: 'notifications' },
  { href: '/app/settings/billing', i18nKey: 'billing', ownerOnly: true },
  { href: '/app/settings/team', i18nKey: 'team', ownerOnly: true, requires: 'multi_tutor' },
  { href: '/app/settings/referrals', i18nKey: 'referrals', ownerOnly: true },
  { href: '/app/settings/integrations', i18nKey: 'integrations' },
  { href: '/app/settings/data', i18nKey: 'data' },
  { href: '/app/settings/templates', i18nKey: 'templates', literal: 'Templates' },
  { href: '/app/settings/trash', i18nKey: 'trash', literal: 'Trash' },
  { href: '/app/settings/my-activity', i18nKey: 'my-activity', literal: 'My activity' },
];

export function SettingsTabs() {
  const { t } = useTranslation('settings');
  const router = useRouter();
  const { membership } = useMembership();
  const { organization } = useOrganization();
  const isOwner = membership?.role === 'owner';
  const platformOwner = useIsPlatformOwner();
  const planTier = effectivePlanTier(organization?.plan_tier ?? 'solo', isOwner && platformOwner);

  const tabs = TABS.filter((tab) => {
    if (tab.ownerOnly && !isOwner) return false;
    if (tab.requires === 'multi_tutor' && !planAllowsFeature(planTier, 'multi_tutor')) return false;
    return true;
  });

  return (
    <div className="border-b border-rule -mx-5 md:-mx-12 px-5 md:px-12 mb-8 overflow-x-auto">
      <nav role="tablist" aria-label={t('tabs.aria_label')} className="flex gap-1 min-w-max">
        {tabs.map((tab) => {
          const active = router.pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              role="tab"
              aria-selected={active}
              className={cx(
                'inline-flex items-center px-4 py-3 text-sm -mb-px border-b-2 transition-colors',
                active
                  ? 'border-forest text-ink font-medium'
                  : 'border-transparent text-ink-muted hover:text-ink'
              )}
            >
              {(() => {
                const key = `tabs.${tab.i18nKey}`;
                const label = t(key);
                return label === key && tab.literal ? tab.literal : label;
              })()}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default SettingsTabs;
