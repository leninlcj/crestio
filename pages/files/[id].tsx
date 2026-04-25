// Protected file viewer — PDF (pdf.js canvas) or image (img). Authenticated.
//
// Layered protections (best-effort, not absolute — a determined user can still
// screenshot, but these stop casual saving):
//   • Server returns a 60s signed URL via /api/files/[id]/view-url and writes
//     the file_views audit row before responding.
//   • PDFs render via pdf.js (react-pdf) onto <canvas> elements — no iframe,
//     no native browser PDF toolbar, no Chrome iframe-PDF block.
//   • Right-click suppressed everywhere; Cmd/Ctrl+S/P/A intercepted.
//   • Watermark overlay (Team only) shows viewer email + ISO timestamp,
//     diagonal across the viewport, pointer-events: none.
//   • DevTools heuristic: outerWidth - innerWidth > 200 (panel docked) blurs
//     the file. Imperfect — enough to make screen recording awkward.
//
// The page is split into outer/inner: the outer waits for the LocaleProvider
// to finish booting i18n before rendering the inner — otherwise
// useTranslation runs against an uninitialized i18next instance and falls
// back to the raw keys.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useLocale } from '../../lib/localeContext';

// react-pdf imports pdfjs-dist which uses DOMMatrix and other browser-only
// globals. Dynamic import with ssr:false keeps it out of the SSR bundle.
const PdfRenderer = dynamic(
  () => import('../../components/files/PdfRenderer').then((m) => m.PdfRenderer),
  { ssr: false },
);

type ViewPayload = {
  signed_url: string;
  expires_at: string;
  mime_type: string;
  watermark_text: string | null;
};

export default function FileViewerPage() {
  // LocaleProvider initialises i18next inside a useEffect; useTranslation
  // called before that fires returns the keys verbatim. Gate the inner
  // component on isReady so every translation call sees a live instance.
  const { isReady } = useLocale();
  if (!isReady) {
    return (
      <div className="min-h-screen bg-ink text-cream flex items-center justify-center">
        <div className="text-cream/60 text-sm tracking-widest uppercase">Loading</div>
      </div>
    );
  }
  return <FileViewerInner />;
}

function FileViewerInner() {
  const router = useRouter();
  const { t } = useTranslation('files');
  const { id } = router.query;
  const [data, setData] = useState<ViewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  const [shortcutToast, setShortcutToast] = useState<string | null>(null);
  const [renderNonce, setRenderNonce] = useState(0); // bump to force PdfRenderer remount on retry
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Load + expiry refresh.
  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setError(t('viewer.denied'));
          setAuthReady(true);
          return;
        }
        const res = await fetch(`/api/files/${id}/view-url`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) setError(t('viewer.denied'));
          else setError(t('viewer.expired'));
          setAuthReady(true);
          return;
        }
        const payload = (await res.json()) as ViewPayload;
        setData(payload);
        setAuthReady(true);
        // Refresh the URL ~5s before expiry so the renderer survives.
        const ms = Math.max(15_000, new Date(payload.expires_at).getTime() - Date.now() - 5_000);
        timer = setTimeout(load, ms);
      } catch {
        setError(t('viewer.expired'));
        setAuthReady(true);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, t]);

  // DevTools detection — heuristic via window dimensions.
  useEffect(() => {
    function check() {
      try {
        const wDelta = window.outerWidth - window.innerWidth;
        const hDelta = window.outerHeight - window.innerHeight;
        const open = wDelta > 200 || hDelta > 250;
        setDevtoolsOpen(open);
      } catch { /* ignore */ }
    }
    check();
    const interval = setInterval(check, 1000);
    window.addEventListener('resize', check);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', check);
    };
  }, []);

  // Right-click + keyboard interceptors at the document level.
  useEffect(() => {
    function onContext(e: MouseEvent) { e.preventDefault(); }
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === 's' || k === 'p' || k === 'a') {
        e.preventDefault();
        setShortcutToast(t('viewer.no_download'));
        setTimeout(() => setShortcutToast(null), 2400);
      }
    }
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('contextmenu', onContext);
      document.removeEventListener('keydown', onKey);
    };
  }, [t]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-ink text-cream flex items-center justify-center">
        <p className="text-sm opacity-70">{t('viewer.loading')}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-cream text-ink flex flex-col items-center justify-center p-6">
        <p className="text-sm text-ink-muted mb-4">{error ?? t('viewer.expired')}</p>
        <button onClick={() => router.reload()} className="btn-secondary text-xs">
          {t('viewer.expired') === error ? 'Refresh' : 'Try again'}
        </button>
      </div>
    );
  }

  const isImage = data.mime_type.startsWith('image/');
  const isPdf = data.mime_type === 'application/pdf';

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-ink text-cream flex flex-col select-none"
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      <header className="px-4 py-3 flex items-center justify-between border-b border-cream/10 text-xs">
        <Link href="/" className="opacity-70 hover:opacity-100">crestio</Link>
        <span className="opacity-60">{t('viewer.no_download')}</span>
      </header>

      <main className="flex-1 relative overflow-hidden">
        <div
          className={`absolute inset-0 transition-[filter] ${devtoolsOpen ? 'blur-md pointer-events-none' : ''}`}
        >
          {isPdf && (
            <PdfRenderer
              key={`${data.signed_url}::${renderNonce}`}
              url={data.signed_url}
              loadingLabel={t('viewer.loading')}
              errorLabel={t('viewer.unable_to_load')}
              retryLabel={t('viewer.refresh')}
              onRetry={() => setRenderNonce((n) => n + 1)}
            />
          )}
          {isImage && (
            <div className="w-full h-full overflow-auto flex items-center justify-center bg-ink">
              <img
                src={data.signed_url}
                alt=""
                className="max-w-full h-auto pointer-events-none"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
              />
            </div>
          )}
          {!isPdf && !isImage && (
            <div className="flex items-center justify-center h-full text-cream/70 text-sm p-8 text-center">
              {t('viewer.expired')}
            </div>
          )}
        </div>

        {data.watermark_text && (
          <Watermark text={data.watermark_text} />
        )}

        {devtoolsOpen && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-ink/70">
            <div className="max-w-md">
              <p className="text-sm">{t('viewer.devtools_warning')}</p>
            </div>
          </div>
        )}

        {shortcutToast && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-cream text-ink px-4 py-2 rounded-full text-xs shadow-lift">
            {shortcutToast}
          </div>
        )}
      </main>
    </div>
  );
}

function Watermark({ text }: { text: string }) {
  // Repeat the watermark text in a 5×4 grid, rotated, to cover the viewport.
  const rows = Array.from({ length: 5 });
  const cols = Array.from({ length: 4 });
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 30 }}
    >
      <div className="w-full h-full flex flex-col justify-around">
        {rows.map((_, ri) => (
          <div key={ri} className="flex justify-around" style={{ transform: 'rotate(-25deg)' }}>
            {cols.map((__, ci) => (
              <span
                key={ci}
                className="text-[10px] uppercase tracking-widest"
                style={{
                  color: 'rgba(20,20,20,0.18)',
                  mixBlendMode: 'multiply',
                  whiteSpace: 'nowrap',
                  textShadow: '0 0 1px rgba(255,255,255,0.4)',
                }}
              >
                {text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
