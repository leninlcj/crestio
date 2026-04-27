# Design system

Single source of truth for the Crestio app shell, navigation, and shared
primitives after the 2026-04-27 design overhaul.

## Goals

- Calm, premium, fast. Less visual noise. Fewer top-level destinations.
- Every screen reads in 2 seconds.
- Forest green as the only brand accent.
- One spacing scale, one border, three text colors, three radii.
- No schema or API behavior changes — UI/UX layer only.

## Tokens

### Colors

| Token            | Value     | Use                                                                |
| ---------------- | --------- | ------------------------------------------------------------------ |
| `cream`          | `#FAFAF8` | page background                                                    |
| `surface`        | `#FFFFFF` | cards, sidebar, modals                                             |
| `ink`            | `#0F1714` | primary text                                                       |
| `ink-muted`      | `#6B6F6A` | secondary text, labels                                             |
| `ink-soft`       | `#A0A39E` | faint hints, micro                                                 |
| `rule`           | `#EAEAE6` | the only border color                                              |
| `ruleSoft`       | `#F4F4F0` | hover backgrounds only                                             |
| `forest`         | `#1F3A2E` | brand accent — primary buttons, active nav, links, key data points |
| `forest-soft`    | `#E8EEE8` | tinted active-nav background                                       |
| `forest-ink`     | `#12241C` | hover/active state of primary buttons                              |
| `success`        | `#2F7D4F` | session "logged" status pill                                       |
| `amber`          | `#B8860B` | warning pill                                                       |
| `claret`         | `#7A2233` | error pill, danger button                                          |
| `rust`           | `#8B4A1F` | rare warning highlight                                             |

> Status colors are sparingly used. Forest is reserved for the brand.
> Pills use the color at 8–10% opacity for the background and the full
> color for the text.

### Spacing

Tailwind defaults map to the spec: `1=4, 2=8, 3=12, 4=16, 6=24, 8=32, 12=48, 16=64`.
Page horizontal padding is `px-4` on mobile and `md:px-8` on desktop. Vertical
rhythm between sections is `gap-6`/`md:gap-8`.

### Typography

| Style          | Size    | Weight | Notes                                |
| -------------- | ------- | ------ | ------------------------------------ |
| Display number | 40px    | 600    | tabular-nums (`.display-num`)        |
| H1 / page title| 24px    | 600    | tracking `-0.02em`                   |
| H2 / section   | 16px    | 600    | tracking `-0.02em`                   |
| Body           | 14px    | 400    | line-height 1.5 (default)            |
| Small / meta   | 12px    | 500    | text-ink-muted                       |
| Micro          | 11px    | 500    | text-ink-soft, labels, kbd           |

Heading family: Fraunces (display). Body family: IBM Plex Sans.
Mono family: IBM Plex Mono — used in kbd hints and avatar initials.

### Radii

- `8px` — cards, inputs, buttons
- `12px` — modals, command palette, action sheets
- `999px` — pills, avatars, tab indicators

### Motion

- Page transitions: 150ms fade
- Hover on interactive items: 100ms `background-color` only
- Cmd+K open: 180ms ease-out, opacity + 4px translateY
- Skeleton shimmer: 1.4s ease-in-out infinite
- No bounce, no scale.

### Shadow

- `card` — none (default)
- `lift` — used only on modals, the command palette, and the FAB

## Navigation

### Sidebar (8 items)

1. Home — `/app`
2. Sessions — `/app/sessions` (and `/app/templates`, `/app/calendar`)
3. People — `/app/students` (and `/app/households`)
4. Money — `/app/invoices` (and `/app/payouts` for solo)
5. Resources — `/app/lesson-plans` (and `/app/files`)
6. Messages — `/app/messages`
7. Team — `/app/tutors` (Team plan, owner only)
8. Settings — `/app/settings/account`

The sidebar is collapsed (icons only) below the `xl` breakpoint (1280px),
expanded above. Mobile uses a slide-out drawer triggered by the hamburger
in the top bar plus a 5-item bottom tab strip for the most-used routes.

### Top bar

- Breadcrumb (left) — up to 3 levels, clickable; mobile shows current leaf only
- Search trigger (center) — "⌘K Search anything…" pill
- Notification bell + avatar (right)

### Tab strip

Sticky beneath the page title on consolidated sections. Active tab uses a
`2px` forest underline + dark text. Tabs respect the URL `?tab=` query.

### Cmd+K command palette

Single component (`components/CommandPalette.tsx`) mounted in `Layout.tsx`.
Sections in priority order:

1. Recent items (when input empty)
2. Quick actions: Log session · Polish last · Add student · Create invoice · Send invoice to parent
3. Jump to: Today's sessions · Polish queue · Unbilled · Overdue · Settings → Billing
4. Search results: students · sessions · invoices · lesson plans

Keyboard: `↑↓` move, `↵` select, `Esc` close. Recents persist to
`localStorage` (5 items, namespaced `crestio.cmdk.recents`).

## Shared components

All under `components/design/`:

| Component               | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `Button`                | Primary / secondary / ghost / danger / link. 40px tall, 8px radius.     |
| `Input`, `Textarea`, `Select` | 40px tall, 8px radius, 2px forest focus ring.                     |
| `Card`                  | White surface, 1px border, 8px radius, no shadow.                       |
| `Modal`                 | 12px radius, single soft shadow.                                        |
| `Badge` / `StatusPill`  | 11px text, 4×8 padding, 999px radius. Tone-tinted bg + full color text. |
| `EmptyState`            | Icon + headline + one-line + single CTA.                                |
| `PageLayout`            | Title + breadcrumb + tabs + filterBar + primaryAction wrapper.          |
| `PageHeader`            | Lighter standalone header (legacy).                                     |
| `Breadcrumb`            | Up to 3 clickable levels, mobile-collapsed.                             |
| `TabStrip`              | Sticky tab strip used on consolidated pages.                            |
| `StatCard`              | Dashboard stat card — label + display number + sub-line.                |
| `NudgeCard`             | Dashboard "Needs attention" card — icon + title + action.               |
| `TimelineRow`           | Today's-timeline row on the dashboard.                                  |
| `Skeleton`, `TableSkeleton`, `CardListSkeleton` | Shimmer loaders that replace spinners.                |
| `FloatingActionButton`  | Mobile-only quick-action sheet trigger.                                 |
| `CommandPalette`        | Cmd+K UI; replaces the legacy `GlobalSearch.tsx`.                       |

## Page-level patterns

- Page header is one row: title (24/600), primary action right.
- Tab strip beneath the header on consolidated pages.
- Filter bar is a single row, never two.
- Lists use the `.table` class — 56px row height, hover background only,
  no inner row dividers, sticky `<thead>` below the top bar on desktop.
- Numerical columns are right-aligned with tabular numerals.
- Status pills use `.pill-{tone}`.
- Empty states use the shared `EmptyState` component with calm, factual
  copy — no congratulatory language.

## Backwards compatibility

- All existing `/app` routes still resolve. The new sidebar entries point
  directly at the canonical sub-route (`/app/students` for People,
  `/app/invoices` for Money, etc.).
- New entry points `/app/people`, `/app/money`, `/app/resources`,
  `/app/team` are router stubs that redirect to the underlying page based
  on `?tab=`.
- `Layout.tsx` keeps its legacy `title` / `subtitle` / `actions` props so
  every existing page renders without edits, and adds an optional
  `breadcrumbItems` slot used by the new `PageLayout`.
- The Sessions index page now respects `?tab=today|upcoming|past` so the
  consolidated tab strip drives its filter without a redirect.

## Removed / deprecated

- `components/GlobalSearch.tsx` — deleted. Replaced by `CommandPalette`.
- The previous dashboard layout (`/app` index) — replaced by the morning
  briefing. The legacy `components/today/TodaySections.tsx` cards are
  still used on settings/team views and other deep-link previews; the
  dashboard does not render them anymore.
- `card-hover` — kept but neutered: now only changes background, no
  translate or scale, per the design lock.

## Follow-ups

- Three-step onboarding split (`/app/onboarding` → `/about-you`,
  `/your-work`, `/try-it`). The current onboarding is a single screen
  with the new step indicator at the top; the ownership of country and
  timezone fields is still implicit and a future change.
- Parent portal (`/parent/*`) and marketing pages (`/`, `/about`, `/for/*`)
  are unchanged in this pass.
- Real screenshot assets and illustrations for empty states.
