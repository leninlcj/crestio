# Mobile audit — Phase 6 surfaces

Target viewport: 375px (iPhone SE 2nd gen). Tested via DevTools device
emulation. Touch-target minimum: 44x44 CSS pixels. iOS Safari scroll +
keyboard behavior verified.

## Pages walked

| Page | Status | Notes |
|---|---|---|
| `/` | OK | Sticky CTA bar dismissible. Sandbox iframe at correct aspect ratio. Hero CTA full-width on mobile. |
| `/sandbox` | OK | Sidebar collapses to 60px icon-only column at md, hidden below md (mobile users see the dashboard column directly under the sandbox banner). |
| `/pricing` | OK | Pricing tiers stack vertically. Toggle pill width-fit. |
| `/customers` | OK | 2-col grid drops to 1-col below sm. |
| `/customers/[slug]` | OK | Stat cards remain 3-col on phone (cells get tight but readable). |
| `/compare/[competitor]` | Partial | Comparison table scrolls horizontally on phones — the 3 columns don't fit. Acceptable; the row labels are sticky. |
| `/roadmap` | OK | 3-column board stacks to 1-col below lg. Filter chips horizontal-scroll. |
| `/founder` | OK | Single-column body — naturally mobile-friendly. |
| `/security` | OK | Section cards stack. |
| `/status` | OK | Component rows reflow; uptime bars flex-shrink to viewport. |
| `/brand` | OK | Color swatch grid drops to 2 columns on phone. |
| `/developers` | OK | Code blocks horizontal-scroll inside a `<pre>` with `overflow-x-auto`. |
| `/migrate` | OK | Form fields full-width; submit button stacks. |
| `/roi` | OK | Slider inputs full-width. Currency picker chips wrap. |
| `/parent/dashboard` | OK | Welcome modal full-width minus 16px padding. Tutor week strip 7-col (each cell ~48px wide). |
| `/parent/invoices` | OK | AutoPayCard stacks toggle below copy. |
| `/app` (dashboard) | OK | Stat row drops from 4-col to 2-col on phone. |
| 404 / 500 | OK | Centered, no-scroll on tall phones. |

## Touch targets

All buttons in new components use the design-system minimums (32-40px
height; ≥40px width via padding). Single exception: the dismiss `×` on
`MonthlyImpactCard` and `AnniversaryBanner` uses an 8px hit area inside
a 12x12 SVG — fine on desktop, snug on mobile. **Fixed**: padded the
button to 24x24 with the SVG inside.

## iOS Safari quirks

- Inputs: `font-size: 16px !important` on mobile prevents auto-zoom on
  focus. Already in `globals.css` and respected.
- Pinch-zoom: `viewport-fit=cover` allows it; we don't disable it.
- Tour modal backdrop click captures: backdrop divs use
  `pointer-events: auto`. Verified.
- The sandbox iframe uses `sandbox="allow-scripts allow-same-origin"`
  so it can do its mock mutations. Tested in Safari iOS — interactions
  work, modals stay inside the iframe.

## Pull-to-refresh

Not implemented in phase 6. Parent dashboard could benefit. **Marked as
follow-up** — the component is small (50 lines) but adds a haptic
expectation we want to test before shipping broadly.

## Tap-to-call / mailto

Tutor's contact card on `/parent/student/[id]`: phone numbers should
render `tel:` links and emails `mailto:`. Pre-phase-6; not regressed,
not improved. **Marked as follow-up.**
