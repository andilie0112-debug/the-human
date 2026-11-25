import { describe, expect, it } from 'vitest';
import { GameSession } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';

describe('first home and building a house', () => {
  it('every start home exists; rent follows the city and is paid up front', () => {
    for (const id of GameSession.START_HOMES) expect(simData.layouts[id]).toBeDefined();
    const s = new GameSession(simData, undefined, 1, 10000000);
    const rent = s.rentOf('apartemen');
    expect(rent).toBeGreaterThan(s.rentOf('kos'));
    expect(s.startHome('apartemen')).toBe(true);
    expect(s.wallet.balance).toBe(10000000 - rent);
    expect(s.home.layoutId).toBe('apartemen');
    // No second rent on the 1st of the same month.
    s.simulate(6 * 60);
    expect(s.wallet.balance).toBe(10000000 - rent);
  });

  it('homes you cannot afford are refused', () => {
    const s = new GameSession(simData, undefined, 1, 1000000);
    expect(s.startHome('rumah_sewa')).toBe(false);
    expect(s.home.layoutId).toBe('kos');
  });

  it('the family land is free; building takes money and time, then you live in a house', () => {
    const s = new GameSession(simData, undefined, 1, 500000000);
    expect(s.startHome('tanah')).toBe(true);
    expect(s.rentOf('tanah')).toBe(0);
    const cost = s.buildCost();
    expect(cost).toBeGreaterThan(50000000);
    expect(s.startBuilding()).toBe(true);
    expect(s.buildBlock()).toBe('building');
    for (let d = 0; d < simData.config.finance.buildDays + 1; d++) s.simulate(24 * 60);
    expect(s.home.layoutId).toBe('rumah');
    expect(s.home.construction).toBeNull();
  });
});
