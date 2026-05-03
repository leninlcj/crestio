import { useEffect, useState } from 'react';

// Ambient illustration for the empty messages inbox. Three message-shaped
// cards in muted forest, drifting gently on first sign-in, static after.
// Pauses entirely under prefers-reduced-motion.
const SEEN_KEY = 'crestio.ambient_inbox.seen';

type Props = {
  className?: string;
  caption?: string;
};

export function AmbientInbox({ className, caption = "Nothing here. Yet." }: Props) {
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = window.localStorage.getItem(SEEN_KEY) === '1';
    if (seen) return;
    setAnimate(true);
    const t = setTimeout(() => {
      try { window.localStorage.setItem(SEEN_KEY, '1'); } catch { /* */ }
    }, 9000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={['relative flex flex-col items-center justify-center py-16 px-4', className ?? ''].join(' ')}
      aria-hidden="true"
    >
      <div className="relative w-[220px] h-[120px]">
        <div
          className={[
            'absolute left-2 top-6 w-[120px] h-[64px] rounded-md bg-forest-soft/70 border border-forest/15',
            animate ? 'ambient-card-a' : '',
          ].join(' ')}
          style={{ transform: 'rotate(-8deg)' }}
        />
        <div
          className={[
            'absolute left-12 top-2 w-[120px] h-[64px] rounded-md bg-forest-soft/85 border border-forest/20',
            animate ? 'ambient-card-b' : '',
          ].join(' ')}
        />
        <div
          className={[
            'absolute left-20 top-10 w-[120px] h-[64px] rounded-md bg-forest-soft border border-forest/25',
            animate ? 'ambient-card-c' : '',
          ].join(' ')}
          style={{ transform: 'rotate(6deg)' }}
        />
      </div>
      <div className="text-sm text-ink mt-6 font-display">{caption}</div>
      <div className="text-xs text-ink-muted mt-1">
        Parents reach you here. They get an email; you reply in the app.
      </div>
      <style jsx>{`
        @keyframes ambient-drift-a {
          0%, 100% { transform: rotate(-8deg) translateY(0); }
          50%      { transform: rotate(-7deg) translateY(-3px); }
        }
        @keyframes ambient-drift-b {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(2px); }
        }
        @keyframes ambient-drift-c {
          0%, 100% { transform: rotate(6deg) translateY(0); }
          50%      { transform: rotate(7deg) translateY(-2px); }
        }
        .ambient-card-a { animation: ambient-drift-a 8s ease-in-out infinite; }
        .ambient-card-b { animation: ambient-drift-b 8s ease-in-out infinite 1s; }
        .ambient-card-c { animation: ambient-drift-c 8s ease-in-out infinite 0.5s; }
        @media (prefers-reduced-motion: reduce) {
          .ambient-card-a, .ambient-card-b, .ambient-card-c { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

export default AmbientInbox;
