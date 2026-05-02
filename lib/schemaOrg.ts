// JSON-LD structured data helpers for marketing pages. Each helper returns
// a JSON-serializable object you drop into a <script type="application/ld+json">
// inside the page <Head>.

const SITE = 'https://crestio.ai';

export function softwareAppSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Crestio',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: 'Software for tutors. Log sessions in seconds, polish parent updates with AI, get paid by card.',
    url: SITE,
    image: `${SITE}/api/og?type=marketing`,
    offers: [
      { '@type': 'Offer', name: 'Solo', price: '24', priceCurrency: 'AUD', priceSpecification: { '@type': 'UnitPriceSpecification', price: '24', priceCurrency: 'AUD', unitText: 'MONTH' } },
      { '@type': 'Offer', name: 'Team', price: '59', priceCurrency: 'AUD', priceSpecification: { '@type': 'UnitPriceSpecification', price: '59', priceCurrency: 'AUD', unitText: 'MONTH' } },
      { '@type': 'Offer', name: 'Growth', price: '129', priceCurrency: 'AUD', priceSpecification: { '@type': 'UnitPriceSpecification', price: '129', priceCurrency: 'AUD', unitText: 'MONTH' } },
    ],
    publisher: {
      '@type': 'Organization',
      name: 'Crestio',
      url: SITE,
    },
  };
}

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Crestio',
    url: SITE,
    logo: `${SITE}/icon-512.png`,
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'lenin@crestio.ai',
      contactType: 'customer support',
      areaServed: 'AU',
      availableLanguage: ['English'],
    },
  };
}

export function articleSchema(args: {
  url: string;
  headline: string;
  datePublished: string;       // YYYY-MM-DD
  description?: string;
  author?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: { '@type': 'WebPage', '@id': args.url },
    headline: args.headline,
    datePublished: args.datePublished,
    dateModified: args.datePublished,
    description: args.description,
    author: { '@type': 'Person', name: args.author ?? 'Lenin' },
    publisher: {
      '@type': 'Organization',
      name: 'Crestio',
      logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png` },
    },
  };
}

export function faqSchema(qas: Array<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qas.map((qa) => ({
      '@type': 'Question',
      name: qa.q,
      acceptedAnswer: { '@type': 'Answer', text: qa.a },
    })),
  };
}

export function breadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${SITE}${item.url}`,
    })),
  };
}
