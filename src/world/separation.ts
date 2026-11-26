// Keeps people from standing inside each other: everyone near someone else is gently pushed
// apart until there is a body's width between them. People who must not move (sitting, behind a
// counter, talking with you) stay put and the others step around them; the player is never
// pushed, people step out of the player's way instead.

export interface Spot {
  x: number;
  z: number;
}

/** Centre-to-centre distance two standing people keep. */
export const BODY_GAP = 0.6;

/**
 * Pushes `people` apart (in place). `pinned(i)`: that person does not move. `fixed`: other
 * obstacles that never move (the player, staff). Cheap enough for the few dozen people of a scene.
 */
export function separate(people: readonly Spot[], dt: number, pinned?: (i: number) => boolean, fixed: readonly Spot[] = [], gap = BODY_GAP): void {
  const k = Math.min(1, dt * 8);
  const n = people.length;
  for (let i = 0; i < n; i++) {
    const a = people[i];
    const aPinned = pinned?.(i) ?? false;
    for (let j = i + 1; j < n; j++) {
      const b = people[j];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      if (d >= gap) continue;
      if (d < 1e-4) {
        // Exactly on top of each other: pick a direction.
        dx = Math.cos(i * 2.39996 + j);
        dz = Math.sin(i * 2.39996 + j);
        d = 1;
      }
      const bPinned = pinned?.(j) ?? false;
      if (aPinned && bPinned) continue;
      const push = (gap - (d < 1e-4 ? 0 : Math.min(d, gap))) * k;
      const ux = dx / d;
      const uz = dz / d;
      const shareA = aPinned ? 0 : bPinned ? 1 : 0.5;
      const shareB = 1 - shareA;
      a.x -= ux * push * shareA;
      a.z -= uz * push * shareA;
      b.x += ux * push * shareB;
      b.z += uz * push * shareB;
    }
    if (aPinned) continue;
    for (const f of fixed) {
      const dx = a.x - f.x;
      const dz = a.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d >= gap || d < 1e-4) continue;
      const push = (gap - d) * k;
      a.x += (dx / d) * push;
      a.z += (dz / d) * push;
    }
  }
}

/** A point near `spot` (within `radius`), so people going to the same place spread out. */
export function near(spot: Spot, radius: number): Spot {
  const a = Math.random() * Math.PI * 2;
  const r = radius * Math.sqrt(Math.random());
  return { x: spot.x + Math.cos(a) * r, z: spot.z + Math.sin(a) * r };
}
