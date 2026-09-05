// Protected file viewer — PDF (pdf.js canvas) or image (img). Authenticated.
//
// Layered protections (best-effort, not absolute — a determined user can still
// screenshot, but these stop casual saving):
//   • Server returns a 60s signed URL via /api/files/[id]/view-url and writes
//     the file_views audit row before responding.
//   • PDFs render via pdf.js (react-pdf) onto <canvas> elements — no iframe,
//     no native browser PDF toolbar, no Chrome iframe-PDF block.
//   • Right-click suppressed everywhere; Cmd/Ctrl+S/P/A intercepted.
//   • Watermark overlay shows viewer email + ISO timestamp, refreshed every
//     60s, repeating diagonally across the viewport, pointer-events: none.
//   • DevTools heuristic: outerWidth - innerWidth > 200 (panel docked) blurs
//     the file. Imperfect — enough to make screen recording awkward.
//   • Idle timeout: 30+ minutes of no interaction blurs and prompts refresh.
//
// The page is split into outer/inner: the outer waits for the LocaleProvider
// to finish booting i18n before rendering the inner — otherwise
// useTranslation runs against an uninitialized i18next instance and falls
// back to the raw keys.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useLocale } from '../../lib/localeContext';

const PdfRenderer = dynamic(
  () => import('../../components/files/PdfRenderer').then((m) => m.PdfRenderer),
  { ssr: false },
);

type ViewPayload = {
  signed_url: string;
  expires_at: string;
  mime_type: string;
  watermark_text: string | null;
  allow_printing: boolean;
  display_name: string | null;
  organization_name: string | null;
  tutor_name: string | null;
};

const IDLE_BLUR_MS = 30 * 60 * 1000;

export default function FileViewerPage() {
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
  const [idleBlur, setIdleBlur] = useState(false);
  const [renderNonce, setRenderNonce] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bump `now` once a minute so the watermark timestamp updates.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Idle blur: 30 minutes since the last user interaction. Reset on any
  // pointer/key/scroll/visibility activity.
  useEffect(() => {
    function reset() {
      setIdleBlur(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setIdleBlur(true), IDLE_BLUR_MS);
    }
    reset();
    const events: (keyof DocumentEventMap | keyof WindowEventMap)[] =
      ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'visibilitychange'];
    for (const ev of events) document.addEventListener(ev as any, reset, { passive: true });
    return () => {
      for (const ev of events) document.removeEventListener(ev as any, reset);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

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

  const allowPrinting = data?.allow_printing === true;
  useEffect(() => {
    if (allowPrinting) return;
    function onContext(e: MouseEvent) { e.preventDefault(); }
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === 's' || k === 'p' || k === 'a') {
        e.preventDefault();
      }
    }
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('contextmenu', onContext);
      document.removeEventListener('keydown', onKey);
    };
  }, [allowPrinting]);

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
          {t('viewer.refresh', { defaultValue: 'Refresh' })}
        </button>
      </div>
    );
  }

  const isImage = data.mime_type.startsWith('image/');
  const isPdf = data.mime_type === 'application/pdf';
  const tutorOrPractice = data.organization_name ?? data.tutor_name ?? '';
  const tutorInitials = data.tutor_name
    ? data.tutor_name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : (data.organization_name?.[0] ?? '·').toUpperCase();

  const blurred = devtoolsOpen || idleBlur;

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-ink text-cream flex flex-col select-none"
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      <header className="px-4 md:px-6 py-3 flex items-center justify-between border-b border-cream/10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-cream/10 text-cream/90 flex items-center justify-center font-display text-xs tracking-tightest shrink-0">
            {tutorInitials}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-cream truncate">{tutorOrPractice || ' '}</div>
            {data.display_name && (
              <div className="text-2xs text-cream/50 truncate">{data.display_name}</div>
            )}
          </div>
        </div>
        <div className="text-2xs uppercase tracking-widest text-cream/40 shrink-0">
          {t('viewer.private_label', { defaultValue: 'Private · view only' })}
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden">
        <div
          className={`absolute inset-0 transition-[filter] duration-300 ${blurred ? 'blur-md pointer-events-none' : ''}`}
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
                style={{
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                }}
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
          <Watermark text={data.watermark_text} now={now} />
        )}

        {devtoolsOpen && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-ink/70">
            <div className="max-w-md">
              <p className="text-sm">{t('viewer.devtools_warning')}</p>
            </div>
          </div>
        )}

        {!devtoolsOpen && idleBlur && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-ink/85">
            <div className="max-w-md">
              <p className="text-base text-cream font-display tracking-tightest mb-3">
                {t('viewer.idle_title', { defaultValue: 'Still here?' })}
              </p>
              <p className="text-sm text-cream/70 mb-5">
                {t('viewer.idle_body', { defaultValue: "Refresh to keep viewing; the link has been idle for a while." })}
              </p>
              <button
                type="button"
                onClick={() => { setIdleBlur(false); router.reload(); }}
                className="bg-cream text-ink text-sm px-5 h-10 min-h-[40px] inline-flex items-center justify-center rounded font-medium"
              >
                {t('viewer.refresh', { defaultValue: 'Refresh' })}
              </button>
            </div>
          </div>
        )}
      </main>

      {data.tutor_name && (
        <footer className="px-4 md:px-6 py-3 border-t border-cream/10 flex items-center justify-between gap-3 text-2xs text-cream/50">
          <span>
            {t('viewer.shared_by', { defaultValue: 'Shared by {{name}}', name: data.tutor_name })}
          </span>
          <span className="uppercase tracking-widest">crestio</span>
        </footer>
      )}
    </div>
  );
}

function Watermark({ text, now }: { text: string; now: number }) {
  // Repeat the watermark text in a tighter grid (~240px spacing). Re-renders
  // each minute as `now` updates, with the timestamp visible in the text.
  const stamp = new Date(now).toISOString().slice(0, 16);
  const fullText = `${text} · ${stamp}`;
  const rows = Array.from({ length: 6 });
  const cols = Array.from({ length: 5 });
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 30 }}
    >
      <div className="w-full h-full flex flex-col justify-around" style={{ transform: 'rotate(-30deg) scale(1.4)' }}>
        {rows.map((_, ri) => (
          <div key={ri} className="flex justify-around">
            {cols.map((__, ci) => (
              <span
                key={ci}
                className="text-[10px] uppercase tracking-widest"
                style={{
                  color: 'rgba(20,20,20,0.08)',
                  mixBlendMode: 'multiply',
                  whiteSpace: 'nowrap',
                  textShadow: '0 0 1px rgba(255,255,255,0.4)',
                }}
              >
                {fullText}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
