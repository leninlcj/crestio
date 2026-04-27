// Marketing stats fetcher used at build time by getStaticProps. Gracefully
// falls back to defaults from config/marketing.json when Supabase is
// unreachable (e.g. during local builds without DB credentials).

import marketingConfig from '../config/marketing.json';

export type MarketingStats = {
  practicesCount: number;
};

export async function fetchMarketingStats(): Promise<MarketingStats> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fallback: MarketingStats = {
    practicesCount: marketingConfig.stats?.default_practices_count ?? 0,
  };
  if (!url || !serviceKey) return fallback;

  try {
    const res = await fetch(`${url}/rest/v1/organizations?select=id&limit=1`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'count=exact',
      },
    });
    if (!res.ok) return fallback;
    const range = res.headers.get('content-range');
    if (!range) return fallback;
    const total = Number(range.split('/').pop() ?? '0');
    return { practicesCount: Number.isFinite(total) ? total : fallback.practicesCount };
  } catch {
    return fallback;
  }
}
