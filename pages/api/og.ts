import type { NextApiRequest, NextApiResponse } from 'next';
import { renderOgSvg, type OgVariant } from '../../lib/og';

const VALID_VARIANTS: OgVariant[] = [
  'marketing', 'pricing', 'customer', 'changelog', 'comparison',
  'monthly_impact', 'anniversary', 'referral_share',
];

function parseString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const type = (parseString(req.query.type) ?? 'marketing') as OgVariant;
  if (!VALID_VARIANTS.includes(type)) {
    return res.status(400).send('Invalid type');
  }

  const title = parseString(req.query.title) ?? defaultTitleFor(type);
  const subtitle = parseString(req.query.subtitle) ?? defaultSubtitleFor(type);
  const accent = parseString(req.query.accent);
  const stat = parseString(req.query.stat);
  const statLabel = parseString(req.query.statLabel);

  try {
    const svg = renderOgSvg({ type, title, subtitle, accent, stat, statLabel });
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).send(svg);
  } catch (err) {
    console.error('[api/og] render failed', err);
    res.status(500).send('OG render failed');
  }
}

function defaultTitleFor(type: OgVariant): string {
  switch (type) {
    case 'pricing': return 'Solo $24. Team $59. No surprises.';
    case 'customer': return 'A real practice. Real numbers.';
    case 'changelog': return 'What we shipped this month.';
    case 'comparison': return 'Crestio, compared honestly.';
    case 'monthly_impact': return 'Your month, in numbers.';
    case 'anniversary': return 'A year of small wins.';
    case 'referral_share': return 'Try Crestio with me.';
    case 'marketing':
    default:
      return 'The right tutor, matched to your child.';
  }
}

function defaultSubtitleFor(type: OgVariant): string {
  switch (type) {
    case 'pricing': return '7-day trial. Cancel anytime. Parents pay by card.';
    case 'comparison': return 'A side-by-side that doesn\'t bury the trade-offs.';
    case 'marketing': return 'Maths and physics, Years 7–12 and the HSC. Sydney in-home and online.';
    default: return '';
  }
}
