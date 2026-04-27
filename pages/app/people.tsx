import { useEffect } from 'react';
import { useRouter } from 'next/router';
import AuthGuard from '../../components/AuthGuard';

// Consolidated "People" entry point — routes to the appropriate sub-page
// based on ?tab=. Default lands on /app/students. The legacy routes still
// resolve directly so existing links keep working.
function PeopleRedirect() {
  const router = useRouter();
  useEffect(() => {
    const tab = router.query.tab;
    if (tab === 'households') {
      router.replace('/app/households');
    } else if (tab === 'parents') {
      router.replace('/app/households');
    } else {
      router.replace('/app/students');
    }
  }, [router]);
  return null;
}

export default function People() {
  return <AuthGuard><PeopleRedirect /></AuthGuard>;
}
