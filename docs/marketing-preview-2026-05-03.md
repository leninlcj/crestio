# Crestio marketing preview, 2026-05-03

This preview is intentionally local and reversible. It lives at `/preview-business`, uses `noindex,nofollow,noarchive`, and does not replace the public homepage.

## Market read

Search results for TutorCruncher, Teachworks, Tutorbase, Satori, HiClass, and similar tutoring software show a crowded market around scheduling, billing, CRM, parent portals, and broad company operations. The strongest Crestio opening is narrower:

> Finish the lesson. Send the parent update. Get paid.

That wedge is easier to remember than “all-in-one tutor management,” and it matches Crestio's strongest existing product loop: session logging, AI polish, parent updates, homework/files, and invoicing/payment links.

## What changed locally

- Rebuilt `pages/preview-business.tsx` as a polished noindex preview page.
- Added competitive market-read framing without fake social proof.
- Added a product mock that shows the exact session-to-parent-update-to-invoice workflow.
- Added plan-aware pricing with monthly/annual switching from `PLAN_CATALOGUE`.
- Added a launch-notes section that makes the preview explicitly undoable.
- Updated `pages/auth/signup.tsx` so selected plan URLs show the plan, trial length, and price before account creation.

## Why this is better

- The first screen now makes one crisp promise instead of selling every feature at once.
- The page differentiates Crestio from broad tools by owning the post-lesson admin moment.
- The trust section matches the current honest founder-led direction: no invented numbers, no fake team language.
- The signup path now keeps continuity after a pricing click, which reduces doubt before account creation.
- Pricing is sourced from the existing plan catalogue, reducing drift between marketing and billing copy.

## Test checklist

- `npm run build`
- `curl -I http://localhost:3000/preview-business`
- Browser verification at desktop and mobile widths
- Confirm `/auth/signup?plan=solo&interval=monthly` shows Solo trial and price
- Confirm `/auth/signup?plan=team&interval=annual` shows Team annual trial and price

## Publish checklist

- Move approved sections into the real homepage instead of redirecting to the preview route.
- Convert final marketing copy into locale files before production rollout.
- Replace the CSS-built product mock with real product screenshots when final UI states are ready.
- Keep the route noindexed or remove it after the public homepage is updated.
- Deploy with the project rule from `README.md`: use plain `vercel --prod`, not `--prebuilt` or `--archive=tgz`.
