import AuthGuard from '../../../components/AuthGuard';
import OwnerOnly from '../../../components/OwnerOnly';
import Layout from '../../../components/Layout';
import { AuditLogPage } from '../../../components/activity/AuditLogPage';

export default function OwnerActivityLogPage() {
  return (
    <AuthGuard>
      <OwnerOnly>
        <Layout pageTitle="Activity log" title="Activity log" subtitle="Owner">
          <p className="text-sm text-ink-muted mb-4">
            Every mutation in your organization. Filter by entity, action, or date range.
          </p>
          <AuditLogPage scope="org" />
        </Layout>
      </OwnerOnly>
    </AuthGuard>
  );
}
