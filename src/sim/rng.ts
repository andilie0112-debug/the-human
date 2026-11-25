/** Small seeded random generator (mulberry32) so simulation runs are reproducible in tests. */
export interface Rng {
  (): number;
  /** Internal state, saved with the game so a loaded game continues identically. */
  getState: () => number;
  setState: (s: number) => void;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.getState = () => a;
  next.setState = (s) => {
    a = s >>> 0;
  };
  return next;
}
