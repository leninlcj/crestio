import { useEffect, useState } from 'react';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import SettingsTabs from '../../../components/SettingsTabs';
import { AuditLogPage } from '../../../components/activity/AuditLogPage';
import { supabase } from '../../../lib/supabase';

function MyActivityInner() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      setUserId(data.session?.user.id ?? null);
    })();
  }, []);

  return (
    <Layout pageTitle="My activity" title="My activity" subtitle="Settings">
      <SettingsTabs />
      <p className="text-sm text-ink-muted mb-4">
        Every action you've taken. This is just for you; owners see the same view across the whole organization.
      </p>
      {userId ? <AuditLogPage scope="self" selfUserId={userId} /> : <div className="text-sm text-ink-muted">Loading…</div>}
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><MyActivityInner /></AuthGuard>;
}
