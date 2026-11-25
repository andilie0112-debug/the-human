import { describe, expect, it } from 'vitest';
import { GameSession, defaultCharacter, type SimEvent } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import { fromDate, toParts } from '../../../src/sim/time';

function runUntil(s: GameSession, target: number): SimEvent[] {
  return s.simulate(target - s.clock.minutes);
}

function employed(religionId = 'islam', startMinute = fromDate(2026, 1, 5)) {
  const c = defaultCharacter();
  c.religionId = religionId;
  c.employment = { jobId: 'op', monthlyGross: 5729876, startMinute, workDaysThisMonth: 26, absentDaysThisMonth: 0 };
  return c;
}

describe('GameSession', () => {
  it('starts with savings and does not charge January rent again', () => {
    const s = new GameSession(simData);
    expect(s.wallet.balance).toBe(3500000);
    runUntil(s, fromDate(2027, 1, 31, 23));
    expect(s.wallet.balance).toBe(3500000);
  });

  it('charges rent and mobile data on the 1st at 08:00', () => {
    const s = new GameSession(simData);
    const events = runUntil(s, fromDate(2027, 2, 1, 9));
    const bills = events.filter((e) => e.kind === 'bill');
    expect(bills).toHaveLength(2);
    expect(s.wallet.balance).toBe(3500000 - 1800000 - 100000);
  });

  it('pays the net salary on the 25th', () => {
    const s = new GameSession(simData, employed());
    const events = runUntil(s, fromDate(2027, 1, 25, 9));
    const salary = events.find((e) => e.kind === 'salary');
    expect(salary).toBeDefined();
    expect(s.wallet.balance).toBe(3500000 + 5729876 - 229196 - 38571);
  });

  it('pays THR 7 days before Idul Fitri for Muslim employees (full after 12 months)', () => {
    const s = new GameSession(simData, employed('islam'));
    runUntil(s, fromDate(2027, 3, 3, 7));
    const before = s.wallet.balance;
    const events = runUntil(s, fromDate(2027, 3, 3, 9));
    expect(events.find((e) => e.kind === 'thr')).toEqual({ kind: 'thr', amount: 5729876 });
    expect(s.wallet.balance).toBe(before + 5729876);
  });

  it('pays THR before Christmas for Christian employees, prorated', () => {
    const s = new GameSession(simData, employed('kristen', fromDate(2027, 6, 18)));
    expect(s.isThrDay(fromDate(2027, 12, 18, 8))).toBe(true);
    expect(s.isThrDay(fromDate(2027, 3, 3, 8))).toBe(false);
    s.clock.minutes = fromDate(2027, 12, 18, 7);
    const events = s.simulate(120);
    expect(events.find((e) => e.kind === 'thr')).toEqual({ kind: 'thr', amount: Math.round((5729876 * 6) / 12) });
  });

  it('needs go down as time passes, faster at higher speed', () => {
    const s = new GameSession(simData);
    const k0 = s.character.vitals.needs.kenyang;
    s.tick(30);
    const k1 = s.character.vitals.needs.kenyang;
    s.clock.speed = 3;
    s.tick(30);
    const k2 = s.character.vitals.needs.kenyang;
    expect(k1).toBeLessThan(k0);
    expect(k1 - k2).toBeCloseTo((k0 - k1) * 3, 5);
  });

  it('reports a new day with holidays and the start of Ramadan', () => {
    const s = new GameSession(simData);
    s.clock.minutes = fromDate(2027, 2, 7, 23);
    const events = s.simulate(120);
    expect(events).toContainEqual({ kind: 'newDay', holidays: [], ramadanStart: true });
    s.clock.minutes = fromDate(2027, 8, 16, 23);
    expect(s.simulate(120)).toContainEqual({ kind: 'newDay', holidays: ['HUT RI'], ramadanStart: false });
  });

  it('fasting slows hunger during Ramadan daytime for Muslims who fast', () => {
    const fasting = new GameSession(simData);
    fasting.clock.minutes = fromDate(2027, 2, 15, 10);
    fasting.simulate(60);
    const notFasting = new GameSession(simData, { ...defaultCharacter(), religionId: 'kristen' });
    notFasting.clock.minutes = fromDate(2027, 2, 15, 10);
    notFasting.simulate(60);
    expect(fasting.character.vitals.needs.kenyang).toBeGreaterThan(notFasting.character.vitals.needs.kenyang);
    expect(fasting.canEat()).toBe(false);
  });

  it('fires a burnout event once when stress reaches 95', () => {
    const s = new GameSession(simData);
    s.character.vitals.stress = 94.9;
    s.character.vitals.needs.kenyang = 5;
    const events = s.simulate(120);
    expect(events.filter((e) => e.kind === 'burnout')).toHaveLength(1);
  });

  it('exercise days change the body overnight', () => {
    const s = new GameSession(simData);
    s.character.activity = 'exercising';
    const m0 = s.character.body.muscle;
    s.simulate(fromDate(2027, 1, 2, 1) - s.clock.minutes);
    expect(s.character.body.muscle).toBeGreaterThan(m0);
  });

  it('homesickness grows daily for perantau characters only', () => {
    const p = new GameSession(simData, { ...defaultCharacter(), perantau: true });
    p.simulate(3 * 24 * 60);
    expect(p.character.vitals.kangen).toBeGreaterThan(0);
    const local = new GameSession(simData);
    local.simulate(3 * 24 * 60);
    expect(local.character.vitals.kangen).toBe(0);
  });

  it('keeps the clock exact across hour boundaries', () => {
    const s = new GameSession(simData);
    s.simulate(24 * 60);
    expect(toParts(s.clock.minutes)).toMatchObject({ day: 2, hour: 7, minute: 0 });
  });
});
