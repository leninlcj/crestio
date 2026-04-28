import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuardStudent from '../../../components/AuthGuardStudent';
import StudentLayout from '../../../components/student/StudentLayout';
import { authFetch } from '../../../lib/authFetch';

// Reuses the existing /api/files/[id]/view-url endpoint (extended in this
// commit to authorize student viewers).  Renders the file in an iframe with
// an overlaid watermark that includes the student's email + tutor + timestamp.

type ViewInfo = {
  signed_url: string;
  expires_at: string;
  mime_type: string;
  watermark_text: string;
  display_name: string | null;
};

function Inner() {
  const router = useRouter();
  const fileId = router.query.id as string | undefined;
  const [info, setInfo] = useState<ViewInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [blocked, setBlocked] = useState(false);

  // Refresh signed URL every 55s (TTL is 60s server-side).
  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        const res = await authFetch(`/api/files/${fileId}/view-url`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data?.error ?? 'Could not open the file.');
          return;
        }
        const data = await res.json();
        if (!cancelled) setInfo(data);
      } catch {
        setError('Could not open the file.');
      }
    }

    void load();
    timer = setInterval(load, 55_000);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [fileId]);

  // Watermark refresh tick (60s) so timestamp stays current.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // DevTools detection — blur if outerWidth - innerWidth > 200 (rough heuristic).
  useEffect(() => {
    function check() {
      if (typeof window === 'undefined') return;
      const w = window.outerWidth - window.innerWidth;
      const h = window.outerHeight - window.innerHeight;
      setBlocked(w > 200 || h > 200);
    }
    check();
    const t = setInterval(check, 1500);
    window.addEventListener('resize', check);
    return () => { clearInterval(t); window.removeEventListener('resize', check); };
  }, []);

  // Block right-click + common save shortcuts on this page only.
  useEffect(() => {
    function suppressMenu(e: MouseEvent) { e.preventDefault(); }
    function suppressKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && /^(s|p|a)$/i.test(e.key)) e.preventDefault();
    }
    document.addEventListener('contextmenu', suppressMenu);
    document.addEventListener('keydown', suppressKey);
    return () => {
      document.removeEventListener('contextmenu', suppressMenu);
      document.removeEventListener('keydown', suppressKey);
    };
  }, []);

  return (
    <StudentLayout title={info?.display_name ?? 'File'}>
      <Link href="/student/files" className="text-sm text-ink-muted hover:text-ink">← Back</Link>

      {error ? (
        <div className="mt-6 card p-6 text-sm text-claret">{error}</div>
      ) : !info ? (
        <p className="mt-6 text-sm text-ink-muted">Loading…</p>
      ) : (
        <div className="mt-6 relative">
          {blocked && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-cream/95 backdrop-blur">
              <p className="text-sm text-ink-muted">Close developer tools to view the file.</p>
            </div>
          )}

          <div className="relative border border-rule rounded-md overflow-hidden bg-white" style={{ minHeight: 600 }}>
            <iframe
              src={info.signed_url}
              title={info.display_name ?? 'File'}
              className="w-full"
              style={{ height: '70vh', minHeight: 600 }}
            />
            <Watermark text={`${info.watermark_text} · ${new Date().toISOString()}`} key={tick} />
          </div>

          <p className="mt-3 text-2xs text-ink-soft">
            {info.display_name ?? 'File'}
          </p>
        </div>
      )}
    </StudentLayout>
  );
}

function Watermark({ text }: { text: string }) {
  // Tiled diagonal watermark, 8% opacity, pointer-events: none.
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ color: 'rgba(20,20,20,0.08)' }}
    >
      <div
        className="absolute inset-[-50%]"
        style={{
          transform: 'rotate(-30deg)',
          fontSize: 12,
          lineHeight: '240px',
          whiteSpace: 'nowrap',
          fontFamily: 'IBM Plex Mono, monospace',
          letterSpacing: '0.05em',
        }}
      >
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i}>{`${text}    `.repeat(20)}</div>
        ))}
      </div>
    </div>
  );
}

export default function Page() {
  return <AuthGuardStudent><Inner /></AuthGuardStudent>;
}
