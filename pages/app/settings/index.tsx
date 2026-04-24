import { useEffect } from 'react';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';

// /app/settings — redirects to the Account tab.
function SettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/app/settings/account');
  }, [router]);
  return (
    <Layout title="Settings" subtitle="Account">
      <div className="text-sm text-ink-muted">Redirecting…</div>
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><SettingsRedirect /></AuthGuard>;
}
