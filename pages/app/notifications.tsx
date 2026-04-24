import AuthGuard from '../../components/AuthGuard';
import Layout from '../../components/Layout';
import NotificationList from '../../components/notifications/NotificationList';

function Inner() {
  return (
    <Layout subtitle="Notifications" title="Notifications">
      <NotificationList />
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><Inner /></AuthGuard>;
}
