// JSON-LD for the agency pages.
import { AGENCY, FAQS, RATE_CARD, SUBJECTS } from './agency';

const SITE = AGENCY.siteUrl;

export function agencyOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'EducationalOrganization'],
    '@id': `${SITE}/#organization`,
    name: AGENCY.name,
    url: SITE,
    logo: `${SITE}/icon-512.png`,
    image: `${SITE}/api/og?type=marketing`,
    email: AGENCY.email,
    description: 'Carefully matched one-on-one maths and physics tutoring for Years 7–12 and the HSC. Sydney in-home and online across Australia.',
    areaServed: [
      { '@type': 'City', name: 'Sydney' },
      { '@type': 'Country', name: 'Australia' },
    ],
    address: { '@type': 'PostalAddress', addressLocality: AGENCY.serviceArea.homeSuburb, addressRegion: 'NSW', addressCountry: 'AU' },
    founder: { '@type': 'Person', name: AGENCY.founder.name },
    priceRange: '$80–$125 per hour',
    knowsAbout: SUBJECTS.map((s) => s.label),
  };
}

export function tutoringServiceSchema(subject: 'maths' | 'physics' | 'all') {
  const name = subject === 'maths' ? 'Mathematics tutoring' : subject === 'physics' ? 'Physics tutoring' : 'Maths and physics tutoring';
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: name,
    provider: { '@id': `${SITE}/#organization` },
    areaServed: [{ '@type': 'City', name: 'Sydney' }, { '@type': 'Country', name: 'Australia' }],
    audience: { '@type': 'EducationalAudience', educationalRole: 'student', audienceType: 'High school students, Years 7–12' },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Hourly rates',
      itemListElement: RATE_CARD.flatMap((b) => {
        const offers: Array<Record<string, unknown>> = [];
        if (b.online != null) offers.push({ '@type': 'Offer', name: `${b.label} (online)`, price: String(b.online), priceCurrency: 'AUD', priceSpecification: { '@type': 'UnitPriceSpecification', price: String(b.online), priceCurrency: 'AUD', unitText: 'HOUR' } });
        if (b.inHome != null) offers.push({ '@type': 'Offer', name: `${b.label} (in-home)`, price: String(b.inHome), priceCurrency: 'AUD', priceSpecification: { '@type': 'UnitPriceSpecification', price: String(b.inHome), priceCurrency: 'AUD', unitText: 'HOUR' } });
        return offers;
      }),
    },
  };
}

export function agencyFaqSchema(items = FAQS) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

export function breadcrumb(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url.startsWith('http') ? it.url : `${SITE}${it.url}` })),
  };
}
