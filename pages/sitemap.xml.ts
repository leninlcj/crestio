import type { GetServerSideProps } from 'next';
import { CUSTOMER_STORIES } from '../content/customer-stories';
import { COMPETITOR_PAGES } from '../lib/comparisons';
import { LANDING_PAGES } from '../lib/marketing-landing';
import { loadChangelog } from '../lib/changelog';

const SITE = 'https://crestio.ai';

const STATIC_PATHS = [
  { path: '/', changefreq: 'weekly', priority: 1.0 },
  { path: '/pricing', changefreq: 'monthly', priority: 0.9 },
  { path: '/how-polish-works', changefreq: 'monthly', priority: 0.5 },
  { path: '/changelog', changefreq: 'weekly', priority: 0.7 },
  { path: '/roadmap', changefreq: 'weekly', priority: 0.6 },
  { path: '/founder', changefreq: 'monthly', priority: 0.5 },
  { path: '/customers', changefreq: 'monthly', priority: 0.7 },
  { path: '/security', changefreq: 'monthly', priority: 0.6 },
  { path: '/status', changefreq: 'daily', priority: 0.4 },
  { path: '/brand', changefreq: 'yearly', priority: 0.3 },
  { path: '/developers', changefreq: 'monthly', priority: 0.4 },
  { path: '/migrate', changefreq: 'monthly', priority: 0.6 },
  { path: '/about', changefreq: 'monthly', priority: 0.4 },
  { path: '/contact', changefreq: 'monthly', priority: 0.4 },
  { path: '/privacy', changefreq: 'yearly', priority: 0.2 },
  { path: '/terms', changefreq: 'yearly', priority: 0.2 },
  { path: '/cookies', changefreq: 'yearly', priority: 0.2 },
  { path: '/acceptable-use', changefreq: 'yearly', priority: 0.2 },
];

function urlEntry(loc: string, changefreq: string, priority: number, lastmod?: string): string {
  return `  <url>
    <loc>${SITE}${loc}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority.toFixed(1)}</priority>
  </url>`;
}

function buildSitemap(): string {
  const today = new Date().toISOString().slice(0, 10);
  const urls: string[] = [];

  for (const s of STATIC_PATHS) urls.push(urlEntry(s.path, s.changefreq, s.priority, today));

  for (const story of CUSTOMER_STORIES) {
    urls.push(urlEntry(`/customers/${story.slug}`, 'monthly', 0.6, today));
  }
  for (const slug of Object.keys(COMPETITOR_PAGES)) {
    urls.push(urlEntry(`/compare/${slug}`, 'monthly', 0.7, today));
  }
  for (const slug of Object.keys(LANDING_PAGES)) {
    urls.push(urlEntry(`/for/${slug}`, 'monthly', 0.5, today));
  }
  // Changelog has no per-version URL today; skip.

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
}

// We don't render anything — the response is the sitemap XML.
export default function Sitemap() { return null; }

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  // Pre-load changelog at request time so we don't ship the fs import to the
  // client — and so any new entries appear in the next crawl.
  loadChangelog();
  const xml = buildSitemap();
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600');
  res.write(xml);
  res.end();
  return { props: {} };
};
