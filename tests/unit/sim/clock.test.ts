import { describe, expect, it } from 'vitest';
import { GameClock } from '../../../src/sim/clock';
import { toParts } from '../../../src/sim/time';
import sim from '../../../src/data/sim.json';

describe('GameClock', () => {
  it('starts on 1 Jan 2027 at 07:00', () => {
    const c = new GameClock(sim.clock);
    expect(toParts(c.minutes)).toMatchObject({ year: 2027, month: 1, day: 1, hour: 7, minute: 0 });
  });

  it('one in-game day takes 12 real minutes at 1x', () => {
    const c = new GameClock(sim.clock);
    expect(c.gameMinutesFor(12 * 60)).toBe(24 * 60);
  });

  it('2x and 3x run proportionally faster, pause stops time', () => {
    const c = new GameClock(sim.clock);
    c.speed = 2;
    expect(c.gameMinutesFor(10)).toBe(40);
    c.speed = 3;
    expect(c.gameMinutesFor(10)).toBe(60);
    c.speed = 0;
    expect(c.advance(10)).toBe(0);
  });

  it('fast-forward multiplies the speed for sleep and work', () => {
    const c = new GameClock(sim.clock);
    c.fastForward = true;
    expect(c.gameMinutesFor(1)).toBe(2 * sim.clock.fastForwardMultiplier);
  });
});
