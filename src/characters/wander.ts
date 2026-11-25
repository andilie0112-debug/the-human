import type { HumanModel } from './humanModel';

// Placeholder behaviour until smart objects and autonomy arrive (M2/M4):
// walk between a few spots in the room and pause to look around.

const SPOTS: ReadonlyArray<readonly [number, number]> = [
  [-1.0, 0.6], [1.3, -0.5], [-0.3, -1.0], [1.8, 0.9], [0.2, 1.2],
];
const SPEED = 1.0; // m/s, roughly matches the walk clip's stride

function angleLerp(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export class Wanderer {
  private spot = 0;
  private waitLeft = 1.5;

  /** `timeScale` speeds the walk up a little at higher game speeds. */
  update(character: HumanModel, dt: number, timeScale = 1): void {
    const body = character.root;
    const [tx, tz] = SPOTS[this.spot];
    const dx = tx - body.position.x;
    const dz = tz - body.position.z;
    const dist = Math.hypot(dx, dz);

    if (this.waitLeft > 0) {
      this.waitLeft -= dt * timeScale;
      character.play('Idle_Loop');
    } else if (dist > 0.05) {
      character.play('Walk_Loop');
      body.rotation.y = angleLerp(body.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 6));
      const step = Math.min(dist, SPEED * dt);
      body.position.x += (dx / dist) * step;
      body.position.z += (dz / dist) * step;
    } else {
      this.spot = (this.spot + 1) % SPOTS.length;
      this.waitLeft = 2 + Math.random() * 2.5;
    }
    character.update(dt);
  }
}

export const WANDER_START: readonly [number, number] = [0.2, 1.2];
