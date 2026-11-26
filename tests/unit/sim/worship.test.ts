import { describe, expect, it } from 'vitest';
import { GameSession, defaultCharacter } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import { adzanAt, worshipPhase } from '../../../src/sim/worship';
import { fromDate } from '../../../src/sim/time';

const cfg = simData.config.worship;

describe('worship times', () => {
  it('the adzan sounds at 5, 12, 15, 18 and 19; jamaah gathers after it, then prays together', () => {
    expect(cfg.adzanHours.map((h) => adzanAt(h, cfg))).toEqual(['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya']);
    expect(adzanAt(13, cfg)).toBeNull();
    expect(worshipPhase('islam', 1, 12.05, cfg)).toBe('gathering');
    expect(worshipPhase('islam', 1, 12.25, cfg)).toBe('service');
    expect(worshipPhase('islam', 1, 13, cfg)).toBe('none');
  });

  it('Sunday services at church and the vihara, Tri Sandhya daily at the pura', () => {
    expect(worshipPhase('kristen', 0, 7.5, cfg)).toBe('service');
    expect(worshipPhase('kristen', 0, 6.75, cfg)).toBe('gathering');
    expect(worshipPhase('kristen', 3, 7.5, cfg)).toBe('none');
    expect(worshipPhase('buddha', 0, 9, cfg)).toBe('service');
    expect(worshipPhase('hindu', 3, 12.2, cfg)).toBe('service');
  });

  it('the session announces the adzan and reminds Christians of the Sunday service', () => {
    const s = new GameSession(simData);
    s.clock.minutes = fromDate(2027, 1, 4, 11);
    const ev = s.simulate(70);
    expect(ev).toContainEqual({ kind: 'adzan', name: 'dzuhur' });
    const k = new GameSession(simData, { ...defaultCharacter(), religionId: 'kristen' });
    k.clock.minutes = fromDate(2027, 1, 3, 8); // Sunday
    expect(k.todayTasks().find((x) => x.id === 'ibadah')?.labelKey).toBe('task.worshipSunday');
    k.clock.minutes = fromDate(2027, 1, 4, 8);
    expect(k.todayTasks().find((x) => x.id === 'ibadah')?.labelKey).toBe('task.worship');
  });
});
