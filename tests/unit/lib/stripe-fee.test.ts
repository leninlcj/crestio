import { describe, it, expect } from 'vitest';
import { calculateFees } from '@/lib/stripe/payments';

// `calculateFees(amountCents)` implements:
//   applicationFee = max(50, ceil(amount * 0.01))   // 1% with $0.50 floor
// It returns `{ amountTotal, applicationFee }`. Stripe's 2.9%+30¢ processing
// fee is taken from the connected account's balance separately and is NOT
// part of `application_fee_amount`. Currency is currently NOT a parameter —
// see tests/README.md "Known gaps" for JPY (zero-decimal) handling.
describe('calculateFees', () => {
  it('returns 0 application fee for non-positive or non-finite amounts', () => {
    expect(calculateFees(0).applicationFee).toBe(0);
    expect(calculateFees(-100).applicationFee).toBe(0);
    expect(calculateFees(NaN).applicationFee).toBe(0);
    expect(calculateFees(Number.POSITIVE_INFINITY).applicationFee).toBe(0);
  });

  it('passes amountTotal through unchanged', () => {
    expect(calculateFees(12345).amountTotal).toBe(12345);
    expect(calculateFees(50).amountTotal).toBe(50);
  });

  it('applies the $0.50 floor for small amounts (any amount up to $50.00)', () => {
    // 1% of $1 (100¢) is 1¢; floor brings it to 50¢.
    expect(calculateFees(100).applicationFee).toBe(50);
    // 1% of $10 (1000¢) is 10¢; still floored to 50¢.
    expect(calculateFees(1000).applicationFee).toBe(50);
    // 1% of $50 (5000¢) is exactly 50¢ — boundary, no rounding kicks in.
    expect(calculateFees(5000).applicationFee).toBe(50);
  });

  it('above the floor: 1% with ceiling rounding (so the platform never short-collects)', () => {
    // 1% of $50.01 (5001¢) = 50.01¢ → ceil → 51¢.
    expect(calculateFees(5001).applicationFee).toBe(51);
    // 1% of $100 (10_000¢) = 100¢ exactly, no rounding.
    expect(calculateFees(10_000).applicationFee).toBe(100);
    // 1% of $123.45 (12_345¢) = 123.45¢ → ceil → 124¢.
    expect(calculateFees(12_345).applicationFee).toBe(124);
    // 1% of $999.99 (99_999¢) = 999.99¢ → ceil → 1000¢.
    expect(calculateFees(99_999).applicationFee).toBe(1000);
  });

  it('large amounts: the 1% scales linearly without overflow', () => {
    // 1% of $1,000 = $10 → 1000¢
    expect(calculateFees(100_000).applicationFee).toBe(1000);
    // 1% of $10,000 = $100 → 10_000¢
    expect(calculateFees(1_000_000).applicationFee).toBe(10_000);
  });

  it('GBP / USD / EUR / AUD all use the same cent-based math (two-decimal currencies)', () => {
    // Currency is not yet a parameter — but for the four major two-decimal
    // currencies the input "amountCents" is uniform: the fee math is the same
    // regardless of which symbol is rendered to the parent.
    const aud = calculateFees(15_000); // AU$150.00
    const usd = calculateFees(15_000); // US$150.00
    const gbp = calculateFees(15_000); // £150.00
    const eur = calculateFees(15_000); // €150.00
    expect(aud.applicationFee).toBe(150);
    expect(usd.applicationFee).toBe(usd.applicationFee);
    expect(gbp.applicationFee).toBe(150);
    expect(eur.applicationFee).toBe(150);
    expect([aud, usd, gbp, eur].every((f) => f.applicationFee === 150)).toBe(true);
  });

  it('rounding edge: 1% of $0.51 (51¢) is 0.51¢ → ceil → 1¢ → floored to 50¢', () => {
    expect(calculateFees(51).applicationFee).toBe(50);
  });

  // Documented gap: zero-decimal currencies like JPY are not yet handled —
  // the caller would need to pass yen as the integer amount (already correct
  // since JPY has no fractional unit), but the floor of 50 would translate
  // to ¥50, which is conceptually equivalent to 50¢ rather than the intended
  // ¥0.50. When `calculateFees` grows a `currency` parameter, add tests for
  // JPY: `expect(calculateFees(1000, 'JPY').applicationFee).toBeLessThan(50)`.
  it.skip('JPY: zero-decimal currency floor (deferred — needs currency parameter on calculateFees)', () => {
    // Placeholder; un-skip once the API supports currency.
  });
});
