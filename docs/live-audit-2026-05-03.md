# Crestio live audit, 2026-05-03

Scope: public live site at `https://crestio.ai`, public sitemap/robots, marketing routes, legal routes, brand assets, signup entry points, and the sandbox demo. No production deployment was made.

## External scan

Reference competitors and category pages checked during the audit:

- TutorCruncher: broad tutor/client/student management, billing, calendar, communications, analytics.
- Teachworks: scheduling, billing, student management, integrations, large-team positioning.
- Tutorbase and Satori: lesson-to-invoice and solo-tutor workflow positioning.
- HiClass: AI retention angle around parent updates and post-lesson outputs.
- Evallo and similar tools: “operating system for tutors” category language.

Conclusion: Crestio’s current live positioning is strongest when it owns the post-lesson loop: log the session, polish notes, update parents, invoice, and get paid.

## Live findings

Fixed locally:

- `sitemap.xml` included `/sandbox` even though `/sandbox` is noindexed and disallowed in `robots.txt`.
- `/pricing` had no server-rendered H1.
- `/brand` linked to five missing brand downloads under `/marketing/brand/*`.
- Terms said a valid payment method was required at signup, while marketing and signup promise no card/no payment method for trial signup.
- Sandbox polish flow could show a success toast without a visible polished result for two demo sessions.
- Sandbox polished items disappeared from the update queue before the visitor could send them to a parent.

Already good on live:

- All 32 live sitemap URLs returned HTTP 200.
- Homepage hero, pricing, founder, security, comparison, and persona pages are coherent and honest.
- Public copy is stronger than the rejected preview direction; the preview should not be promoted over the current homepage.
- The sandbox is a strong conversion surface and should stay linked from marketing, while remaining noindexed.

## Local fixes made

- Removed `/sandbox` from `pages/sitemap.xml.ts`.
- Added a screen-reader H1 to `pages/pricing.tsx`.
- Updated `pages/terms.tsx` billing language to match the no-payment-method trial promise.
- Removed PNG download links from `components/marketing/BrandKit.tsx` until real PNG exports exist.
- Added real SVG brand assets:
  - `public/marketing/brand/crestio-light.svg`
  - `public/marketing/brand/crestio-dark.svg`
  - `public/marketing/brand/crestio-mono.svg`
- Added deterministic polish samples for the two current-day sandbox sessions in `lib/sandbox-data.ts`.
- Changed the sandbox queue so polished-but-unsent updates remain visible until sent to a parent.

## Verification

Commands/checks run:

- `npm run build`
- Production local server: `npx next start -p 3001`
- Local production crawl:
  - `31` sitemap URLs
  - `/sandbox` not present in sitemap
  - `43` internal URLs checked
  - `0` broken internal links
  - `0` sitemap pages missing title or H1
- Browser QA:
  - Live homepage loads with correct hero and no-card trial copy.
  - Live sandbox loads and shows sessions, invoices, and reset state.
  - Local fixed sandbox can polish the first item, show the polished parent update, expose `Send to parent`, and then send it.

## Not done

- No production deploy was run.
- No account was created on the live site.
- No contact form or external message was submitted.
- `npm run lint` is still unavailable because the repository has no ESLint config and `next lint` prompts interactively.
