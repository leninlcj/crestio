// Lightweight SVG/HTML mocks of the three core flows: log, polish, invoice.
// Resolution-independent, no images. Each visual mirrors the actual app.

type Props = { step: 'log' | 'polish' | 'invoice' };

export default function HowItWorksVisual({ step }: Props) {
  if (step === 'log') return <LogVisual />;
  if (step === 'polish') return <PolishVisual />;
  return <InvoiceVisual />;
}

function ChromeFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div
      className="rounded-md overflow-hidden border border-rule bg-surface"
    >
      <div className="bg-cream border-b border-rule px-3 py-2 flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-claret/30" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber/30" />
        <span className="w-2.5 h-2.5 rounded-full bg-success/30" />
        <span className="ml-3 text-2xs text-ink-soft font-mono">{label}</span>
      </div>
      <div className="p-5 md:p-6">{children}</div>
    </div>
  );
}

function LogVisual() {
  return (
    <ChromeFrame label="Log session">
      <div className="space-y-3">
        <div className="px-3 py-2.5 rounded border border-forest/40 bg-forest/[0.02] text-sm text-ink font-mono">
          Tue 4pm Hector 1h | Macbeth Act III essay plan
          <span className="ml-1 inline-block w-[2px] h-3.5 align-middle bg-forest animate-pulse" />
        </div>
        <div className="rounded border border-rule bg-cream/40 p-3 space-y-2">
          <div className="text-2xs uppercase tracking-widest text-ink-soft">We parsed</div>
          <div className="grid grid-cols-2 gap-2 text-2xs">
            <div className="rounded bg-surface border border-rule px-2 py-1.5">
              <div className="text-ink-soft">Student</div>
              <div className="text-ink font-medium">Hector P.</div>
            </div>
            <div className="rounded bg-surface border border-rule px-2 py-1.5">
              <div className="text-ink-soft">When</div>
              <div className="text-ink font-medium tabular-nums">Tue 28 Apr · 4:00 PM</div>
            </div>
            <div className="rounded bg-surface border border-rule px-2 py-1.5">
              <div className="text-ink-soft">Duration</div>
              <div className="text-ink font-medium tabular-nums">60 min</div>
            </div>
            <div className="rounded bg-surface border border-rule px-2 py-1.5">
              <div className="text-ink-soft">Topic</div>
              <div className="text-ink font-medium truncate">Macbeth Act III essay plan</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-primary text-2xs px-3 py-1.5 h-auto min-h-0 pointer-events-none">Save (↵)</button>
          <span className="text-2xs text-ink-soft">·</span>
          <span className="text-2xs text-ink-soft">8 seconds</span>
        </div>
      </div>
    </ChromeFrame>
  );
}

function PolishVisual() {
  return (
    <ChromeFrame label="Polish queue · 3 ready">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-rule bg-cream/40 p-3">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1.5">Your notes</div>
          <p className="text-2xs text-ink leading-relaxed">
            essay plan good. struggles with thesis statements still. need to revisit appearance vs reality next week. confident on quotations.
          </p>
        </div>
        <div className="rounded border border-forest/30 bg-forest/[0.04] p-3">
          <div className="text-2xs uppercase tracking-widest text-forest-ink mb-1.5">Polished for parent</div>
          <p className="text-2xs text-ink leading-relaxed">
            Hector worked through an Act III essay plan today. He&apos;s confident with his quotations and is identifying themes well. Next session we&apos;ll keep working on his thesis statements — that&apos;s the area where extra polish will make the biggest difference.
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-2xs text-ink-soft">Average polish time · <span className="font-mono tabular-nums">12s</span></div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-2xs px-2.5 py-1 h-auto min-h-0 pointer-events-none">Edit</button>
          <button className="btn-primary text-2xs px-2.5 py-1 h-auto min-h-0 pointer-events-none">Send to parent</button>
        </div>
      </div>
    </ChromeFrame>
  );
}

function InvoiceVisual() {
  return (
    <ChromeFrame label="Invoice · INV-204">
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-2xs text-ink-soft">Hector P. · April 2026</div>
            <div className="font-display text-xl tracking-tightest text-ink tabular-nums">$320.00</div>
          </div>
          <span className="px-2 py-1 rounded-full text-2xs font-medium" style={{ backgroundColor: 'rgba(47, 125, 79, 0.10)', color: '#1A4A2F' }}>
            Paid · 2 Apr
          </span>
        </div>

        <div className="rounded border border-rule overflow-hidden">
          {[
            { d: '4 Apr', desc: 'HSC English · 1h', amt: '$80.00' },
            { d: '11 Apr', desc: 'HSC English · 1h', amt: '$80.00' },
            { d: '18 Apr', desc: 'HSC English · 1h', amt: '$80.00' },
            { d: '25 Apr', desc: 'HSC English · 1h', amt: '$80.00' },
          ].map((row) => (
            <div key={row.d} className="px-3 py-1.5 flex items-center gap-3 text-2xs border-b border-ruleSoft last:border-b-0">
              <div className="w-12 font-mono tabular-nums text-ink-muted">{row.d}</div>
              <div className="flex-1 text-ink truncate">{row.desc}</div>
              <div className="font-mono tabular-nums text-ink">{row.amt}</div>
            </div>
          ))}
        </div>

        <div className="rounded border border-rule bg-cream/40 px-3 py-2 text-2xs flex items-center justify-between">
          <span className="text-ink-muted">Paid by card</span>
          <span className="text-ink-soft">Settled in 2 days · 1% Crestio + 2.9% Stripe</span>
        </div>
      </div>
    </ChromeFrame>
  );
}
