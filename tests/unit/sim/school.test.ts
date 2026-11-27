import { describe, expect, it } from 'vitest';
import sim from '../../../src/data/sim.json';
import { isSchoolDay, raporGrade, schoolLevel, schoolState, type SchoolConfig } from '../../../src/sim/children';
import { GameSession } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import { fromDate } from '../../../src/sim/time';

const cfg = sim.children.school as unknown as SchoolConfig;
const monday = { month: 3, day: 1, weekday: 1, holiday: false };

describe('school', () => {
  it('levels by age: SD 6-12, SMP 13-15, SMA 16-17', () => {
    expect(schoolLevel(5)).toBeNull();
    expect(schoolLevel(6)).toBe('SD');
    expect(schoolLevel(13)).toBe('SMP');
    expect(schoolLevel(17)).toBe('SMA');
    expect(schoolLevel(18)).toBeNull();
  });

  it('weekdays only, not on public or semester holidays', () => {
    expect(isSchoolDay(monday, cfg)).toBe(true);
    expect(isSchoolDay({ ...monday, weekday: 0 }, cfg)).toBe(false);
    expect(isSchoolDay({ ...monday, holiday: true }, cfg)).toBe(false);
    expect(isSchoolDay({ month: 7, day: 1, weekday: 1, holiday: false }, cfg)).toBe(false);
    expect(isSchoolDay({ month: 12, day: 24, weekday: 1, holiday: false }, cfg)).toBe(false);
  });

  it('uniform at six, away from half past six, SD home before SMA', () => {
    expect(schoolState(8, monday, 6.2, cfg)).toBe('uniform');
    expect(schoolState(8, monday, 9, cfg)).toBe('away');
    expect(schoolState(8, monday, 13.5, cfg)).toBe('home');
    expect(schoolState(16, monday, 13.5, cfg)).toBe('away');
    expect(schoolState(4, monday, 9, cfg)).toBe('home');
  });

  it('report card grades follow learning and happiness', () => {
    expect(raporGrade({ study: 10, happiness: 90 })).toBe('A');
    expect(raporGrade({ study: 0, happiness: 30 })).toBe('D');
  });

  it('the session sends children off and back, and they learn', () => {
    const s = new GameSession(simData);
    s.children.push({ id: 'k1', name: 'Budi Santoso', gender: 'male', age: 8, ageDays: 0, happiness: 80, study: 1 });
    s.clock.minutes = fromDate(2027, 3, 1, 5, 50); // a Monday
    const morning = s.simulate(30);
    expect(morning.some((e) => e.kind === 'family' && e.textKey === 'kid.toSchool')).toBe(true);
    expect(s.schoolStates().get('k1')).toBe('uniform');
    const day = s.simulate(8 * 60);
    expect(day.some((e) => e.kind === 'family' && e.textKey === 'kid.fromSchool')).toBe(true);
    expect(s.children[0].study).toBeGreaterThan(1);
  });
});
