# Component & cross-page consistency audit — Phase 6

Scope: every page touched in commits 1-3 of phase 6.
Method: code review against the design tokens in `tailwind.config.ts` +
`styles/globals.css`. Where a violation was found and fixed inside this
phase, it's noted; where it stayed because the fix was out of scope, it's
flagged for follow-up.

## Headers

| Surface | Pattern | Status |
|---|---|---|
| `/app/*` | `<Layout pageTitle=... />` with breadcrumb in top bar | OK |
| `/parent/*` | `<ParentLayout title=... />` with `ParentTopBar` | OK |
| Marketing | Section-scoped `<h1>` with eyebrow + balance | OK |

Page-title fallback in `Layout.tsx` uses `defaultPageTitle(pathname)`
(consistent across nested routes). No fixes needed.

## Tab strips

| Page | Component | Status |
|---|---|---|
| `/app/sessions` etc. | `<TabStrip>` via `tabsForPath` | OK |
| `/app/settings/*` | `<SettingsTabs>` | OK |
| `/parent/*` | `<ParentTabStrip>` | OK |

Settings tabs and section tabs both use 36px-tall pills with forest-soft
active state — visually identical.

## Status pills

`pill-forest`, `pill-success`, `pill-amber`, `pill-claret`, `pill-rust`,
`pill-neutral` — all use the same `.pill` base (4px / 8px padding,
999px radius, 11px text). Phase 6 added a 100ms crossfade transition on
`background-color` and `color` so changing a pill's tone never flashes.

## Buttons

`.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger` — all
inherit the `.btn` base (40px height, 8px radius, 100ms color transition).
Tighter inline buttons (e.g. action buttons in row hovers) use a
combination of `text-xs h-7 min-h-[28px]` or `text-2xs h-8 min-h-[32px]`.

Phase 6 added: nothing — the pattern was already correct.

## Form fields

`.input` — 40px height, 8px radius, 2px forest focus ring on focus.
`.label` — 12px font-medium, 6px bottom margin.

Mobile-only `font-size: 16px !important` on inputs to prevent iOS Safari
from auto-zooming. Carried through.

## DetailPane

480px on desktop, full-screen on mobile. No exceptions found in phase 6.

## Modals

12px radius, max-width via `max-w-md` / `max-w-lg`, soft `shadow-lift`,
`animate-slide-up` on entry. New phase 6 modals (Tour, FirstTimeWelcome,
StreakHeatmapModal) all match.

## Toasts

`bottom-6 right-6` positioning, `animate-toast-in` (overshoot 12px → -2px
→ 0). Forest border on success, claret on error, rule on info.

## Skeletons

`<Skeleton>` primitive shared. Used inline via `skeleton-shimmer` class
on raw divs in older code paths — both render identical animation.

## Issues left in (intentional)

- The `/app/index.tsx` dashboard predates the EmptyState primitive and
  uses inline empty-state fragments inside the `Today` and "Needs
  attention" sections. They visually match the standard pattern but
  aren't refactored to use `<EmptyState>`. Marked for a future cleanup.
- `<SampleDataBanner>` uses a yellow-50/yellow-300 Tailwind class
  pair instead of the design-token amber. Pre-phase-6; not breaking.
