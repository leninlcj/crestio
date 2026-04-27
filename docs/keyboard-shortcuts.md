# Keyboard shortcuts

The single source of truth is `lib/keyboard.ts`. The in-app overlay (open
with `?`) is generated from the same registry, so it never drifts.

`mod` = ⌘ on macOS, Ctrl elsewhere.

## Global

| Shortcut | Action |
|---------|--------|
| `⌘K`    | Open command palette / search |
| `?`     | Open this shortcuts overlay |
| `⌘⇧N`  | New session |

## Navigation (G-prefix sequences)

Press `G` then the second key within 1.2 seconds. Sequences are ignored when
focus is inside an input.

| Shortcut | Goes to |
|---------|---------|
| `G H`   | Home (`/app`) |
| `G S`   | Sessions (`/app/sessions`) |
| `G P`   | People (`/app/students`) |
| `G M`   | Money (`/app/invoices`) |
| `G R`   | Resources (`/app/lesson-plans`) |
| `G T`   | Team (`/app/tutors`) |
| `G N`   | New session (`/app/sessions/new`) |

## Lists

Active in any list backed by `useListNav` (Sessions, Students, Invoices,
Messages thread list).

| Shortcut | Action |
|---------|--------|
| `J`     | Move down |
| `K`     | Move up |
| `↩`    | Open detail pane |
| `X`     | Toggle row selection |
| `⌘A`   | Select all visible |
| `E`     | Edit selected |
| `/`     | Focus filter / search |

## Detail pane

| Shortcut | Action |
|---------|--------|
| `Esc`   | Close pane |
| `⌘↩`   | Save |
| `Tab`   | Next field |

## Command palette (⌘K)

| Shortcut | Action |
|---------|--------|
| `↑↓`    | Navigate results |
| `↩`    | Open / run |
| `⎋`    | Close |
| `:s <q>`  | Filter to students only |
| `:se <q>` | Filter to sessions only |
| `:i <q>`  | Filter to invoices only |
| `:l <q>`  | Filter to lesson plans only |

## Right-click context menu

Available on session list rows. Items: Open · Polish notes · Send to parent ·
Reschedule · Mark cancelled · Duplicate · Copy link · Delete.

## Messages snooze

A snooze button on every thread (top-right of the row, on hover). Presets:
Tomorrow morning · This evening · Next week. Snoozed threads disappear from
the list and reappear automatically at the chosen time. Snooze state lives in
`localStorage` (key: `crestio.messages.snooze.v1`).

## Rich-editor shortcuts (notes, messages)

| Shortcut | Action |
|---------|--------|
| `⌘B`   | Bold |
| `⌘I`   | Italic |

## Adding a shortcut

1. Add a `KeyBinding` to `SHORTCUTS` in `lib/keyboard.ts`.
2. Use `useKeyboard('myId', handler)` in the component that owns the action.
3. Reference `shortcutHint('myId')` in tooltips so the UI matches the registry.

Don't define key combos directly inside components — they would never appear
in the overlay and would break consistency across the app.
