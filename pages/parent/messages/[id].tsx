import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuardParent from '../../../components/AuthGuardParent';
import ParentLayout from '../../../components/parent/ParentLayout';
import ThreadView from '../../../components/messaging/ThreadView';

function Inner() {
  const router = useRouter();
  const { t } = useTranslation('parent');
  const { id } = router.query;
  return (
    <section className="px-5 md:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      {typeof id === 'string' ? (
        <ThreadView threadId={id} backHref="/parent/messages" studentHref="/parent/student" />
      ) : (
        <div className="card p-6 text-sm text-ink-muted">{t('common.loading')}</div>
      )}
    </section>
  );
}

export default function Page() {
  return (
    <AuthGuardParent>
      <ParentLayout active="messages" noTabs>
        <Inner />
      </ParentLayout>
    </AuthGuardParent>
  );
}
