import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAssistantConversation } from '../lib/assistantConversation';
import { supabase } from '../lib/supabase';

// Floating "Ask your assistant" button.
// Positioning (Session 13C hotfix):
//   Desktop (md+): bottom 24px right 24px, 56px
//   Mobile:        bottom 80px right 16px, 48px (clears the 64px bottom tab bar + 16px breathing)
// Hidden when:
//   - the assistant panel is open (on mobile, prevents double-render flicker)
//   - on the /app mobile dashboard (the quick-log FAB wins that slot)
//   - the soft keyboard is open (visualViewport height < window.innerHeight by >150px)

const HINT_DISMISSED_KEY = 'crestio.assistant.launcher-hint-dismissed';

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches;
}

function detectKeyboardOpen(): boolean {
  if (typeof window === 'undefined' || !window.visualViewport) return false;
  return window.innerHeight - window.visualViewport.height > 150;
}

export function AssistantLauncher() {
  const router = useRouter();
  const { isOpen, openPanel } = useAssistantConversation();
  const [signedIn, setSignedIn] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [pulse, setPulse] = useState(true);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSignedIn(!!session));
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 10_000);
    return () => clearTimeout(t);
  }, [pulse]);

  useEffect(() => {
    if (!signedIn) return;
    try {
      const dismissed = window.localStorage.getItem(HINT_DISMISSED_KEY) === 'true';
      if (!dismissed) setHintVisible(true);
    } catch { /* ignore */ }
  }, [signedIn]);

  useEffect(() => {
    if (isOpen && hintVisible) dismissHint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function dismissHint() {
    setHintVisible(false);
    try { window.localStorage.setItem(HINT_DISMISSED_KEY, 'true'); } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!signedIn) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/assistant/usage', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setUsage(await res.json());
      } catch { /* ignore */ }
    })();
  }, [signedIn, isOpen]);

  // Track viewport width + soft-keyboard visibility.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsMobile(isMobileViewport());
    const mq = window.matchMedia('(max-width: 767px)');
    const onMq = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    // Safari on iOS doesn't support addEventListener on MediaQueryList until 14.
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else mq.addListener(onMq);

    const vv = window.visualViewport;
    if (vv) {
      const onVvResize = () => setKeyboardOpen(detectKeyboardOpen());
      vv.addEventListener('resize', onVvResize);
      setKeyboardOpen(detectKeyboardOpen());
      return () => {
        if (mq.removeEventListener) mq.removeEventListener('change', onMq);
        else mq.removeListener(onMq);
        vv.removeEventListener('resize', onVvResize);
      };
    }
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onMq);
      else mq.removeListener(onMq);
    };
  }, []);

  if (!signedIn) return null;

  // Hide rules.
  const onMobileDashboard = isMobile && router.pathname === '/app';
  if (onMobileDashboard) return null;         // quick-log FAB owns this slot
  if (isMobile && isOpen) return null;         // panel covers viewport — avoid flicker
  if (isMobile && keyboardOpen) return null;   // don't float over the keyboard

  // Sizing + positioning per spec. Explicit pixel values — Tailwind's
  // bottom-20 (5rem = 80px) matches, but we want to be unambiguous here.
  const sizeClass = 'h-14 w-14 md:h-14 md:w-14';
  const mobileSize = 'h-12 w-12';
  const sizeFinal = isMobile ? mobileSize : sizeClass;

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-label="Ask your assistant"
        className={[
          'fixed z-20 rounded-full bg-forest text-cream shadow-lift',
          'hover:bg-forest-ink transition-colors flex items-center justify-center',
          sizeFinal,
          pulse && !isOpen ? 'assistant-pulse' : '',
        ].filter(Boolean).join(' ')}
        style={{
          bottom: isMobile ? 80 : 24,
          right: isMobile ? 16 : 24,
        }}
        title="Ask your assistant"
      >
        <svg width={isMobile ? 22 : 26} height={isMobile ? 22 : 26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a7 7 0 0 0-5.2 11.7L5 20l5-1a7 7 0 1 0 2-16z"/>
          <path d="M10 11.5L12 14l4-4"/>
        </svg>
      </button>

      {/* First-time discovery hint — anchored above the launcher's bottom. */}
      {hintVisible && !isOpen && (
        <div
          className="fixed z-20 max-w-[300px] bg-surface border border-rule rounded-lg shadow-lift p-3 animate-fade-in"
          role="status"
          style={{
            bottom: isMobile ? 80 + 48 + 12 : 24 + 56 + 12,
            right: isMobile ? 16 : 24,
          }}
        >
          <div className="flex items-start gap-2">
            <div className="text-sm text-ink leading-snug">
              Try asking me to log a session, draft an invoice, or tell you who hasn't paid. →
            </div>
            <button
              type="button"
              onClick={dismissHint}
              aria-label="Dismiss hint"
              className="text-ink-soft hover:text-ink -mt-1 -mr-1 shrink-0"
            >×</button>
          </div>
          {usage && (
            <div className="text-2xs text-ink-soft mt-2">
              {usage.used} / {usage.limit} today · resets at midnight Sydney time
            </div>
          )}
        </div>
      )}

      <style jsx global>{`
        @keyframes assistant-pulse-kf {
          0%, 100% { box-shadow: 0 0 0 0 rgba(31, 58, 46, 0.45); }
          50% { box-shadow: 0 0 0 10px rgba(31, 58, 46, 0); }
        }
        .assistant-pulse { animation: assistant-pulse-kf 1.8s ease-in-out infinite; }
      `}</style>
    </>
  );
}

export default AssistantLauncher;
