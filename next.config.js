/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    // Old SaaS marketing URLs → the closest agency page. Permanent so search
    // engines move their signals across.
    const to = (source, destination) => ({ source, destination, permanent: true });
    return [
      to('/for/parents', '/how-it-works'),
      to('/for/:slug*', '/tutors'),
      to('/compare/:slug*', '/'),
      to('/customers/:slug*', '/about'),
      to('/founder', '/about'),
      to('/roadmap', '/about'),
      to('/changelog', '/about'),
      to('/status', '/contact'),
      to('/security', '/privacy'),
      to('/acceptable-use', '/terms'),
      to('/brand', '/about'),
      to('/developers', '/contact'),
      to('/roi', '/pricing'),
      to('/migrate', '/enquire'),
      to('/how-polish-works', '/how-it-works'),
      to('/preview-business', '/'),
      to('/sandbox', '/how-it-works'),
    ];
  },
};

module.exports = nextConfig;
