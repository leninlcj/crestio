import { describe, expect, it } from 'vitest';
import { isMissingTableError } from '../../../lib/dbErrors';

describe('isMissingTableError', () => {
  it('recognises Postgres 42P01 and PostgREST PGRST205', () => {
    expect(isMissingTableError({ code: '42P01', message: 'relation "public.enquiries" does not exist' })).toBe(true);
    expect(isMissingTableError({ code: 'PGRST205', message: "Could not find the table 'public.enquiries' in the schema cache" })).toBe(true);
  });
  it('ignores other errors and non-errors', () => {
    expect(isMissingTableError({ code: '23505', message: 'duplicate key value' })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
    expect(isMissingTableError('nope')).toBe(false);
  });
});
