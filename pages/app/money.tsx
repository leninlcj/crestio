import { useEffect } from 'react';
import { useRouter } from 'next/router';
import AuthGuard from '../../components/AuthGuard';

// Consolidated "Money" entry point — routes to invoices or payouts based
// on ?tab=. Owner viewing tutor payouts should jump to /app/team?tab=payouts.
function MoneyRedirect() {
  const router = useRouter();
  useEffect(() => {
    const tab = router.query.tab;
    const filter = router.query.filter;
    const action = router.query.action;
    if (tab === 'received' || tab === 'payouts') {
      router.replace('/app/payouts');
    } else if (action === 'batch') {
      router.replace('/app/invoices/batch');
    } else if (filter) {
      router.replace(`/app/invoices?filter=${encodeURIComponent(String(filter))}`);
    } else {
      router.replace('/app/invoices');
    }
  }, [router]);
  return null;
}

export default function Money() {
  return <AuthGuard><MoneyRedirect /></AuthGuard>;
}
