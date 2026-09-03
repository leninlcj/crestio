// Supabase/PostgREST error helpers.

// A table that has not been created yet surfaces as Postgres 42P01 when the
// query reaches the database, or as PostgREST PGRST205 ("Could not find the
// table ... in the schema cache") when PostgREST rejects it first.
export function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  if (e.code === '42P01' || e.code === 'PGRST205') return true;
  const m = (e.message ?? '').toLowerCase();
  return m.includes('schema cache') || (m.includes('relation') && m.includes('does not exist'));
}
