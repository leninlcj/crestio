// Saved views — per-list named filter sets, persisted to localStorage.
// Up to 5 views per list. Stored as a versioned schema so we can migrate
// later without scribbling old data.

const STORAGE_KEY = 'crestio.savedviews.v1';
const MAX_PER_LIST = 5;

export type SavedView = {
  id: string;
  name: string;
  search: string; // serialized URL search string, e.g. "?status=overdue"
  createdAt: number;
};

type Store = Record<string, SavedView[]>; // listId → views

function read(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

export function listViews(listId: string): SavedView[] {
  return read()[listId] ?? [];
}

export function saveView(listId: string, name: string, search: string): SavedView {
  const store = read();
  const list = store[listId] ?? [];
  const existing = list.find((v) => v.name.toLowerCase() === name.toLowerCase());
  const view: SavedView = existing
    ? { ...existing, search }
    : { id: cryptoId(), name, search, createdAt: Date.now() };
  const next = existing
    ? list.map((v) => (v.id === existing.id ? view : v))
    : [view, ...list].slice(0, MAX_PER_LIST);
  store[listId] = next;
  write(store);
  return view;
}

export function deleteView(listId: string, viewId: string) {
  const store = read();
  const list = store[listId] ?? [];
  store[listId] = list.filter((v) => v.id !== viewId);
  write(store);
}

function cryptoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
