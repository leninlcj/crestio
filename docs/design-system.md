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

---

# Phase 2 patterns (workflows over screens)

The phase-2 pass adds a small set of shared primitives that turn list pages
into workflows. They live in `components/design/*` and are exported from
`components/design/index.ts`.

## DetailPane (`DetailPane.tsx`)

A right-side slide-in panel (480px on desktop, full-screen sheet on mobile).
Used everywhere a list row reveals details: sessions, students, invoices,
files, lesson plans, parent threads.

```tsx
import { DetailPane, useDetailParam } from '@/components/design';

const detail = useDetailParam();
const sessionId = detail.value?.startsWith('session:') ? detail.value.slice(8) : null;

<MyList onRowClick={(id) => detail.open(`session:${id}`)} />
<DetailPane open={!!sessionId} onClose={detail.close} title="Session" fullPageHref={`/app/sessions/${sessionId}`}>
  …
</DetailPane>
```

URL state lives in `?detail=type:id`. Esc / click-outside / back button all
close. The pane sets `body { overflow: hidden }` while open. Always pair with
a `fullPageHref` so power users can jump to the existing detail route.

## Inline editing (`InlineEditField`, `EditableStatusPill`, `useInlineEdit`)

Click a value → input. Enter saves, Esc cancels. Optimistic; reverts on save
failure and shows a toast. Used for student name/year/subjects, invoice notes,
status pills.

```tsx
<InlineEditField value={student.name} onSave={(name) => patchStudent({ name })} />
<EditableStatusPill value={inv.status} options={STATUS_OPTIONS} onChange={changeStatus} />
```

## Keyboard shortcuts (`lib/keyboard.ts`, `useKeyboard`, `KeyboardShortcutsOverlay`)

Single registry; components reference shortcuts by id. The overlay (mounted
once from `_app.tsx`, opens with `?`) is always in sync because it reads from
the same source. See `docs/keyboard-shortcuts.md` for the full list.

```tsx
useKeyboard('listDown', () => setIdx((i) => i + 1));
useKeyboard('listOpen', () => detail.open(`session:${rows[idx].id}`));
```

`G H`/`G S`/etc are wired in `components/GlobalKeyboardNav.tsx`. Don't add new
combos in components — extend the registry.

## Filter chips + URL state (`FilterChips`, `SavedViewsMenu`)

Every list bar follows: search left · chips middle · sort right. Each filter
is a URL search param. Saved views (per-list, ≤5) live in localStorage via
`lib/saved-views.ts` and round-trip the URL search string.

## Bulk actions (`BulkActionBar`)

A floating dark pill shown when row selection is non-empty. Clear button on
the right. Caller wires actions; default actions stay primary-action-shaped.

## Density tokens

- List row height: 48px (was 56). Use `style={{ minHeight: 48 }}` on `<li>`s.
- Default font size on list rows: 13px (`text-[13px]`). Page body stays 14px.
- Numeric columns: right-aligned + `tabular`.
- Hover quick-actions: revealed via `opacity-0 group-hover:opacity-100`.
- Detail-pane sub-tabs: 2px forest underline, no fill.

## Sparklines (`Sparkline`)

12-18px tall SVG, no axis, area + line. Bottom of stat cards. Pass any
`number[]` — typically a 7-day series from `/api/dashboard/today`.

## Now line (`NowLine`, `useNowMinute`)

Thin horizontal forest line dropped into a vertical timeline between past and
future rows. Updates every minute via `useNowMinute`.

## Mini calendar (`MiniCalendar`)

14-day pill row centered on today. Active day filled forest, today outlined,
days with sessions show a dot. Used at the top of Sessions → Today.

## Route progress + global polish

`RouteProgressBar` (mounted in `_app.tsx`) draws a 2px forest bar across the
top during route changes. Replaces page-level spinners.

The `EmptyState` component is now compact: 24px icon, two short lines, one
CTA, max ~320px wide. Drop the legacy "grand" empty state — pages should
read as factual.

## Pages upgraded in this pass

- `/app` — dashboard sparklines, NowLine, dismissible nudges, owner team card.
- `/app/sessions` — Today/Upcoming/Past/Polish-queue tab strip, MiniCalendar
  on Today, FilterChips on Past, DetailPane row click, BulkActionBar.
- `/app/students` — grid+list views, FilterChips for status/subject, full
  StudentDetailPane with sub-tabs and inline edit.
- `/app/invoices` — multi-select status chips, DetailPane, bulk Mark paid.
- `/app/payouts-received` — new page; pre-14F empty state, post-14F balance + payouts list.
- `/app/lesson-plans` — denser card grid (3-up).
- `/app/messages` — two-pane Linear-style inbox with J/K nav.
- `/auth/signin` — desktop quote on the right column.

Pages that only got token cleanup: `/app/files`, `/app/tutors`,
`/app/payouts`, `/app/templates`, `/app/households`, `/app/settings/*`.

---

## Phase 3 — depth, taste, micro-details (2026-04-27)

Phase 3 is a craft pass on top of phase 2. No new top-level destinations; no
schema or API contract changes (one additive field on
`/api/dashboard/today`). Goal: every screen one layer deeper, plus the small
invisible things that distinguish a $24/mo tool from a $9 one.

### Format helpers (lib/format.ts)

Single source of truth for user-facing strings. Older callers keep working
through `lib/utils` and `lib/currency`; new code imports from here.

| Helper                | Output                                              |
|-----------------------|-----------------------------------------------------|
| `formatMoney`         | `$50` for whole amounts, `$50.50` for fractional    |
| `formatMoneyCompact`  | `$1.2k`, `$14k`, `$1.4M` (≥ $1000)                  |
| `formatDuration`      | `45m`, `1h`, `1h 30m`, `2h`                         |
| `formatRelativeDate`  | `Today`, `Yesterday`, `3 days ago`, `last week`     |
| `formatTime`          | locale-aware (12h US, 24h elsewhere)                |
| `formatPhone`         | E.164 prettified for US/AU; raw fallback elsewhere  |
| `formatList`          | Locale-aware list join via `Intl.ListFormat`        |
| `formatCount`         | `1,234` with locale grouping                        |
| `pluralize`           | `1 session` / `12 sessions`                         |

### Focus rings

Single global ring via `:focus-visible` (mouse clicks don't trigger it):
2px forest green, 2px outset, 6px radius. Inputs render their own 2px ring
inside the border via `box-shadow`.

### Motion budget

| Surface                      | Duration | Easing       |
|------------------------------|----------|--------------|
| Page transitions             | 100ms    | fade         |
| DetailPane open              | 180ms    | ease-out     |
| Hover bg color               | 80–100ms | ease         |
| Toast in                     | 200ms    | ease-out     |
| Toast out                    | 150ms    | ease-in      |
| Skeleton shimmer             | 1.4s     | ease-in-out  |
| Status pill change           | 100ms    | crossfade    |
| Stat-card count up           | 400ms    | ease-out     |
| Session "in session" pulse   | 2s       | ease-in-out  |
| Overdue dot pulse            | 1.6s     | ease-in-out  |

`prefers-reduced-motion: reduce` collapses every animation/transition to
1ms (kept for paint-stability), and disables shimmer / pulse keyframes.

### Status palette

Pills only — never used as background fills elsewhere. 11px text, 4px / 8px
padding, 999px radius, **500 weight** (down from semibold; reads more grown
up at small sizes).

| Tone     | Text         | Background tint           |
|----------|--------------|---------------------------|
| neutral  | `ink-muted`  | `ruleSoft`                |
| forest   | `forest-ink` | `rgba(31, 58, 46, 0.08)`  |
| success  | `success-ink`| `rgba(47, 125, 79, 0.10)` |
| amber    | `amber-ink`  | `rgba(184, 134, 11, 0.10)`|
| claret   | `claret`     | `rgba(122, 34, 51, 0.08)` |
| rust     | `rust`       | `rgba(139, 74, 31, 0.08)` |

Forest green stays accent only. Success is its own green for "logged".

### Print stylesheet

Global rules in `styles/globals.css`. Hides nav / sidebar / top bar; expands
`main` to full width; removes shadows and hover state; `font-size: 11pt`,
`line-height: 1.4`. The DetailPane "..." menu's Print option sets
`document.body.dataset.printingPane = 'true'` so only the pane content
prints (everything else is hidden via `body[data-printing-pane='true']`
selectors).

### Selection color

Forest green at 18% opacity for `::selection`.

### Avatar generation

Deterministic. Hue is `hash(name) % 360`; saturation 60%, lightness 42%;
white text on top. Initials are first letter of full_name + first letter of
last word. Component: `components/design/Avatar.tsx`. Use `<Avatar
name={...} size={20|24|28|32|40|48} />` everywhere a person appears.

### Tooltip rules

`components/design/Tooltip.tsx` — 11px text, 6/10 padding, 6px radius, dark
on white via portal so it escapes overflow:hidden parents. 200ms show
delay, 0ms hide. Used on icon-only buttons, pipeline glyphs, kbd shortcuts,
truncated text.

### New primitives (phase 3)

| File                                  | What                                                |
|---------------------------------------|-----------------------------------------------------|
| `Avatar.tsx`                          | Deterministic colored avatar (hue from name hash)   |
| `AvatarGroup.tsx`                     | Overlapping circles with `+N` overflow              |
| `Tooltip.tsx`                         | Portal tooltip with show delay                      |
| `KbdHint.tsx`                         | One or more `<kbd>` chips for shortcuts             |
| `ContextMenu.tsx`                     | Right-click menu with arrow-key navigation          |
| `Stepper.tsx`                         | Pipeline dots (done / current / todo) for panes     |
| `MiniBarChart.tsx`                    | Tiny bars or stacked-bar for cards & strips         |
| `HealthIndicator.tsx`                 | Strong / Cooling / At risk visual on student panes  |
| `UsageBar.tsx`                        | Plan-quota progress bar (Settings → Billing)        |
| `Diff.tsx`                            | Word-level diff (LCS) for the polish preview       |
| `RichEditor.tsx`                      | Minimal contenteditable: bold / italic / lists      |
| `lib/useCountUp.ts`                   | Animate numeric stat values over 400ms ease-out     |

### Per-screen depth

- **Dashboard**: stat cards now render delta vs. previous week, end-dot on
  the sparkline, and a hover tooltip showing current + previous totals.
  Today timeline rows show student avatars; the "in-session" row pulses
  the green left border. New "Tomorrow at a glance" collapsed row appears
  on weekdays. New "What changed" feed surfaces parent-initiated events
  with a forest-tinted background and offers `All / Parents / Money /
  Sessions` chips. Owner team card adds a stacked-bar by tutor.
- **Sessions**: row carries a 5-dot pipeline glyph (scheduled · drafted ·
  polished · sent · invoiced); right-click opens a context menu (open,
  polish, send, reschedule, mark cancelled, duplicate, copy link, delete);
  Past tab adds a "billed" indicator next to status pill; bulk action bar
  detects same-household selections and surfaces a single-invoice CTA.
  Today tab gets a left-edge "now" pill with current time.
- **Polish queue**: top-of-page slim 2px progress bar during "Polish all";
  cancellable; per-card diff view (additions highlighted, removals
  strikethrough) once polished returns.
- **Templates**: real card grid (3-up), next 3 occurrences inline, end-template
  link.
- **Sessions DetailPane**: pipeline `Stepper` at the top; notes editor is
  the new RichEditor (auto-saves every 2s with status indicator).
- **Students cards**: deterministic Avatar; status dot (active / cooling
  / new) replaces the heavier pill; "Next: Tue 4pm" line; 28-day activity
  strip via MiniBarChart.
- **Student DetailPane**: header avatar; 4 mini stats with hover tooltips;
  HealthIndicator row; new **Plan** sub-tab (templates + 12-week sparkline);
  Files sub-tab is a real drag-drop zone; Notes sub-tab uses RichEditor.
- **Households**: existing tab unchanged.
- **Parents (new)**: `/app/parents` row list. Avatar, household link, copy
  on email, invitation status pill, bulk "Send invite to selected" via
  BulkActionBar.
- **Invoices**: invoice-number search; URL filter wiring extended to
  `draft / sent / paid`; hover quick actions Send · Mark paid · Copy link;
  bulk Send button; pulsing red dot next to overdue rows.
- **Invoice DetailPane**: Timeline subsection (created → sent → paid →
  voided), each event with timestamp + actor.
- **Payouts received**: pre-14F page is now a 3-bullet explainer card with
  a primary CTA to Stripe Connect onboarding; post-14F adds a 30-day
  deposit sparkline at the top with the latest value pinned.
- **Files**: tabbed /app/files now has a 240px left folder tree (By
  student auto-grouped, By date buckets) selecting from which updates the
  right `FilesPanel`.
- **Lesson plans**: difficulty pill (Beginner / Intermediate / Advanced)
  inferred from year level; "Use in session" modal creates the session +
  attaches the plan in one flow.
- **Messages**: thread row gets an avatar and a hover Snooze button
  (Tomorrow morning · This evening · Next week); snoozed threads
  disappear and reappear automatically.
- **Settings → Billing**: `UsagePanel` shows AI calls / storage / voice
  transcription against plan limits via `UsageBar`.
- **Settings → Notifications**: regrouped into **Sessions / Money / Parents**;
  each row exposes Email + Push toggles (Push disabled with a tooltip).

### Performance pass

- Detail panes (Session / Student / Invoice) are loaded via `next/dynamic`
  with `ssr: false`. They no longer ship in the page chunk.
- Stat-card count-up via `requestAnimationFrame`; suppressed under
  reduced motion.
- Toast viewport caps at 3 visible; older non-error toasts are dropped to
  make room for newer ones.
- Tooltip portal mounts only when shown; auto-hides on scroll.

### Deferred (not in this phase)

- Onboarding split into 3 routes (`/app/onboarding/about|work|sample`).
- Drag-to-reschedule on the Today timeline (the current Today view is a
  flat list, not a slot timeline). Reschedule is reachable through the
  row context menu instead.
- Team Tutors detail pane; payout-preview modal.
- Households row-list with sort by unpaid balance (current grid kept).
- Virtualization for >100-row lists (current lists cap query at ≤500
  rows; not yet hot enough to warrant a windowing dependency).
- Tiptap / Lexical-based rich editor — phase 3 ships a minimal
  `contentEditable` editor with the same surface area (bold, italic,
  bullet, ordered list).
