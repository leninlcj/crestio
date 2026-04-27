import { useTranslation } from 'react-i18next';
import AuthGuardParent from '../../../components/AuthGuardParent';
import ParentLayout from '../../../components/parent/ParentLayout';
import ThreadList from '../../../components/messaging/ThreadList';

function Inner() {
  const { t } = useTranslation('parent');
  return (
    <section className="px-6 md:px-12 pt-10 pb-16 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl tracking-tighter text-ink mb-1">
          {t('messages_page.heading_v2')}
        </h1>
        <p className="text-sm text-ink-muted">{t('messages_page.sub_v2')}</p>
      </div>
      <ThreadList basePath="/parent/messages" />
    </section>
  );
}

export default function Page() {
  return (
    <AuthGuardParent>
      <ParentLayout active="messages">
        <Inner />
      </ParentLayout>
    </AuthGuardParent>
  );
}
