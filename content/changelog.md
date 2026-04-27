---
# Crestio changelog. Reverse-chronological. Most recent at top.
# Each entry: version, date (YYYY-MM-DD), title, bullets[].
# Pure text — i18n is intentionally not applied here for now.
---

## 14F — 2026-04-27
### Parent payments via Stripe
- Public payment links — parents pay any unpaid invoice from their email.
- Multi-invoice payment from /parent/pay so a household can pay several invoices in one card swipe.
- Refund flow with audit log.
- 1% Crestio platform fee, separate from Stripe's processing fee.
- Auto-reconcile: paid invoices flip to paid in real time without manual marking.

## 14E.4 — 2026-04-26
### Send polish to parent in one click
- The polish queue gets a single send-to-parent action with editable preview.
- Undo window after send.
- Sample data is now pre-populated for trial accounts and clears in one click.

## 14E.3 — 2026-04-22
### Recurring session templates
- Daily cron that schedules recurring lessons up to 8 weeks ahead.
- Templates pause/end without losing past sessions.
- CSV bulk student import with column mapping.

## 14E.2 — 2026-04-18
### Smart AI model routing
- Polish and simple tasks now use Haiku for speed and cost.
- Lesson plans and complex tasks use Sonnet.
- Quality fallback if the lighter model produces a low-confidence output.

## 14D — 2026-04-12
### Phase 4 design — anticipation, calendar, undo, depth
- Calendar drag-to-reschedule with snap.
- Undo on destructive actions for 8 seconds.
- Inline composer with NLP date parsing — type "Tue 4pm Hector 1h" and get a session.
- Notification center.

## 14C — 2026-04-04
### Phase 3 design — depth, taste, micro-details
- Detail panes with rich editor.
- Saved views.
- Mini bar charts on the dashboard.

## 14B — 2026-03-26
### Phase 2 design — workflows, detail panes, keyboard, density
- ⌘K command palette.
- Keyboard shortcuts on every primary action.
- Density toggle on tables.

## 14A — 2026-03-18
### Design overhaul — navigation, dashboard, design system
- Forest green / cream palette across the app.
- Single sidebar layout.
- Owner brief on the dashboard.

## 14 — 2026-03-10
### File viewer audit log + watermark
- Watermarked PDF / image viewer.
- Per-view audit row, no double-counting.
- Signed-URL refresh during viewing.
