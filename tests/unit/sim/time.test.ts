import { describe, expect, it } from 'vitest';
import { fromDate, monthsBetween, parseClock, toParts } from '../../../src/sim/time';

describe('game time', () => {
  it('starts counting at 1 January 2027 00:00 (a Friday)', () => {
    expect(toParts(0)).toEqual({ year: 2027, month: 1, day: 1, hour: 0, minute: 0, weekday: 5 });
  });

  it('round-trips calendar dates', () => {
    const t = fromDate(2027, 3, 10, 18, 30);
    expect(toParts(t)).toMatchObject({ year: 2027, month: 3, day: 10, hour: 18, minute: 30 });
  });

  it('parses clock strings', () => {
    expect(parseClock('04:30')).toBe(270);
  });

  it('counts whole months of service', () => {
    expect(monthsBetween(fromDate(2027, 1, 4), fromDate(2027, 3, 3))).toBe(1);
    expect(monthsBetween(fromDate(2027, 1, 4), fromDate(2027, 3, 4))).toBe(2);
    expect(monthsBetween(fromDate(2027, 1, 4), fromDate(2028, 1, 4))).toBe(12);
  });
});
