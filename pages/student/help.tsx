import Link from 'next/link';
import AuthGuardStudent from '../../components/AuthGuardStudent';
import StudentLayout from '../../components/student/StudentLayout';
import { useStudentMe } from '../../components/student/StudentContext';

function Inner() {
  const { me } = useStudentMe();
  return (
    <StudentLayout title="Help">
      <h1 className="font-display text-[28px] tracking-tightest">Help</h1>
      <div className="mt-6 card p-5">
        <p className="text-sm text-ink">
          Need help? Email{' '}
          {me?.tutor.replyTo ? (
            <a href={`mailto:${me.tutor.replyTo}`} className="underline">{me.tutor.replyTo}</a>
          ) : (
            <span>your tutor</span>
          )}
          .
        </p>
      </div>
      <div className="mt-4">
        <Link href="/student/safety" className="text-sm underline-offset-2 hover:underline text-ink-muted">
          If something feels wrong →
        </Link>
      </div>
    </StudentLayout>
  );
}

export default function Page() {
  return <AuthGuardStudent><Inner /></AuthGuardStudent>;
}
