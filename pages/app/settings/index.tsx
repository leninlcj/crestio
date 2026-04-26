import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';

// /app/settings — redirects to the Account tab.
function SettingsRedirect() {
  const { t } = useTranslation('settings');
  const router = useRouter();
  useEffect(() => {
    router.replace('/app/settings/account');
  }, [router]);
  return (
    <Layout pageTitle={t('page_title')} title={t('page_title')} subtitle={t('tabs.account')}>
      <div className="text-sm text-ink-muted">{t('common.redirecting')}</div>
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><SettingsRedirect /></AuthGuard>;
}
