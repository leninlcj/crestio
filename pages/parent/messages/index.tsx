import Link from 'next/link';
import AuthGuardParent from '../../../components/AuthGuardParent';
import ThreadList from '../../../components/messaging/ThreadList';

function ParentMessagesInner() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
        <Link href="/parent/dashboard" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
        <Link href="/parent/dashboard" className="text-sm text-ink-muted hover:text-ink">← Dashboard</Link>
      </nav>

      <main className="px-6 md:px-12 py-10 max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Messages</div>
          <h1 className="font-display text-4xl tracking-tightest">Your messages</h1>
        </div>
        <ThreadList basePath="/parent/messages" />
      </main>
    </div>
  );
}

export default function Page() {
  return <AuthGuardParent><ParentMessagesInner /></AuthGuardParent>;
}
