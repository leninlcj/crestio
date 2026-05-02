# i18n marketing review — 2026-05-02

Source-of-truth strings in `public/locales/en/marketing.json` were edited across the M1 marketing overhaul (Phases A–D). The 9 non-English locales (`ar/bn/es/fr/hi/id/pt/ur/zh`) still hold the **old fabricated content** under the same keys. They will leak through to non-English visitors until `npm run translate` re-runs DeepL against this fresh English source and a human reviews the output.

This doc is the queue for that retranslation pass. Mark every line P0/P1/P2 by impact. Reviewer signs each line off as it lands.

## P0 — child-safety, payments, legal

| Key                                              | What changed                                                                                  | Reviewer note |
|--------------------------------------------------|-----------------------------------------------------------------------------------------------|---------------|
| `pricing_v2.solo_pitch`                          | Reframed as 1–2-student edge case + 7-day no-card trial language                              |               |
| `pricing_v2.enterprise_pitch`                    | Now: "Bigger practice or unusual setup? Email" + lenin@ link                                  |               |
| `inline_pricing.heading`                         | New section: "Honest pricing. No per-seat tax."                                               |               |
| `inline_pricing.subheading`                      | New: "Pick a plan. Trial it. Cancel anytime from the dashboard."                              |               |
| `inline_pricing.solo.subhead/b1..b4/cta`         | New compact tier copy                                                                         |               |
| `inline_pricing.team.subhead/b1..b4/cta`         | New compact tier copy                                                                         |               |
| `inline_pricing.growth.subhead/b1..b4/cta`       | New compact tier copy                                                                         |               |
| `migration_banner.title/body/spots/spots_zero/cta/eyebrow` | New banner copy — "Switching from a spreadsheet…" + dynamic spots taken              |               |

## P1 — pricing copy, founder voice, hero

| Key                                              | What changed                                                                                  | Reviewer note |
|--------------------------------------------------|-----------------------------------------------------------------------------------------------|---------------|
| `hero.heading_v2`                                | "The calm operating system for tutors."                                                       |               |
| `hero.subheading_v2`                             | New: "Built by a Sydney HSC tutor for tutors. …"                                              |               |
| `hero.badge`                                     | "Early access · solo tutors and small practices"                                              |               |
| `hero.cta_secondary`                             | "Try the sandbox" (was video tour)                                                            |               |
| `hero.micro_note`                                | "No credit card · Cancel anytime · Australian-made"                                           |               |
| `hero.signal_commits/_one`                       | New plural strings for the 7-day commit count                                                 |               |
| `hero.signal_changelog/_made_in`                 | New signal-block strings                                                                      |               |
| `social_proof.line`                              | Drops `{{count}} cities` interpolation; new: "Built by a working HSC tutor in Sydney…"        |               |
| `for.sydney.sub`                                 | Removed "used by Sydney tutors" — sentence ends at "Built in Sydney."                         |               |
| `for.solo.*` (entire block)                      | New vertical landing page                                                                     |               |
| `for.small_practices.*` (entire block)           | New vertical landing page                                                                     |               |
| `for.exam_prep.sub/meta_description/faq_1/faq_3` | Stripped countdown-timer + mock-exam-tracker aspirational claims                              |               |
| `for.music_teachers.*` (entire block)            | Honest rewrite: subhead, FAQs, plus new `limitations_*` keys for "what Crestio doesn't do"    |               |

## P1 — founder + about

| Key                                              | What changed                                                                                  | Reviewer note |
|--------------------------------------------------|-----------------------------------------------------------------------------------------------|---------------|
| `about.meta_description`                         | "small team in Australia" → "solo, in Sydney, by a working HSC English tutor"                 |               |
| `about.values_tutor_body`                        | Removed "Sarah, eight students in Sydney" persona reference                                   |               |
| `about.body_1`                                   | "small team based in Sydney" → "solo, in Sydney, by a working HSC English tutor"              |               |
| `faq_v2.a6` (or wherever it lives)               | "Crestio team. We're a small team based in Australia…" → solo-founder framing + lenin@ email  |               |

## P1 — polish demo + how it works

| Key                                              | What changed                                                                                  | Reviewer note |
|--------------------------------------------------|-----------------------------------------------------------------------------------------------|---------------|
| `polish_demo.*` (entire block)                   | Brand-new homepage section — eyebrow, heading, sub, input/output labels, style names, button states, disclaimer, link to /how-polish-works |  |

## P2 — nav + footer

| Key                                              | What changed                                                                                  | Reviewer note |
|--------------------------------------------------|-----------------------------------------------------------------------------------------------|---------------|
| `nav.tutors_practices_desc`                      | Was "2–15 tutors", now "2–5 tutors" (small-practices is the 2–5 page; large-practices is 5–15)|               |
| `nav.tutors_music_desc`                          | Was "Instrument tracking, recital prep" (false), now "Free-text session notes + AI polish"    |               |
| `nav.resources_roadmap*`                         | New entry                                                                                     |               |
| `nav.resources_founder*`                         | New entry                                                                                     |               |

## P2 — footer copy in component

The footer copyright string `"© {year} Crestio · Made by a tutor, in Sydney"` is hardcoded in `components/marketing/MarketingFooter.tsx` (not in i18n). Translate when localising the footer if applicable.

## How to run the retranslation

```bash
npm run translate
```

Re-runs `scripts/translate-locales.ts` (DeepL). After it lands, re-read the diffs in each non-English locale file and fix anything that reads off — DeepL handles long English well, but idioms like "Sunday-night admin" or "no per-seat tax" sometimes need a human hand.

## Scope notes for the reviewer

Lines marked **P0** must be retranslated and reviewed before any non-English marketing surface goes live publicly. Lines marked **P1** should follow within ~1 week. **P2** is best-effort.

If DeepL chokes on any string (token overruns, formatting tags), the build will keep the old translation in place — review the diff per locale to confirm nothing reverted.
