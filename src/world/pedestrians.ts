import type { Scene } from 'three';
import { quality } from '../engine/graphics';
import { HAIRSTYLES, HUMAN_SKIN_TONES, HumanModel, type HumanLook } from '../characters/humanModel';

// A few neighbours walking up and down the sidewalks.

interface Walker {
  model: HumanModel;
  z: number;
  x: number;
  dir: 1 | -1;
  speed: number;
  /** Sideways step from the middle of the pavement (keep left, step aside for someone). */
  side: number;
  carrying: boolean;
  waiting: boolean;
}

const COLORS = ['#e8747c', '#4f9a8a', '#3f6fa8', '#f2c14e', '#ffffff', '#8e6cc0', '#c86b3c'];
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

export function randomLook(): HumanLook {
  const body = Math.random() < 0.5 ? 'male' : 'female';
  const hijab = body === 'female' && Math.random() < 0.45;
  return {
    body,
    skinTone: pick(HUMAN_SKIN_TONES),
    hair: pick(HAIRSTYLES[body]),
    hairColor: pick(['#0f0c0a', '#1a1310', '#3a2418']),
    beard: body === 'male' && Math.random() < 0.3,
    hijab,
    hijabColor: pick(['#c46b7a', '#3f6fa8', '#2d2d33', '#efe8dc']),
    shirtColor: pick(COLORS),
    longSleeve: hijab || Math.random() < 0.4,
    pantsColor: pick(['#2f3a52', '#2d2d33', '#5d6b4c', '#efe8dc']),
    shoesColor: pick(['#f2f2f2', '#222222', '#8a5a3a']),
    topStyle: pick(['kaos', 'kaos', 'kemeja', 'batik', 'polo', 'jaket'] as const),
    bottomStyle: body === 'female' ? pick(['jeans', 'chino', 'rokPanjang', 'rok'] as const) : pick(['jeans', 'chino', 'pendek', 'sarung'] as const),
    shoeStyle: pick(['sneakers', 'sandal', 'sandal', 'pantofel'] as const),
    glasses: Math.random() < 0.25 ? pick(['bulat', 'kotak', 'hitam'] as const) : 'none',
    peci: body === 'male' && Math.random() < 0.15,
    height: Math.random() * 2 - 1,
    muscle: Math.random() * 0.3,
    fat: 0.15 + Math.random() * 0.5,
  };
}

export class Pedestrians {
  private readonly walkers: Walker[] = [];
  /** Height of the sidewalk they walk on. */
  groundY = 0;

  constructor(private readonly scene: Scene, count = 4, private readonly sidewalks: [number, number] = [-5.3, 5.3], private readonly range = 58) {
    for (let i = 0; i < count; i++) {
      void HumanModel.load(randomLook()).then((model) => {
        // Every third person carries something (groceries, a box) and walks a little slower.
        const carrying = i % 3 === 2;
        const speed = carrying ? 0.85 + Math.random() * 0.15 : 1.1 + Math.random() * 0.4;
        const w: Walker = { model, z: this.sidewalks[i % 2], x: (Math.random() * 2 - 1) * this.range * 0.85, dir: Math.random() < 0.5 ? 1 : -1, speed, side: 0, carrying, waiting: false };
        model.root.position.set(w.x, 0, w.z);
        // Cadence matches the walking speed (clip speeds: walk 0.94 m/s, carry 0.65 m/s).
        if (carrying) model.play('Walk_Carry_Loop', 0, speed / 0.65);
        else model.play('Walk_Loop', 0, speed / 0.94);
        model.setCastShadow(quality.extraShadows);
        this.scene.add(model.root);
        this.walkers.push(w);
      });
    }
  }

  positions(): { x: number; z: number }[] {
    return this.walkers.map((w) => ({ x: w.x, z: w.z + w.side }));
  }

  /** `others`: the player and anyone else on the pavement; walkers step aside or wait for them. */
  update(dt: number, focus?: { x: number; z: number }, others: readonly { x: number; z: number }[] = []): void {
    for (const w of this.walkers) {
      // Keep to one side of the pavement (so two people passing don't meet head-on), and step
      // further aside or stop for someone standing in the way.
      let side = w.dir * 0.35;
      let blocked = false;
      const z = w.z + w.side;
      const check = (ox: number, oz: number): void => {
        const ahead = (ox - w.x) * w.dir;
        if (ahead > 0 && ahead < 1.6 && Math.abs(oz - z) < 0.7) {
          side = oz > w.z ? -0.75 : 0.75;
          if (ahead < 0.65) blocked = true;
        }
      };
      for (const o of others) check(o.x, o.z);
      for (const o of this.walkers) if (o !== w) check(o.x, o.z + o.side);
      w.side += (side - w.side) * Math.min(1, dt * 3);
      if (!blocked) w.x += w.dir * w.speed * dt;
      if (blocked !== w.waiting) {
        w.waiting = blocked;
        if (blocked) w.model.play('Idle_Loop', 0.3);
        else if (w.carrying) w.model.play('Walk_Carry_Loop', 0.3, w.speed / 0.65);
        else w.model.play('Walk_Loop', 0.3, w.speed / 0.94);
      }
      if (Math.abs(w.x) > this.range) w.dir = (w.dir * -1) as 1 | -1;
      w.model.root.position.set(w.x, this.groundY, w.z + w.side);
      w.model.root.rotation.y = w.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      // A glance at you when walking past.
      if (focus && Math.hypot(focus.x - w.x, focus.z - w.z - w.side) < 3.5) w.model.lookAt(focus.x, 1.5, focus.z);
      else w.model.clearLook();
      w.model.update(dt);
    }
  }

  dispose(): void {
    for (const w of this.walkers) w.model.dispose();
  }
}
