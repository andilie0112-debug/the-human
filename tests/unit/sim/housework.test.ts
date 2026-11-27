import { describe, expect, it } from 'vitest';
import { GameSession } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import { choreAvailable, choresDay, doChore, freshChores, tidiness } from '../../../src/sim/housework';
import { fromDate } from '../../../src/sim/time';

const cfg = simData.config.housework;

describe('housework', () => {
  it('the house gets messier each day and chores put it right', () => {
    const c = freshChores();
    const t0 = tidiness(c);
    choresDay(c, cfg, 1);
    choresDay(c, cfg, 1);
    expect(tidiness(c)).toBeLessThan(t0);
    doChore(c, 'sapu', 0, cfg, false);
    doChore(c, 'pel', 0, cfg, false);
    doChore(c, 'lap', 0, cfg, false);
    expect(c.floor).toBe(100);
    expect(c.table).toBe(100);
  });

  it('laundry: wash, hang out to dry (longer in the rain), then fold away', () => {
    const c = freshChores();
    c.dirtyClothes = 4;
    expect(choreAvailable(c, 'jemur', 0)).toBe(false);
    doChore(c, 'cuciBaju', 0, cfg, false);
    expect(c.dirtyClothes).toBe(0);
    expect(c.hanging).toBe(4);
    expect(choreAvailable(c, 'jemur', 0)).toBe(true);
    doChore(c, 'jemur', 600, cfg, true);
    expect(c.dryAt).toBe(600 + cfg.dryingHours * 60 * cfg.rainDryingFactor);
    expect(choreAvailable(c, 'lipat', 700)).toBe(false);
    expect(choreAvailable(c, 'lipat', c.dryAt)).toBe(true);
    doChore(c, 'lipat', c.dryAt, cfg, false);
    expect(c.hanging).toBe(0);
    expect(c.dryClothes).toBe(0);
  });

  it('meals leave dishes; chores with nothing to do are hidden; a messy home weighs on the mood', () => {
    const s = new GameSession(simData);
    const dishes = { id: 'wash_dishes', labelKey: 'x', durationMinutes: 15, chore: 'cuciPiring' as const, animation: 'wash' as const };
    expect(s.actionBlock(dishes)).toBe('noChore');
    s.startAction({ id: 'snack', labelKey: 'x', durationMinutes: 10, isEating: true, animation: 'eat' }, 'fridge');
    s.simulate(15);
    expect(s.chores.dishes).toBe(1);
    expect(s.actionBlock(dishes)).toBeNull();
    s.chores.floor = 0;
    s.chores.table = 0;
    s.chores.dishes = 8;
    s.chores.dirtyClothes = 9;
    s.clock.minutes = fromDate(2027, 1, 1, 23);
    s.simulate(120);
    expect(s.character.buffs.map((b) => b.id)).toContain('rumahBerantakan');
  });
});

describe('ironing', () => {
  it('folded clothes wait for the iron; ironing clears them and the pile counts against tidiness', async () => {
    const { freshChores, doChore, choreAvailable, tidiness } = await import('../../../src/sim/housework');
    const cfg = { floorDirtPerDay: 10, tableDirtPerDay: 10, dirtyClothesPerDay: 2, dryingHours: 4, rainDryingFactor: 2, messyBelow: 40, tidyAbove: 80 };
    const c = freshChores();
    expect(choreAvailable(c, 'setrika', 0)).toBe(false);
    doChore(c, 'cuciBaju', 0, cfg, false);
    doChore(c, 'jemur', 0, cfg, false);
    doChore(c, 'lipat', 10 * 60, cfg, false);
    expect(c.toIron).toBe(2);
    expect(choreAvailable(c, 'setrika', 0)).toBe(true);
    const wrinkled = tidiness(c);
    doChore(c, 'setrika', 0, cfg, false);
    expect(c.toIron).toBe(0);
    expect(tidiness(c)).toBeGreaterThan(wrinkled);
  });
});
