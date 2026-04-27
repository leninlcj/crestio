// Dynamic og-image rendering using plain SVG. No font binary dependency —
// we lean on the rasteriser (Twitter / Facebook / Slack / etc.) supplying
// system fonts via the SVG font-family chain. The brand mark uses a serif
// fallback (Georgia) so the wordmark still renders without Fraunces.
//
// Used by /api/og.ts. Each marketing page sets:
//   <meta property="og:image" content="/api/og?type=...&title=..."/>

const FOREST = '#1F3A2E';
const CREAM = '#FAFAF8';
const INK = '#0F1714';
const INK_MUTED = '#6B6F6A';

export type OgVariant =
  | 'marketing'
  | 'pricing'
  | 'customer'
  | 'changelog'
  | 'comparison'
  | 'monthly_impact'
  | 'anniversary'
  | 'referral_share';

export type OgRenderOptions = {
  type: OgVariant;
  title: string;
  subtitle?: string;
  accent?: string;
  stat?: string;
  statLabel?: string;
};

function eyebrowFor(type: OgVariant, accent?: string): string {
  switch (type) {
    case 'pricing': return 'Pricing';
    case 'customer': return accent ? `Customer · ${accent}` : 'Customer story';
    case 'changelog': return 'Changelog';
    case 'comparison': return accent ? `Crestio vs ${accent}` : 'Comparison';
    case 'monthly_impact': return accent ? `Your ${accent}` : 'Monthly impact';
    case 'anniversary': return accent ? `${accent} on Crestio` : 'Anniversary';
    case 'referral_share': return 'Crestio referral';
    case 'marketing':
    default:
      return 'Run your tutoring practice';
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Naive line-wrap based on average glyph width. Good enough for og rendering.
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && (current && words.indexOf(words[words.length - 1]) > words.indexOf(lines[maxLines - 1].split(' ').pop() ?? ''))) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\.{0,3}$/, '…');
  }
  return lines;
}

export function renderOgSvg(opts: OgRenderOptions): string {
  const eyebrow = eyebrowFor(opts.type, opts.accent);
  const showStat = !!opts.stat;
  const titleSize = showStat ? 44 : 60;
  const titleMaxChars = showStat ? 38 : 28;
  const titleLines = wrap(opts.title, titleMaxChars, 3);
  const subtitleLines = opts.subtitle ? wrap(opts.subtitle, 56, 2) : [];

  let titleY = showStat ? 360 : 320;
  const titleHTML = titleLines
    .map((line, i) => `<text x="64" y="${titleY + i * (titleSize * 1.15)}" font-family="'IBM Plex Sans', system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="${titleSize}" font-weight="700" fill="${INK}" letter-spacing="-1.5">${escapeXml(line)}</text>`)
    .join('\n');

  const subtitleY = titleY + titleLines.length * (titleSize * 1.15) + 36;
  const subtitleHTML = subtitleLines
    .map((line, i) => `<text x="64" y="${subtitleY + i * 32}" font-family="'IBM Plex Sans', system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="22" font-weight="400" fill="${INK_MUTED}" letter-spacing="-0.4">${escapeXml(line)}</text>`)
    .join('\n');

  const statBlock = showStat
    ? `
      <text x="64" y="280" font-family="'IBM Plex Sans', system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="92" font-weight="700" fill="${FOREST}" letter-spacing="-3.5">${escapeXml(opts.stat ?? '')}</text>
      ${opts.statLabel ? `<text x="64" y="310" font-family="'IBM Plex Sans', system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="20" font-weight="500" fill="${INK_MUTED}" letter-spacing="-0.2">${escapeXml(opts.statLabel)}</text>` : ''}
    `
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${CREAM}"/>
  <rect width="1200" height="120" fill="${FOREST}"/>
  <text x="64" y="78" font-family="'Fraunces', 'Source Serif Pro', Georgia, serif" font-size="44" font-weight="700" fill="${CREAM}" letter-spacing="-2.0">crestio</text>
  <text x="1136" y="74" text-anchor="end" font-family="'IBM Plex Sans', system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="14" font-weight="500" letter-spacing="2" fill="rgba(250,250,248,0.7)">${escapeXml(eyebrow.toUpperCase())}</text>
  ${statBlock}
  ${titleHTML}
  ${subtitleHTML}
  <circle cx="68" cy="568" r="4" fill="${FOREST}"/>
  <text x="84" y="574" font-family="'IBM Plex Sans', system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="18" font-weight="500" fill="${INK_MUTED}" letter-spacing="-0.2">crestio.ai · tutoring, finally calm</text>
  <text x="1136" y="574" text-anchor="end" font-family="'IBM Plex Sans', system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="14" font-weight="400" fill="#A0A39E" letter-spacing="1">2026</text>
</svg>`;
}
