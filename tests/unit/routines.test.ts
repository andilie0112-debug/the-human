import { describe, expect, it } from 'vitest';
import { WORSHIP, routineLength, sample } from '../../src/characters/routines';

describe('worship routines', () => {
  it('there is one for each of the six religions', () => {
    expect(Object.keys(WORSHIP).sort()).toEqual(['buddha', 'hindu', 'islam', 'katolik', 'konghucu', 'kristen']);
  });

  it('sholat goes down to sujud (hips dropped) and back up, and ends seated', () => {
    const r = WORSHIP.islam;
    const len = routineLength(r);
    let lowest = 0;
    for (let t = 0; t < len; t += 0.1) lowest = Math.max(lowest, sample(r, t, t - 0.1).drop);
    expect(lowest).toBeGreaterThan(0.4);
    expect(sample(r, 0.5, 0.4).drop).toBe(0); // standing at the start (takbir)
    expect(sample(r, len - 0.01, len - 0.02).drop).toBeGreaterThan(0.5); // doa sitting at the end
  });

  it('sound cues fire once when their pose is reached', () => {
    const r = WORSHIP.buddha;
    let bells = 0;
    let prev = -0.001;
    for (let t = 0; t < routineLength(r); t += 0.05) {
      if (sample(r, t, prev).cue === 'bell') bells++;
      prev = t;
    }
    expect(bells).toBe(3);
  });

  it('poses are symmetric left/right where both legs are set', () => {
    for (const r of Object.values(WORSHIP)) {
      for (const f of r.frames) {
        if (f.pose.thigh_l && f.pose.thigh_r) expect(f.pose.thigh_l).toEqual(f.pose.thigh_r);
        if (f.pose.calf_l && f.pose.calf_r) expect(f.pose.calf_l).toEqual(f.pose.calf_r);
      }
    }
  });
});
