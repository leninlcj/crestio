import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import ThreadView from '../../../components/messaging/ThreadView';

function MessageThreadInner() {
  const router = useRouter();
  const { t } = useTranslation(['messages', 'common']);
  const { id } = router.query;
  if (typeof id !== 'string') {
    return <Layout subtitle={t('messages:subtitle')} title={t('messages:title_thread')}><div className="card p-6 text-sm text-ink-muted">{t('messages:loading')}</div></Layout>;
  }
  return (
    <Layout subtitle={t('messages:subtitle')} title={t('messages:title_thread')}>
      <ThreadView threadId={id} backHref="/app/messages" />
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><MessageThreadInner /></AuthGuard>;
}
