import { useState } from 'react';

const COLORS: { name: string; value: string; usage: string }[] = [
  { name: 'Forest', value: '#1F3A2E', usage: 'Primary actions, links, brand accent' },
  { name: 'Forest soft', value: '#E8EEE8', usage: 'Highlight backgrounds' },
  { name: 'Cream', value: '#FAFAF8', usage: 'Page background' },
  { name: 'Ink', value: '#0F1714', usage: 'Primary text' },
  { name: 'Ink muted', value: '#6B6F6A', usage: 'Secondary text, labels' },
  { name: 'Rule', value: '#EAEAE6', usage: 'Borders, dividers' },
  { name: 'Success', value: '#2F7D4F', usage: 'Positive status' },
  { name: 'Amber', value: '#B8860B', usage: 'Warnings, action needed' },
  { name: 'Claret', value: '#7A2233', usage: 'Errors, overdue' },
];

const LOGO_FILES = [
  { label: 'Logo · light · SVG', href: '/marketing/brand/crestio-light.svg', kind: 'svg' },
  { label: 'Logo · dark · SVG', href: '/marketing/brand/crestio-dark.svg', kind: 'svg' },
  { label: 'Logo · monochrome · SVG', href: '/marketing/brand/crestio-mono.svg', kind: 'svg' },
];

export default function BrandKit() {
  return (
    <>
      <Section title="Logo">
        <p className="text-sm text-ink-muted leading-relaxed mb-5 max-w-prose">
          The wordmark is set in Fraunces Italic for the "io" — never the whole word. Two-tone forest green on cream is the default. Keep clear space of one cap-height around the mark.
        </p>
        <div className="rounded-md border border-rule bg-cream px-8 py-12 mb-5 grid place-items-center">
          <div className="font-display text-6xl md:text-7xl tracking-tightest">
            crest<span className="italic text-forest">io</span>
          </div>
        </div>
        <ul className="grid sm:grid-cols-2 gap-3">
          {LOGO_FILES.map((f) => (
            <li key={f.href}>
              <a
                href={f.href}
                download
                className="flex items-center justify-between rounded border border-rule bg-surface px-4 py-3 text-sm hover:bg-ruleSoft transition-colors"
              >
                <span className="text-ink">{f.label}</span>
                <span className="text-2xs uppercase tracking-widest text-ink-soft">{f.kind}</span>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Color">
        <p className="text-sm text-ink-muted leading-relaxed mb-5 max-w-prose">
          Forest green is the only brand accent. Use it for primary buttons, active navigation, and key data points — nowhere else.
        </p>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {COLORS.map((c) => (
            <ColorSwatch key={c.value} {...c} />
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="space-y-6">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2">Display · Fraunces</div>
            <div className="font-display text-3xl md:text-4xl tracking-tighter text-ink">Fraunces — for headlines, brand mark, hero numbers</div>
          </div>
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2">Sans · IBM Plex Sans</div>
            <div className="text-xl text-ink">IBM Plex Sans — for body, labels, UI</div>
          </div>
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2">Mono · IBM Plex Mono</div>
            <div className="text-base font-mono text-ink">IBM Plex Mono — for code, status, IDs</div>
          </div>
        </div>
      </Section>

      <Section title="Embed badge">
        <p className="text-sm text-ink-muted leading-relaxed mb-5 max-w-prose">
          Drop a "Powered by Crestio" badge on your tutoring website. We don't track visitors who load the badge — it's a static SVG.
        </p>
        <div className="rounded-md border border-rule bg-cream p-6 mb-5 grid place-items-center">
          <a
            href="https://crestio.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-4 py-2 text-2xs text-ink-muted no-underline hover:border-forest/40 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-forest" />
            <span>Powered by</span>
            <span className="font-display text-sm tracking-tightest text-ink">crest<span className="italic text-forest">io</span></span>
          </a>
        </div>
        <CopyBlock label="HTML" value={EMBED_HTML} />
      </Section>

      <Section title="What not to do">
        <ul className="text-sm text-ink-muted leading-relaxed space-y-2 list-disc pl-5">
          <li>Don't recolor the wordmark. Forest green or monochrome only.</li>
          <li>Don't render the wordmark below 24px tall — the italic "io" loses fidelity.</li>
          <li>Don't tilt, skew, drop-shadow, or outline the mark.</li>
          <li>Don't use the wordmark to imply endorsement of a third-party product.</li>
        </ul>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-14 md:mb-16">
      <h2 className="font-display text-2xl tracking-tighter text-ink mb-5">{title}</h2>
      {children}
    </section>
  );
}

function ColorSwatch({ name, value, usage }: { name: string; value: string; usage: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="text-left rounded-md border border-rule bg-surface overflow-hidden hover:bg-ruleSoft/40 transition-colors"
    >
      <div className="h-20" style={{ backgroundColor: value }} />
      <div className="p-3">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <div className="text-sm font-medium text-ink">{name}</div>
          <code className="text-2xs font-mono text-ink-muted">{copied ? 'Copied' : value}</code>
        </div>
        <div className="text-2xs text-ink-soft leading-relaxed">{usage}</div>
      </div>
    </button>
  );
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="rounded-md border border-rule bg-ink/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-rule bg-cream">
        <span className="text-2xs uppercase tracking-widest text-ink-soft">{label}</span>
        <button type="button" onClick={copy} className="text-2xs text-forest hover:underline">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-2xs font-mono text-ink overflow-x-auto whitespace-pre-wrap break-all">
        <code>{value}</code>
      </pre>
    </div>
  );
}

const EMBED_HTML = `<a href="https://crestio.ai" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid #EAEAE6;border-radius:999px;background:#FFF;color:#6B6F6A;font:500 12px/1 'IBM Plex Sans',system-ui,sans-serif;text-decoration:none;">
  <span style="width:6px;height:6px;border-radius:999px;background:#1F3A2E"></span>
  Powered by <strong style="color:#0F1714;font-weight:600;letter-spacing:-0.02em">crestio</strong>
</a>`;
