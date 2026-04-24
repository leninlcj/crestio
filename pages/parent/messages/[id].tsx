import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuardParent from '../../../components/AuthGuardParent';
import ThreadView from '../../../components/messaging/ThreadView';

function ParentMessageThreadInner() {
  const router = useRouter();
  const { id } = router.query;
  return (
    <div className="min-h-screen bg-cream text-ink">
      <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
        <Link href="/parent/dashboard" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
        <Link href="/parent/messages" className="text-sm text-ink-muted hover:text-ink">← Messages</Link>
      </nav>

      <main className="px-5 md:px-12 py-6 md:py-10 max-w-3xl mx-auto">
        {typeof id === 'string' ? (
          <ThreadView threadId={id} backHref="/parent/messages" />
        ) : (
          <div className="card p-6 text-sm text-ink-muted">Loading…</div>
        )}
      </main>
    </div>
  );
}

export default function Page() {
  return <AuthGuardParent><ParentMessageThreadInner /></AuthGuardParent>;
}
