# /public/marketing/ — image asset slot

This folder holds product screenshots referenced by marketing components. The hero, "six things you stop doing manually" cards, and a few comparison screenshots all eventually want real PNG/WebP captures of the running app — for now those components fall back to Tailwind-rendered SVG mockups.

## Outstanding TODO — replace mockups with real screenshots

When real screenshots are available, drop them into this folder with the names below. Each consumer is annotated so you know what to capture.

| Filename                     | Used by                                    | Capture                                                                                          |
|------------------------------|--------------------------------------------|--------------------------------------------------------------------------------------------------|
| `hero-dashboard.png`         | `components/marketing/HeroScreenshot.tsx`  | `/app` home: today's sessions + stat row + one nudge. 16:9. Light theme.                         |
| `hero-dashboard.webp`        | same                                       | webp version of the above for `<picture>` swap                                                   |
| `polish-flow.png`            | (homepage "six things" — polish card)       | `/app/sessions/[id]` polish preview pane: rough vs polished side-by-side                          |
| `invoice-sent.png`           | (homepage "six things" — invoice card)      | `/app/money/invoices/[id]` after send: status pill + payment link snippet                        |
| `parent-portal.png`          | (homepage "six things" — parent card)       | `/parent/dashboard`: student card, recent session note, pay-now CTA                              |
| `lenin-founder.jpg`          | `pages/founder.tsx`, `pages/about.tsx`, `components/marketing/FounderHomepageEmbed.tsx` | Square portrait of Lenin. Anything reasonable. 256×256+ recommended. |

## How to use the screenshots once dropped

Each consumer has a `// TODO: replace with founder photo at /public/marketing/lenin-founder.jpg` (or equivalent) comment marking the swap site. Open the file, replace the SVG/initial-only avatar with `<Image src="/marketing/<file>" ... />`, delete the TODO.

Prefer the `<picture>` element with both webp and png:

```tsx
<picture>
  <source srcSet="/marketing/hero-dashboard.webp" type="image/webp" />
  <img src="/marketing/hero-dashboard.png" alt="Crestio dashboard" />
</picture>
```

## Compression guideline

The marketing surface targets Lighthouse Performance 95+. Aim for ≤ 200 KB per hero image, ≤ 80 KB per card image. Suggested toolchain: `pnpm dlx @squoosh/cli --webp '{"quality":85}' /public/marketing/*.png` (will need pnpm or npx).

## What lives here today

Nothing yet. The assets above are TODOs. The site renders fine without them — fallbacks are SVG mockups in the relevant components.
