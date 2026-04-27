import { useEffect } from 'react';
import { useRouter } from 'next/router';
import AuthGuard from '../../components/AuthGuard';

// Consolidated "Resources" entry point — routes to lesson plans or files
// based on ?tab=. Default lands on lesson plans.
function ResourcesRedirect() {
  const router = useRouter();
  useEffect(() => {
    const tab = router.query.tab;
    if (tab === 'files') {
      router.replace('/app/files');
    } else {
      router.replace('/app/lesson-plans');
    }
  }, [router]);
  return null;
}

export default function Resources() {
  return <AuthGuard><ResourcesRedirect /></AuthGuard>;
}
