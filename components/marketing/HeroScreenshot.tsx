import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// SVG-based mock of the Crestio dashboard. Resolution-independent, lightweight,
// and matches the actual app layout (stat cards row + Today timeline + Needs
// attention nudges). Replace with a real screenshot in /public/marketing once
// available.
export default function HeroScreenshot() {
  const { t } = useTranslation('marketing');
  const [hovered, setHovered] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 200);
    return () => clearTimeout(id);
  }, []);

  return (
    <div
      className={[
        'relative max-w-5xl mx-auto transition-all ease-out',
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
      ].join(' ')}
      style={{
        transitionDuration: '600ms',
        filter: 'drop-shadow(0 24px 64px rgba(0,0,0,0.10)) drop-shadow(0 4px 16px rgba(0,0,0,0.04))',
      }}
    >
      <div className="rounded-xl overflow-hidden border border-rule bg-surface transition-transform duration-200 hover:-translate-y-1">
        <div className="bg-cream border-b border-rule px-4 py-2.5 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-claret/40" />
          <span className="w-3 h-3 rounded-full bg-amber/40" />
          <span className="w-3 h-3 rounded-full bg-success/40" />
          <div className="ml-3 px-3 py-1 rounded bg-ruleSoft text-2xs text-ink-soft font-mono flex-1 max-w-md mx-auto text-center">
            crestio.ai/app
          </div>
        </div>

        <div className="bg-cream flex" style={{ minHeight: '420px' }}>
          <aside className="hidden md:flex w-44 flex-col bg-surface border-r border-rule px-3 py-4 gap-1">
            <div className="px-2 mb-2 font-display text-base tracking-tightest">
              crest<span className="italic text-forest">io</span>
            </div>
            {['Home', 'Sessions', 'People', 'Money', 'Resources', 'Messages', 'Settings'].map((label, i) => (
              <div
                key={label}
                className={[
                  'px-2 py-1.5 text-2xs rounded flex items-center gap-2',
                  i === 0 ? 'bg-forest/8 text-ink font-medium' : 'text-ink-muted',
                ].join(' ')}
              >
                <span className={`w-3 h-3 rounded-sm ${i === 0 ? 'bg-forest/30' : 'bg-rule'}`} />
                {label}
              </div>
            ))}
            <div className="mt-auto px-2 py-1.5 text-2xs text-ink-soft border-t border-rule pt-3 mt-3">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-forest/20 flex items-center justify-center text-forest font-medium text-[8px]">LJ</div>
                <span>Lenin J.</span>
              </div>
            </div>
          </aside>

          <main className="flex-1 p-4 md:p-6 space-y-4">
            <div>
              <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1">Tuesday, 28 Apr</div>
              <div className="font-display text-lg md:text-xl tracking-tightest text-ink">Good morning, Lenin.</div>
            </div>

            <div className="grid grid-cols-4 gap-2.5" data-hotspot-target="today">
              {[
                { label: 'Sessions today', value: '5', tone: 'forest' },
                { label: 'To polish', value: '3', tone: 'amber' },
                { label: 'Unbilled', value: '$420', tone: 'ink' },
                { label: 'Overdue', value: '1', tone: 'claret' },
              ].map((s) => (
                <div key={s.label} className="rounded border border-rule bg-surface p-2.5">
                  <div className="text-[8px] uppercase tracking-widest text-ink-soft mb-1 truncate">{s.label}</div>
                  <div
                    className={[
                      'font-display text-base md:text-lg tracking-tightest tabular-nums',
                      s.tone === 'forest' ? 'text-forest-ink' :
                      s.tone === 'amber' ? 'text-amber-ink' :
                      s.tone === 'claret' ? 'text-claret' : 'text-ink',
                    ].join(' ')}
                  >
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded border border-rule bg-surface" data-hotspot-target="today-list">
              <div className="px-3 py-2 border-b border-rule flex items-center justify-between">
                <div className="text-2xs font-medium text-ink">Today</div>
                <div className="text-[8px] text-ink-soft uppercase tracking-widest">5 sessions · 4.5h</div>
              </div>
              <div className="divide-y divide-ruleSoft">
                {[
                  { time: '3:00', name: 'Hector P.', subj: 'HSC English', state: 'now' },
                  { time: '4:30', name: 'Mei L.', subj: 'Yr 11 Adv Eng', state: 'next' },
                  { time: '6:00', name: 'James W.', subj: 'Yr 12 Std Eng', state: 'later' },
                  { time: '7:30', name: 'Olivia D.', subj: 'HSC Adv Eng', state: 'later' },
                ].map((row) => (
                  <div key={row.time} className="px-3 py-2 flex items-center gap-3 text-2xs">
                    <div className="w-9 font-mono tabular-nums text-ink-muted">{row.time}</div>
                    <div className="w-1 self-stretch rounded-full bg-forest/30" />
                    <div className="flex-1 min-w-0">
                      <div className="text-ink font-medium truncate">{row.name}</div>
                      <div className="text-ink-soft text-[9px] truncate">{row.subj}</div>
                    </div>
                    {row.state === 'now' && (
                      <span className="px-1.5 py-0.5 rounded bg-forest/15 text-forest-ink text-[8px] uppercase tracking-widest">Now</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded border border-amber/30 bg-amber-soft/30 p-2.5" data-hotspot-target="polish">
                <div className="text-[8px] uppercase tracking-widest text-amber-ink mb-1">Needs polish</div>
                <div className="text-2xs text-ink leading-snug">3 sessions ready to polish · est. 2 min</div>
              </div>
              <div className="rounded border border-rule bg-surface p-2.5" data-hotspot-target="invoice">
                <div className="text-[8px] uppercase tracking-widest text-ink-soft mb-1">Ready to invoice</div>
                <div className="text-2xs text-ink leading-snug">8 unbilled sessions · $420</div>
              </div>
            </div>
          </main>
        </div>
      </div>

      <div className="hidden md:block absolute inset-0 pointer-events-none">
        <Hotspot target="today" label={t('hero.hotspot_today')} top="22%" left="58%" hovered={hovered} setHovered={setHovered} />
        <Hotspot target="polish" label={t('hero.hotspot_polish')} top="78%" left="34%" hovered={hovered} setHovered={setHovered} />
        <Hotspot target="invoice" label={t('hero.hotspot_invoice')} top="78%" left="68%" hovered={hovered} setHovered={setHovered} />
        <Hotspot target="today-list" label={t('hero.hotspot_pay')} top="55%" left="22%" hovered={hovered} setHovered={setHovered} />
      </div>
    </div>
  );
}

function Hotspot({
  target, label, top, left, hovered, setHovered,
}: {
  target: string;
  label: string;
  top: string;
  left: string;
  hovered: string | null;
  setHovered: (v: string | null) => void;
}) {
  const isOpen = hovered === target;
  return (
    <div
      className="absolute pointer-events-auto"
      style={{ top, left }}
      onMouseEnter={() => setHovered(target)}
      onMouseLeave={() => setHovered(null)}
    >
      <button
        type="button"
        className="w-3 h-3 rounded-full bg-forest border-2 border-cream relative -translate-x-1/2 -translate-y-1/2"
        aria-label={label}
      >
        <span className="absolute inset-0 rounded-full bg-forest animate-ping opacity-40" />
      </button>
      {isOpen && (
        <div className="absolute top-3 left-3 px-2.5 py-1.5 rounded bg-ink text-cream text-2xs whitespace-nowrap z-10 animate-fade-in">
          {label}
        </div>
      )}
    </div>
  );
}
