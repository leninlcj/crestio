import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import ThreadList from '../../../components/messaging/ThreadList';

function MessagesInner() {
  const { t } = useTranslation('messages');
  return (
    <Layout subtitle={t('subtitle')} title={t('title_list')}>
      <ThreadList basePath="/app/messages" allowArchiveToggle />
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><MessagesInner /></AuthGuard>;
}
