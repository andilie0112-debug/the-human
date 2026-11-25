import { describe, expect, it } from 'vitest';
import { Calendar } from '../../../src/sim/calendar';
import { fromDate } from '../../../src/sim/time';
import holidays from '../../../src/data/holidays.json';
import sim from '../../../src/data/sim.json';

const cal = new Calendar(holidays, sim.fasting);

describe('Calendar', () => {
  it('finds holidays and reuses dates every year', () => {
    expect(cal.holidaysOn(fromDate(2027, 8, 17, 9)).map((h) => h.name)).toEqual(['HUT RI']);
    expect(cal.isPublicHoliday(fromDate(2028, 12, 25))).toBe(true);
    expect(cal.isPublicHoliday(fromDate(2027, 2, 20))).toBe(false); // Cap Go Meh is not a day off
  });

  it('knows the Ramadan period', () => {
    expect(cal.isRamadan(fromDate(2027, 2, 7))).toBe(false);
    expect(cal.isRamadan(fromDate(2027, 2, 8))).toBe(true);
    expect(cal.isRamadan(fromDate(2027, 3, 9, 23))).toBe(true);
    expect(cal.isRamadan(fromDate(2027, 3, 10))).toBe(false);
  });

  it('fasting hours are 04:30 to 18:00 on Ramadan days', () => {
    expect(cal.isFastingTime(fromDate(2027, 2, 15, 4, 29))).toBe(false);
    expect(cal.isFastingTime(fromDate(2027, 2, 15, 4, 30))).toBe(true);
    expect(cal.isFastingTime(fromDate(2027, 2, 15, 17, 59))).toBe(true);
    expect(cal.isFastingTime(fromDate(2027, 2, 15, 18, 0))).toBe(false);
    expect(cal.isFastingTime(fromDate(2027, 4, 15, 12, 0))).toBe(false);
  });

  it('only locks eating for Muslim characters who chose to fast', () => {
    const noon = fromDate(2027, 2, 15, 12);
    expect(cal.canEat(noon, 'islam', true)).toBe(false);
    expect(cal.canEat(noon, 'islam', false)).toBe(true);
    expect(cal.canEat(noon, 'kristen', true)).toBe(true);
    expect(cal.canEat(fromDate(2027, 2, 15, 19), 'islam', true)).toBe(true);
  });
});
