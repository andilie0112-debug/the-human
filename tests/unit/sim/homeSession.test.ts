import { describe, expect, it } from 'vitest';
import { GameSession, defaultCharacter } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import { fromDate } from '../../../src/sim/time';

describe('home in the session', () => {
  it('starts with the kos furniture placed', () => {
    const s = new GameSession(simData);
    expect(s.home.layoutId).toBe('kos');
    expect(s.home.placements.map((p) => p.id)).toContain('bed');
  });

  it('buys with cash or paylater; paylater instalments are billed monthly', () => {
    const s = new GameSession(simData);
    const before = s.wallet.balance;
    expect(s.buy('sofa', { x: 1.3, z: 1.95, rot: 180 }, false)).toBeNull();
    expect(s.wallet.balance).toBe(before - 2200000);
    expect(s.buy('bookshelf', { x: 1.05, z: -2.3, rot: 0 }, true)).toBeNull();
    expect(s.home.debts).toHaveLength(1);
    const monthly = s.home.debts[0].monthly;
    const b2 = s.wallet.balance;
    s.simulate(fromDate(2027, 2, 1, 9) - s.clock.minutes);
    expect(s.wallet.balance).toBe(b2 - 1800000 - 100000 - monthly);
    expect(s.home.debts[0].monthsLeft).toBe(2);
  });

  it('refuses placements that do not fit and purchases without money', () => {
    const s = new GameSession(simData);
    expect(s.buy('sofa', { x: -2.0, z: -1.45, rot: 0 }, false)).toBe('overlap'); // on the bed
    s.wallet.balance = 1000;
    expect(s.buy('sofa', { x: 1.3, z: 1.95, rot: 180 }, false)).toBe('money');
  });

  it('moves, stores, places again and sells', () => {
    const s = new GameSession(simData);
    expect(s.movePlacement('tv', { x: -2.75, z: 1.0, rot: 90 })).toBeNull();
    expect(s.store('tv')).toBe(true);
    expect(s.home.storage).toEqual(['tv_set']);
    expect(s.placeFromStorage(0, { x: -2.75, z: 0.85, rot: 90 })).toBeNull();
    const id = s.home.placements.find((p) => p.objectId === 'tv_set')!.id;
    const before = s.wallet.balance;
    expect(s.sell(id)).toBe(1250000);
    expect(s.wallet.balance).toBe(before + 1250000);
    expect(s.store('shower')).toBe(false); // fixtures stay
  });

  it('moving to a kontrakan raises the rent and keeps your furniture in storage', () => {
    const s = new GameSession(simData, defaultCharacter(), 1, 10000000);
    s.buy('sofa', { x: 1.3, z: 1.95, rot: 180 }, false);
    expect(s.moveHouse('kontrakan')).toBeNull();
    expect(s.home.layoutId).toBe('kontrakan');
    expect(s.home.storage).toContain('sofa');
    expect(s.home.storage).toContain('bed_single');
    expect(s.rentOf('kontrakan')).toBe(Math.round(1800000 * 2.2));
  });

  it('a mortgage needs a steady job; then the instalment is billed every month', () => {
    const s = new GameSession(simData);
    expect(s.houseMoveBlock('rumah')).toBe('noJob');
    const c = defaultCharacter();
    c.employment = { jobId: 'prog', monthlyGross: 40000000, startMinute: fromDate(2026, 1, 1), workDaysThisMonth: 21, absentDaysThisMonth: 0 };
    const rich = new GameSession(simData, c, 1, 200000000);
    expect(rich.houseMoveBlock('rumah')).toBeNull();
    expect(rich.moveHouse('rumah')).toBeNull();
    expect(rich.home.debts.find((d) => d.id === 'mortgage')?.monthsLeft).toBe(180);
    expect(rich.rentOf('rumah')).toBe(0);
  });

  it('feng shui gives a 0-5 score', () => {
    const s = new GameSession(simData);
    const r = s.fengShui();
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(5);
    expect(r.rules).toHaveLength(5);
  });

  it('home survives save and load', () => {
    const s = new GameSession(simData);
    s.buy('sofa', { x: 1.3, z: 1.95, rot: 180 }, true);
    const b = GameSession.fromSave(simData, JSON.parse(JSON.stringify(s.toSave())));
    expect(b.home).toEqual(s.home);
  });
});
