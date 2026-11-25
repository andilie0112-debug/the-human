import { describe, expect, it } from 'vitest';
import { NavGrid } from '../../src/home/navGrid';

describe('NavGrid', () => {
  it('walks straight when nothing is in the way', () => {
    const g = new NavGrid(6, 5);
    expect(g.findPath({ x: -2, z: 0 }, { x: 2, z: 0 })).toEqual([{ x: 2, z: 0 }]);
  });

  it('goes around an obstacle without touching it', () => {
    const g = new NavGrid(6, 5);
    g.blockRect(0, 0, 1, 3);
    const path = g.findPath({ x: -2, z: 0 }, { x: 2, z: 0 });
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(1);
    let prev = { x: -2, z: 0 };
    for (const p of path!) {
      expect(g.lineOfSight(prev, p)).toBe(true);
      prev = p;
    }
    expect(path![path!.length - 1]).toEqual({ x: 2, z: 0 });
  });

  it('moves a blocked target to the nearest free spot', () => {
    const g = new NavGrid(6, 5);
    g.blockRect(1, 0, 1, 1);
    const path = g.findPath({ x: -2, z: 0 }, { x: 1, z: 0 });
    const end = path![path!.length - 1];
    expect(g.isBlockedAt(end)).toBe(false);
    expect(Math.hypot(end.x - 1, end.z)).toBeLessThan(0.9);
  });

  it('returns null when the goal is walled off', () => {
    const g = new NavGrid(6, 5);
    g.blockRect(1.5, 0, 0.2, 5); // full-height wall
    expect(g.findPath({ x: -2, z: 0 }, { x: 2.5, z: 0 })).toBeNull();
  });

  it('passes through a door opening', () => {
    const g = new NavGrid(6, 5);
    g.blockRect(1.5, 0, 0.2, 5);
    g.clearRect(1.5, 1.5, 0.4, 0.8);
    const path = g.findPath({ x: -2, z: 0 }, { x: 2.5, z: 0 });
    expect(path).not.toBeNull();
    expect(path!.some((p) => p.z > 1)).toBe(true);
  });

  it('blocks rotated rectangles', () => {
    const g = new NavGrid(6, 5);
    g.blockRect(0, 0, 2, 0.4, 90);
    expect(g.isBlockedAt({ x: 0, z: 0.9 })).toBe(true);
    expect(g.isBlockedAt({ x: 0.9, z: 0 })).toBe(false);
  });
});
