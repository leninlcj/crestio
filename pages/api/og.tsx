import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

// Open Graph image, rendered as a 1200x630 PNG on the edge runtime.
// Social platforms (iMessage, WhatsApp, Facebook, LinkedIn, X, Slack) only
// accept raster og:images, so this must stay PNG. Fonts are bundled from
// assets/fonts (SIL Open Font License) so the image matches the site.
//
// Query: type, title, subtitle, accent, stat, statLabel. Every marketing page
// sets its own title and subtitle through components/agency/AgencyPage.tsx.

export const config = { runtime: 'edge' };

const WIDTH = 1200;
const HEIGHT = 630;
const CREAM = '#FAFAF8';
const INK = '#0F1714';
const INK_MUTED = '#5F635E';
const FOREST = '#1F3A2E';
const RULE = '#E4E2DC';

const VARIANTS = new Set([
  'marketing', 'pricing', 'customer', 'changelog', 'comparison',
  'monthly_impact', 'anniversary', 'referral_share',
]);

const FONT_FILES = {
  display: new URL('../../assets/fonts/fraunces-latin-500-normal.woff', import.meta.url),
  displayItalic: new URL('../../assets/fonts/fraunces-latin-500-italic.woff', import.meta.url),
  body: new URL('../../assets/fonts/ibm-plex-sans-latin-400-normal.woff', import.meta.url),
  bodyMedium: new URL('../../assets/fonts/ibm-plex-sans-latin-500-normal.woff', import.meta.url),
};

let fontCache: Promise<Array<{ name: string; data: ArrayBuffer; weight: 400 | 500; style: 'normal' | 'italic' }>> | null = null;

function loadFonts() {
  if (!fontCache) {
    fontCache = Promise.all([
      fetch(FONT_FILES.display).then((r) => r.arrayBuffer()),
      fetch(FONT_FILES.displayItalic).then((r) => r.arrayBuffer()),
      fetch(FONT_FILES.body).then((r) => r.arrayBuffer()),
      fetch(FONT_FILES.bodyMedium).then((r) => r.arrayBuffer()),
    ]).then(([display, displayItalic, body, bodyMedium]) => [
      { name: 'Fraunces', data: display, weight: 500 as const, style: 'normal' as const },
      { name: 'Fraunces', data: displayItalic, weight: 500 as const, style: 'italic' as const },
      { name: 'IBM Plex Sans', data: body, weight: 400 as const, style: 'normal' as const },
      { name: 'IBM Plex Sans', data: bodyMedium, weight: 500 as const, style: 'normal' as const },
    ]);
  }
  return fontCache;
}

function clip(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function eyebrowFor(type: string, accent: string | null): string {
  switch (type) {
    case 'pricing': return 'Pricing';
    case 'customer': return accent ? `Family story · ${accent}` : 'Family story';
    case 'changelog': return 'What changed';
    case 'comparison': return accent ? `Crestio and ${accent}` : 'Comparison';
    case 'monthly_impact': return accent ? `Your ${accent}` : 'Monthly summary';
    case 'anniversary': return accent ? `${accent} on Crestio` : 'Anniversary';
    case 'referral_share': return 'Crestio referral';
    default: return 'Crestio Tutoring · Sydney and online';
  }
}

function defaultTitle(type: string): string {
  switch (type) {
    case 'pricing': return 'Simple hourly rates. No joining fee. No lock-in.';
    case 'monthly_impact': return 'Your month, in numbers.';
    case 'anniversary': return 'A year of lessons.';
    case 'referral_share': return 'Tutoring with Crestio.';
    default: return 'The right tutor, matched to your child.';
  }
}

function defaultSubtitle(type: string): string {
  switch (type) {
    case 'pricing': return 'Maths and physics tutoring, Years 7 to 12. Sydney in-home and online.';
    case 'marketing': return 'Maths and physics, Years 7 to 12 and the HSC. Sydney in-home and online.';
    default: return '';
  }
}

export default async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'marketing';
  if (!VARIANTS.has(type)) return new Response('Invalid type', { status: 400 });

  const accent = searchParams.get('accent');
  const title = clip(searchParams.get('title') ?? defaultTitle(type), 90);
  const subtitle = clip(searchParams.get('subtitle') ?? defaultSubtitle(type), 140);
  const stat = searchParams.get('stat');
  const statLabel = searchParams.get('statLabel');
  const eyebrow = eyebrowFor(type, accent);
  const titleSize = title.length > 60 ? 54 : title.length > 40 ? 62 : 72;

  const fonts = await loadFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: CREAM,
          padding: '56px 64px 48px 64px',
          fontFamily: 'IBM Plex Sans',
          color: INK,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', fontFamily: 'Fraunces', fontSize: 44, letterSpacing: '-0.03em' }}>
            <span>crest</span>
            <span style={{ fontStyle: 'italic', color: FOREST }}>io</span>
            <span style={{ fontFamily: 'IBM Plex Sans', fontSize: 22, color: INK_MUTED, marginLeft: 14, letterSpacing: 0 }}>Tutoring</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: INK_MUTED }}>{eyebrow}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }}>
          {stat ? (
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={{ fontFamily: 'Fraunces', fontSize: 132, letterSpacing: '-0.04em', color: FOREST, lineHeight: 1 }}>{stat}</div>
              {statLabel && <div style={{ fontSize: 28, color: INK_MUTED, marginLeft: 20 }}>{statLabel}</div>}
            </div>
          ) : null}
          <div style={{ fontFamily: 'Fraunces', fontSize: stat ? 44 : titleSize, letterSpacing: '-0.03em', lineHeight: 1.08, color: INK, maxWidth: 1040 }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 28, lineHeight: 1.4, color: INK_MUTED, marginTop: 24, maxWidth: 960 }}>{subtitle}</div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `2px solid ${RULE}`, paddingTop: 22, fontSize: 20, color: INK_MUTED }}>
          <div>Every tutor interviewed, ID-checked and WWCC-verified.</div>
          <div style={{ color: INK }}>crestio.ai</div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  );
}
