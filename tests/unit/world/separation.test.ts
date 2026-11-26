import { describe, expect, it } from 'vitest';
import { BODY_GAP, near, separate } from '../../../src/world/separation';

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

describe('separation', () => {
  it('pushes people standing on the same spot apart until a body width is between them', () => {
    const people = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0.1, z: 0 }];
    for (let i = 0; i < 200; i++) separate(people, 1 / 30);
    for (let i = 0; i < people.length; i++)
      for (let j = i + 1; j < people.length; j++) expect(dist(people[i], people[j])).toBeGreaterThan(BODY_GAP - 0.02);
  });

  it('never moves pinned people or fixed obstacles (the player): others step around them', () => {
    const people = [{ x: 0, z: 0 }, { x: 0.2, z: 0 }];
    const player = { x: 0.3, z: 0.1 };
    for (let i = 0; i < 200; i++) separate(people, 1 / 30, (i) => i === 0, [player]);
    expect(people[0]).toEqual({ x: 0, z: 0 });
    expect(player).toEqual({ x: 0.3, z: 0.1 });
    expect(dist(people[1], people[0])).toBeGreaterThan(BODY_GAP - 0.02);
    expect(dist(people[1], player)).toBeGreaterThan(BODY_GAP - 0.05);
  });

  it('spreads destinations around a spot instead of one point', () => {
    const pts = Array.from({ length: 50 }, () => near({ x: 5, z: 5 }, 1));
    for (const p of pts) expect(dist(p, { x: 5, z: 5 })).toBeLessThanOrEqual(1);
    expect(new Set(pts.map((p) => p.x.toFixed(3))).size).toBeGreaterThan(40);
  });
});
