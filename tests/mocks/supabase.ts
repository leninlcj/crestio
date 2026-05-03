// Minimal Supabase client mock — chainable just enough to satisfy the call
// patterns used in lib/* (`from(t).select(c).eq(k,v).single()`,
// `update(...).eq(...).select()`, `insert(...)`, `upsert(...)`,
// `auth.getUser()`).
//
// You drive it by passing a `tables` map per test:
//   const supa = createMockSupabase({
//     tables: { sessions: [{ id: 's1', scheduled_at: '...' }] },
//     user: { id: 'u1', email: 'a@b.c' },
//   });
//
// The mock applies `eq`/`in`/`gte`/`lte`/`gt` filters on the in-memory rows.
// Inserts/updates mutate the same in-memory map so a second `select` reflects
// the write — useful for testing idempotent generators.

import { vi } from 'vitest';

type Row = Record<string, unknown>;
type TableMap = Record<string, Row[]>;

type Filter = { kind: 'eq' | 'in' | 'gte' | 'lte' | 'gt' | 'is'; col: string; value: unknown };

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  return rows.filter((r) =>
    filters.every((f) => {
      const v = r[f.col];
      switch (f.kind) {
        case 'eq': return v === f.value;
        case 'in': return Array.isArray(f.value) && (f.value as unknown[]).includes(v);
        case 'gte': return typeof v === 'string' && typeof f.value === 'string' && v >= f.value;
        case 'lte': return typeof v === 'string' && typeof f.value === 'string' && v <= f.value;
        case 'gt': return typeof v === 'string' && typeof f.value === 'string' && v > f.value;
        case 'is': return f.value === null ? v === null : v === f.value;
      }
    }),
  );
}

export type MockSupabaseOptions = {
  tables?: TableMap;
  user?: { id: string; email?: string } | null;
  authError?: unknown;
};

export function createMockSupabase(opts: MockSupabaseOptions = {}) {
  const tables: TableMap = { ...(opts.tables ?? {}) };
  const user = opts.user === undefined ? { id: 'mock-user-id', email: 'mock@example.com' } : opts.user;

  function from(tableName: string) {
    const filters: Filter[] = [];
    let pendingUpdate: Row | null = null;
    let pendingInsert: Row | Row[] | null = null;
    let pendingUpsert: { rows: Row | Row[]; onConflict?: string } | null = null;
    let isUpdate = false;
    let isInsert = false;
    let isUpsert = false;
    let isDelete = false;
    let selectColumns: string | null = null;

    const ensureTable = () => {
      if (!tables[tableName]) tables[tableName] = [];
      return tables[tableName];
    };

    const builder: any = {
      select: (cols?: string) => {
        selectColumns = cols ?? '*';
        return builder;
      },
      insert: (rows: Row | Row[]) => {
        isInsert = true;
        pendingInsert = rows;
        return builder;
      },
      update: (row: Row) => {
        isUpdate = true;
        pendingUpdate = row;
        return builder;
      },
      upsert: (rows: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        isUpsert = true;
        pendingUpsert = { rows, onConflict: options?.onConflict };
        return builder;
      },
      delete: () => {
        isDelete = true;
        return builder;
      },
      eq: (col: string, value: unknown) => { filters.push({ kind: 'eq', col, value }); return builder; },
      in: (col: string, value: unknown[]) => { filters.push({ kind: 'in', col, value }); return builder; },
      gte: (col: string, value: unknown) => { filters.push({ kind: 'gte', col, value }); return builder; },
      lte: (col: string, value: unknown) => { filters.push({ kind: 'lte', col, value }); return builder; },
      gt: (col: string, value: unknown) => { filters.push({ kind: 'gt', col, value }); return builder; },
      is: (col: string, value: unknown) => { filters.push({ kind: 'is', col, value }); return builder; },
      order: () => builder,
      limit: () => builder,

      single: async () => {
        const rows = applyFilters(ensureTable(), filters);
        return rows.length === 1
          ? { data: rows[0], error: null }
          : { data: null, error: { message: 'no rows or multiple rows' } };
      },
      maybeSingle: async () => {
        const rows = applyFilters(ensureTable(), filters);
        return { data: rows[0] ?? null, error: null };
      },
      then: (resolve: (v: unknown) => void) => {
        const result = run();
        resolve(result);
        return Promise.resolve(result);
      },
    };

    function run() {
      const table = ensureTable();
      if (isInsert) {
        const arr = Array.isArray(pendingInsert) ? pendingInsert : [pendingInsert as Row];
        table.push(...arr);
        return { data: selectColumns ? arr : null, error: null };
      }
      if (isUpsert && pendingUpsert) {
        const incoming = Array.isArray(pendingUpsert.rows) ? pendingUpsert.rows : [pendingUpsert.rows];
        const conflict = pendingUpsert.onConflict;
        for (const row of incoming) {
          if (conflict) {
            const idx = table.findIndex((r) => r[conflict] === row[conflict]);
            if (idx >= 0) table[idx] = { ...table[idx], ...row };
            else table.push(row);
          } else {
            table.push(row);
          }
        }
        return { data: incoming, error: null };
      }
      if (isUpdate && pendingUpdate) {
        const matched = applyFilters(table, filters);
        for (const row of matched) Object.assign(row, pendingUpdate);
        return { data: matched, error: null };
      }
      if (isDelete) {
        const keep = table.filter((r) => !applyFilters([r], filters).length);
        const removed = table.length - keep.length;
        tables[tableName] = keep;
        return { data: { count: removed }, error: null };
      }
      return { data: applyFilters(table, filters), error: null };
    }

    return builder;
  }

  const auth = {
    getUser: vi.fn(async () => {
      if (opts.authError) return { data: { user: null }, error: opts.authError };
      return { data: { user }, error: null };
    }),
    signUp: vi.fn(async (params: { email: string; password: string }) => ({
      data: { user: { id: 'new-user', email: params.email }, session: null },
      error: null,
    })),
    signInWithPassword: vi.fn(async () => ({
      data: { user, session: { access_token: 'mock-token' } },
      error: null,
    })),
    signOut: vi.fn(async () => ({ error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  };

  return {
    from: vi.fn(from),
    auth,
    // Expose the in-memory map so tests can assert post-conditions.
    __tables: tables,
  };
}

export type MockSupabase = ReturnType<typeof createMockSupabase>;
