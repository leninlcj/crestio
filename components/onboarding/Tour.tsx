import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

// First-run guided tour — 4 steps, soft spotlight + tooltip.
// Each step targets a CSS selector. We position the tooltip relative to the
// element's rect, recalculated on resize / scroll.

type Step = {
  id: string;
  selector: string;
  title: string;
  body: string;
  placement: 'top' | 'bottom' | 'right' | 'left';
};

const STEPS: Step[] = [
  {
    id: 'dashboard',
    selector: '[data-tour="today-timeline"]',
    title: 'Your home base',
    body: 'Today\'s sessions live here. Past, current, and upcoming — at a glance.',
    placement: 'bottom',
  },
  {
    id: 'quick-log',
    selector: '[data-tour="quick-log"]',
    title: 'Press N from anywhere',
    body: 'Log a session in 8 seconds. Type "Tue 4pm Hector 1h" — Crestio parses the rest.',
    placement: 'bottom',
  },
  {
    id: 'polish',
    selector: '[data-tour="polish-card"]',
    title: 'Polish, then send',
    body: 'After a session, polish your rough notes. The AI keeps your voice — you don\'t sound like a robot.',
    placement: 'left',
  },
  {
    id: 'invoices',
    selector: '[data-tour="invoices-card"]',
    title: 'Invoice in one tap',
    body: 'Send an invoice. Parents pay by card. Money lands in 2 days. That\'s the loop.',
    placement: 'left',
  },
];

type Props = {
  active: boolean;
  onComplete: () => void;
};

export default function Tour({ active, onComplete }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const stepRef = useRef(stepIdx);
  stepRef.current = stepIdx;

  const updateRect = useCallback(() => {
    const step = STEPS[stepRef.current];
    if (!step) { setRect(null); return; }
    const el = document.querySelector(step.selector);
    if (!el) { setRect(null); return; }
    setRect(el.getBoundingClientRect());
  }, []);

  useEffect(() => {
    if (!active) return;
    updateRect();
    const handle = () => updateRect();
    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true);
    const id = setInterval(updateRect, 600);
    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
      clearInterval(id);
    };
  }, [active, stepIdx, updateRect]);

  // Persist completion server-side.
  const finishTour = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase
        .from('profiles')
        .update({ tour_completed_at: new Date().toISOString() })
        .eq('id', session.user.id);
    }
    onComplete();
  }, [onComplete]);

  function next() {
    if (stepIdx >= STEPS.length - 1) {
      finishTour();
    } else {
      setStepIdx((i) => i + 1);
    }
  }
  function skip() {
    finishTour();
  }

  if (!active) return null;
  const step = STEPS[stepIdx];

  if (!rect) {
    // Element not on page — render a centered welcome card instead.
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/40 animate-fade-in">
        <div className="max-w-sm mx-4 bg-surface border border-rule rounded-lg shadow-lift p-6 animate-slide-up">
          <div className="text-2xs uppercase tracking-widest text-forest mb-2">Welcome</div>
          <h2 className="font-display text-xl tracking-tightest text-ink mb-2 leading-tight">{step.title}</h2>
          <p className="text-sm text-ink-muted leading-relaxed mb-5">{step.body}</p>
          <div className="flex items-center justify-between">
            <button type="button" onClick={skip} className="text-2xs text-ink-soft hover:text-ink">Skip tour</button>
            <button type="button" onClick={next} className="btn-primary text-xs px-4 h-8 min-h-[32px]">
              {stepIdx >= STEPS.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Spotlight: 4 backdrop rectangles around the target element, leaving a hole.
  // Plus a soft pulse outline on the target itself.
  const pad = 8;
  const top = Math.max(0, rect.top - pad);
  const left = Math.max(0, rect.left - pad);
  const width = rect.width + pad * 2;
  const height = rect.height + pad * 2;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  // Tooltip placement.
  let tooltipStyle: React.CSSProperties = {};
  switch (step.placement) {
    case 'bottom':
      tooltipStyle = { top: top + height + 12, left: Math.min(vw - 340, Math.max(16, left)) };
      break;
    case 'top':
      tooltipStyle = { top: Math.max(16, top - 200), left: Math.min(vw - 340, Math.max(16, left)) };
      break;
    case 'right':
      tooltipStyle = { top: Math.min(vh - 200, top), left: Math.min(vw - 340, left + width + 12) };
      break;
    case 'left':
      tooltipStyle = { top: Math.min(vh - 200, top), left: Math.max(16, left - 332) };
      break;
  }

  return (
    <>
      {/* Backdrop with a hole */}
      <div className="fixed inset-0 z-[100] pointer-events-none animate-fade-in">
        <div className="absolute bg-ink/40 pointer-events-auto" style={{ top: 0, left: 0, right: 0, height: top }} onClick={skip} />
        <div className="absolute bg-ink/40 pointer-events-auto" style={{ top, left: 0, width: left, height }} onClick={skip} />
        <div className="absolute bg-ink/40 pointer-events-auto" style={{ top, left: left + width, right: 0, height }} onClick={skip} />
        <div className="absolute bg-ink/40 pointer-events-auto" style={{ top: top + height, left: 0, right: 0, bottom: 0 }} onClick={skip} />
        <div
          className="absolute rounded-md ring-2 ring-forest tour-pulse"
          style={{ top, left, width, height }}
          aria-hidden
        />
      </div>

      {/* Tooltip */}
      <div
        className="fixed z-[101] w-[320px] max-w-[calc(100vw-32px)] bg-surface border border-rule rounded-lg shadow-lift p-5 animate-slide-up"
        style={tooltipStyle}
      >
        <div className="text-2xs uppercase tracking-widest text-forest mb-1.5">Step {stepIdx + 1} of {STEPS.length}</div>
        <h3 className="font-display text-base tracking-tightest text-ink mb-1.5 leading-tight">{step.title}</h3>
        <p className="text-sm text-ink-muted leading-relaxed mb-4">{step.body}</p>
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={skip} className="text-2xs text-ink-soft hover:text-ink">Skip tour</button>
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={['w-1.5 h-1.5 rounded-full', i === stepIdx ? 'bg-forest' : 'bg-rule'].join(' ')}
                aria-hidden
              />
            ))}
            <button type="button" onClick={next} className="btn-primary text-2xs px-3 h-8 min-h-[32px] ml-2">
              {stepIdx >= STEPS.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes tour-pulse-kf {
          0%, 100% { box-shadow: 0 0 0 4px rgba(31,58,46,0.10); }
          50% { box-shadow: 0 0 0 12px rgba(31,58,46,0.04); }
        }
        :global(.tour-pulse) {
          animation: tour-pulse-kf 1.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.tour-pulse) { animation: none; }
        }
      `}</style>
    </>
  );
}
