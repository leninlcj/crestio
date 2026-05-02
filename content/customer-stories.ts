// Customer stories. Empty until real, consenting customers ship a story.
// Voice (when stories return): peer-to-peer, specific, no marketing-speak.

export type CustomerStat = { label: string; value: string };

export type CustomerStory = {
  slug: string;
  name: string;
  practice: string;
  city: string;
  subject: string;
  photo: string;
  result_one_line: string;
  context: string;
  stats: CustomerStat[];
  quote: string;
  problem: string;
  solution: string;
  results: string;
  is_real: boolean;
};

export const CUSTOMER_STORIES: CustomerStory[] = [];

export function getCustomerStory(slug: string): CustomerStory | null {
  return CUSTOMER_STORIES.find((s) => s.slug === slug) ?? null;
}
