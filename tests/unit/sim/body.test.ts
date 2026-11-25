import { describe, expect, it } from 'vitest';
import { updateBodyDaily } from '../../../src/sim/body';
import sim from '../../../src/data/sim.json';

const cfg = sim.body;

describe('body composition', () => {
  it('eating a lot without exercise slowly adds fat and loses a little muscle', () => {
    const b = updateBodyDaily({ muscle: 0.5, fat: 0.3 }, { averageFullness: 100, exerciseHours: 0 }, [], cfg);
    expect(b.fat).toBeCloseTo(0.3 + cfg.fatPerDayAtFullStomach);
    expect(b.muscle).toBeCloseTo(0.5 - cfg.muscleLossPerDay);
  });

  it('eating little burns fat', () => {
    const b = updateBodyDaily({ muscle: 0.2, fat: 0.3 }, { averageFullness: 10, exerciseHours: 0 }, [], cfg);
    expect(b.fat).toBeLessThan(0.3);
  });

  it('exercise builds muscle and burns fat; Sporty is more effective', () => {
    const plain = updateBodyDaily({ muscle: 0.2, fat: 0.3 }, { averageFullness: 55, exerciseHours: 1 }, [], cfg);
    expect(plain.muscle).toBeCloseTo(0.2 + cfg.musclePerExerciseHour - cfg.muscleLossPerDay);
    expect(plain.fat).toBeCloseTo(0.3 - cfg.fatBurnPerExerciseHour);
    const sporty = updateBodyDaily({ muscle: 0.2, fat: 0.3 }, { averageFullness: 55, exerciseHours: 1 }, ['sporty'], cfg);
    expect(sporty.muscle).toBeGreaterThan(plain.muscle);
  });

  it('a month of daily gym visibly changes the body', () => {
    const b = { muscle: 0.1, fat: 0.3 };
    for (let d = 0; d < 30; d++) updateBodyDaily(b, { averageFullness: 60, exerciseHours: 1.5 }, [], cfg);
    expect(b.muscle).toBeGreaterThan(0.4);
    expect(b.fat).toBeLessThan(0.1);
  });

  it('stays within 0..1', () => {
    const b = updateBodyDaily({ muscle: 0, fat: 1 }, { averageFullness: 100, exerciseHours: 0 }, [], cfg);
    expect(b).toEqual({ muscle: 0, fat: 1 });
  });
});
