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

## Adding a shortcut

1. Add a `KeyBinding` to `SHORTCUTS` in `lib/keyboard.ts`.
2. Use `useKeyboard('myId', handler)` in the component that owns the action.
3. Reference `shortcutHint('myId')` in tooltips so the UI matches the registry.

Don't define key combos directly inside components — they would never appear
in the overlay and would break consistency across the app.
