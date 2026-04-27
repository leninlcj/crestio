// Lookup table for /for/[slug] pages. Each slug maps to an i18n key prefix
// under marketing.json's `for.<slug>` block, plus a region/vertical type.

export type LandingType = 'region' | 'vertical';

export type LandingMeta = {
  type: LandingType;
  i18nKey: string;
  currency?: string;
  country?: string;
  hasFaq?: boolean;
};

export const LANDING_PAGES: Record<string, LandingMeta> = {
  sydney:           { type: 'region',   i18nKey: 'sydney',           currency: 'AUD', country: 'AU', hasFaq: true },
  india:            { type: 'region',   i18nKey: 'india',            currency: 'INR', country: 'IN' },
  uk:               { type: 'region',   i18nKey: 'uk',               currency: 'GBP', country: 'GB' },
  'music-teachers': { type: 'vertical', i18nKey: 'music_teachers',                                        hasFaq: true },
  'exam-prep':      { type: 'vertical', i18nKey: 'exam_prep',                                             hasFaq: true },
  'large-practices':{ type: 'vertical', i18nKey: 'large_practices',                                       hasFaq: true },
};

export function isValidLandingSlug(slug: string): boolean {
  return slug in LANDING_PAGES;
}
