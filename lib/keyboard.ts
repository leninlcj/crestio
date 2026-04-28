// Single source of truth for every keyboard shortcut in the app.
// Components register handlers by id; useKeyboard wires them up.
//
// Format used in UI:  "⌘K", "⌘⇧N", "G H", "?"
// Internal binding:   { keys: ['mod+k'], hint: '⌘K' }
//                     { sequence: ['g', 'h'], hint: 'G H' }
//
// Conventions:
//   mod = ⌘ on macOS, Ctrl on others.
//   Sequences are uppercase letters that only fire when typed in order
//   within 1.2s and not inside an input.

export type KeyBinding = {
  /** Identifier — components use it to register handlers. */
  id: string;
  /** Human label for the shortcut overlay and tooltips. */
  label: string;
  /** Bucket — used to group rows in the overlay. */
  group: 'Global' | 'Lists' | 'Detail pane' | 'Navigation';
  /** Display string ("⌘K", "G H", "?"). */
  hint: string;
  /** Lower-case key combos with `mod+` for ⌘/Ctrl. Either keys or sequence. */
  keys?: string[];
  /** Sequence of single keys (used for "G then H"-style). */
  sequence?: string[];
  /** When true, fires even when focus is inside an input. */
  allowInInput?: boolean;
};

export const SHORTCUTS: KeyBinding[] = [
  // --- Global -----------------------------------------------------------
  { id: 'palette',     label: 'Search anything',       group: 'Global',     hint: '⌘K',     keys: ['mod+k'], allowInInput: true },
  { id: 'help',        label: 'Keyboard shortcuts',    group: 'Global',     hint: '?',      keys: ['?', 'shift+/'] },
  { id: 'newSession',  label: 'New session',           group: 'Global',     hint: '⌘⇧N',   keys: ['mod+shift+n'], allowInInput: true },
  { id: 'inlineCompose', label: 'Inline composer',     group: 'Global',     hint: 'N',      keys: ['n'] },
  { id: 'composerSave',  label: 'Save composer',       group: 'Global',     hint: '⌘↵',    keys: ['mod+enter'], allowInInput: true },

  // --- Navigation -------------------------------------------------------
  { id: 'goHome',      label: 'Go to Home',            group: 'Navigation', hint: 'G H',    sequence: ['g', 'h'] },
  { id: 'goSessions',  label: 'Go to Sessions',        group: 'Navigation', hint: 'G S',    sequence: ['g', 's'] },
  { id: 'goPeople',    label: 'Go to People',          group: 'Navigation', hint: 'G P',    sequence: ['g', 'p'] },
  { id: 'goMoney',     label: 'Go to Money',           group: 'Navigation', hint: 'G M',    sequence: ['g', 'm'] },
  { id: 'goResources', label: 'Go to Resources',       group: 'Navigation', hint: 'G R',    sequence: ['g', 'r'] },
  { id: 'goTeam',      label: 'Go to Team',            group: 'Navigation', hint: 'G T',    sequence: ['g', 't'] },
  { id: 'goNew',       label: 'New session',           group: 'Navigation', hint: 'G N',    sequence: ['g', 'n'] },

  // --- Lists ------------------------------------------------------------
  { id: 'listDown',    label: 'Move down',             group: 'Lists',      hint: 'J',      keys: ['j'] },
  { id: 'listUp',      label: 'Move up',               group: 'Lists',      hint: 'K',      keys: ['k'] },
  { id: 'listOpen',    label: 'Open detail',           group: 'Lists',      hint: '⏎',     keys: ['enter'] },
  { id: 'listSelect',  label: 'Select row',            group: 'Lists',      hint: 'X',      keys: ['x'] },
  { id: 'listSelectAll', label: 'Select all visible',  group: 'Lists',      hint: '⌘A',    keys: ['mod+a'] },
  { id: 'listEdit',    label: 'Edit selected',         group: 'Lists',      hint: 'E',      keys: ['e'] },
  { id: 'listFilter',  label: 'Focus filter',          group: 'Lists',      hint: '/',      keys: ['/'] },

  // --- Detail pane -----------------------------------------------------
  { id: 'paneClose',   label: 'Close pane',            group: 'Detail pane', hint: 'Esc',   keys: ['escape'], allowInInput: true },
  { id: 'paneSave',    label: 'Save',                  group: 'Detail pane', hint: '⌘⏎',   keys: ['mod+enter'], allowInInput: true },
  { id: 'paneBack',    label: 'Back to previous pane', group: 'Detail pane', hint: '⌘[',   keys: ['mod+['] },
  { id: 'paneForward', label: 'Forward (re-push pane)', group: 'Detail pane', hint: '⌘]',   keys: ['mod+]'] },

  // --- Universal undo --------------------------------------------------
  { id: 'undo',        label: 'Undo last action',      group: 'Global',     hint: '⌘Z',    keys: ['mod+z'] },
  { id: 'redo',        label: 'Redo',                  group: 'Global',     hint: '⌘⇧Z',   keys: ['mod+shift+z'] },
  { id: 'selectMatching', label: 'Select all matching filter', group: 'Lists', hint: '⌘⇧A', keys: ['mod+shift+a'] },
  { id: 'quickCreate', label: 'Quick create',          group: 'Global',     hint: '⌘N',    keys: ['mod+n'] },
];

export function shortcutById(id: string): KeyBinding | undefined {
  return SHORTCUTS.find((s) => s.id === id);
}

export function shortcutHint(id: string): string {
  return shortcutById(id)?.hint ?? '';
}
