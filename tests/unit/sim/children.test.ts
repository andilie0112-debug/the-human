import { describe, expect, it } from 'vitest';
import { GameSession, defaultCharacter } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import { childStage, monthlyChildCost } from '../../../src/sim/children';
import { fromDate } from '../../../src/sim/time';

const cfg = simData.config.children;

describe('children', () => {
  it('stages and monthly costs by age', () => {
    expect(childStage(0)).toBe('bayi');
    expect(childStage(4)).toBe('balita');
    expect(childStage(9)).toBe('anak');
    expect(childStage(15)).toBe('remaja');
    expect(childStage(18)).toBe('dewasa');
    const kids = [0, 9].map((age, i) => ({ id: `k${i}`, name: 'A', gender: 'male' as const, age, ageDays: 0, happiness: 50, study: 0 }));
    expect(monthlyChildCost(kids, cfg)).toBe(cfg.monthlyCost.bayi + cfg.monthlyCost.anak);
  });

  it('only married couples can try for a baby, once a day; a baby arrives after the pregnancy', () => {
    const single = new GameSession(simData);
    expect(single.familyBlock('try')).toBe('married');
    const s = new GameSession(simData, { ...defaultCharacter(), married: true, ageSpeed: 'cepat' }, 5);
    let tries = 0;
    while (!s.expecting && tries < 60) {
      expect(s.familyBlock('try')).toBeNull();
      s.tryForBaby();
      expect(s.familyBlock('try')).toBe(s.expecting ? 'expecting' : 'today');
      s.simulate(24 * 60);
      tries++;
    }
    expect(s.expecting).not.toBeNull();
    const due = s.expecting!.dueDay;
    let ev = s.simulate(24 * 60);
    for (let d = 0; d < 40 && s.children.length === 0; d++) ev = s.simulate(24 * 60);
    expect(s.children).toHaveLength(1);
    expect(ev.some((e) => e.kind === 'family' && e.textKey === 'kid.born')).toBe(true);
    expect(Math.floor(s.clock.minutes / (24 * 60))).toBeGreaterThanOrEqual(due);
  });

  it('adoption costs the fees; children grow, miss you, love playing; school costs every month', () => {
    const s = new GameSession(simData, { ...defaultCharacter(), married: true, ageSpeed: 'cepat' }, 1, 50000000);
    const before = s.wallet.balance;
    expect(s.adopt()).toBe(true);
    expect(s.wallet.balance).toBe(before - cfg.adoptionCost);
    for (let d = 0; d < 10 && s.children.length === 0; d++) s.simulate(24 * 60);
    const kid = s.children[0];
    expect(kid).toBeDefined();
    const h0 = kid.happiness;
    s.simulate(24 * 60);
    expect(kid.happiness).toBe(h0 - cfg.happinessDecayPerDay);
    s.childTime(kid.id, 'play');
    expect(kid.happiness).toBe(Math.min(100, h0 - cfg.happinessDecayPerDay + cfg.playGain));
    // A game year (28 days on Cepat) later the child is one year older.
    s.simulate(28 * 24 * 60);
    expect(kid.age).toBe(1);
    // The monthly bill includes the child.
    s.clock.minutes = fromDate(2028, 6, simData.config.bills.billDay, 0);
    const ev = s.simulate(24 * 60);
    expect(ev.some((e) => e.kind === 'bill' && e.labelKey === 'tx.children')).toBe(true);
  });
});
