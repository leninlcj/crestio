import { useTranslation } from 'react-i18next';
import AuthGuardParent from '../../components/AuthGuardParent';
import ParentLayout from '../../components/parent/ParentLayout';
import NotificationList from '../../components/notifications/NotificationList';

function Inner() {
  const { t } = useTranslation('parent');
  return (
    <section className="px-6 md:px-12 pt-10 pb-16 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl tracking-tighter text-ink mb-1">
          {t('notifications_page.heading')}
        </h1>
      </div>
      <NotificationList />
    </section>
  );
}

export default function Page() {
  return (
    <AuthGuardParent>
      <ParentLayout noTabs>
        <Inner />
      </ParentLayout>
    </AuthGuardParent>
  );
}
