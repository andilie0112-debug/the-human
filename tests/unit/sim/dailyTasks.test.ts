import { describe, expect, it } from 'vitest';
import { dailyTasks, type DoneTag } from '../../../src/sim/dailyTasks';
import { GameSession } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';

const base = { done: new Set<DoneTag>(), employed: false, workDay: false, fridgeItems: 3, energy: 80, sick: false };

describe('daily tasks', () => {
  it('without a job: look for work, worship, eat, shower', () => {
    expect(dailyTasks(base).map((t) => t.id)).toEqual(['lamar', 'ibadah', 'makan', 'mandi']);
  });
  it('on a work day the shift comes first; empty fridge, sickness and tiredness add tasks', () => {
    const ids = dailyTasks({ ...base, employed: true, workDay: true, shiftStart: 8, fridgeItems: 0, sick: true, energy: 20 }).map((t) => t.id);
    expect(ids).toEqual(['kerja', 'ibadah', 'makan', 'mandi', 'belanja', 'berobat', 'tidur']);
  });
  it('the session ticks tasks off as actions finish and clears them at midnight', () => {
    const s = new GameSession(simData);
    const eat = simData.objects.find((o) => o.id === 'desk_laptop');
    expect(eat).toBeDefined();
    s.markDone('makan');
    expect(s.todayTasks().find((t) => t.id === 'makan')?.done).toBe(true);
    s.simulate(24 * 60);
    expect(s.todayTasks().find((t) => t.id === 'makan')?.done).toBe(false);
  });
});
