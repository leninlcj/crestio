import type { GetServerSideProps } from 'next';
import { AGENCY } from '../lib/agency';
import { SUBURBS } from '../lib/suburbs';

const SITE = AGENCY.siteUrl;

// Public agency pages only. The app, portals, auth and payment links are
// excluded here and in robots.txt.
const STATIC_PATHS: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/how-it-works', changefreq: 'monthly', priority: '0.8' },
  { path: '/maths-tutoring', changefreq: 'monthly', priority: '0.9' },
  { path: '/physics-tutoring', changefreq: 'monthly', priority: '0.9' },
  { path: '/science-tutoring', changefreq: 'monthly', priority: '0.9' },
  { path: '/ib-tutoring', changefreq: 'monthly', priority: '0.9' },
  { path: '/subjects', changefreq: 'monthly', priority: '0.8' },
  { path: '/classes', changefreq: 'weekly', priority: '0.9' },
  { path: '/request-a-call', changefreq: 'monthly', priority: '0.9' },
  { path: '/pricing', changefreq: 'monthly', priority: '0.9' },
  { path: '/enquire', changefreq: 'monthly', priority: '0.8' },
  { path: '/tutors', changefreq: 'monthly', priority: '0.7' },
  { path: '/tutors/apply', changefreq: 'monthly', priority: '0.6' },
  { path: '/tutors/handbook', changefreq: 'monthly', priority: '0.4' },
  { path: '/programs', changefreq: 'monthly', priority: '0.8' },
  { path: '/faq', changefreq: 'monthly', priority: '0.6' },
  { path: '/about', changefreq: 'monthly', priority: '0.5' },
  { path: '/contact', changefreq: 'yearly', priority: '0.4' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.2' },
  { path: '/terms', changefreq: 'yearly', priority: '0.2' },
  { path: '/cookies', changefreq: 'yearly', priority: '0.1' },
  { path: '/tutoring', changefreq: 'monthly', priority: '0.7' },
  { path: '/es', changefreq: 'monthly', priority: '0.6' },
  ...SUBURBS.map((s) => ({ path: `/tutoring/${s.slug}`, changefreq: 'monthly', priority: '0.6' })),
];

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = STATIC_PATHS.map(
    (u) => `  <url>\n    <loc>${SITE}${u.path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
  ).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600');
  res.write(xml);
  res.end();
  return { props: {} };
};

export default function Sitemap() {
  return null;
}
