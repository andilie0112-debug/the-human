import { describe, expect, it } from 'vitest';
import { clockTime, longDate, rupiah } from '../../src/ui/format';
import { fmt } from '../../src/data/strings';
import { toParts, fromDate } from '../../src/sim/time';

describe('formatting', () => {
  it('formats rupiah with dots', () => {
    expect(rupiah(3500000)).toBe('Rp3.500.000');
    expect(rupiah(-100000)).toBe('-Rp100.000');
  });

  it('formats Indonesian dates and times', () => {
    const p = toParts(fromDate(2027, 1, 1, 7, 5));
    expect(longDate(p)).toBe('Jumat, 1 Januari 2027');
    expect(clockTime(p)).toBe('07:05');
  });

  it('fills placeholders', () => {
    expect(fmt('THR cair! +{amount}', { amount: 'Rp1' })).toBe('THR cair! +Rp1');
  });
});
