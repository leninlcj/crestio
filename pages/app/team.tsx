import { useEffect } from 'react';
import { useRouter } from 'next/router';
import AuthGuard from '../../components/AuthGuard';

// Consolidated "Team" entry point — routes to tutors or payouts-to-tutors
// based on ?tab=. Default lands on tutors. Visible to owners on the Team
// plan; the sidebar entry is also gated to that audience.
function TeamRedirect() {
  const router = useRouter();
  useEffect(() => {
    const tab = router.query.tab;
    if (tab === 'payouts') {
      router.replace('/app/payouts');
    } else {
      router.replace('/app/tutors');
    }
  }, [router]);
  return null;
}

export default function Team() {
  return <AuthGuard><TeamRedirect /></AuthGuard>;
}
