import type { Scene } from 'three';
import { HumanModel, type HumanLook } from '../characters/humanModel';
import type { WorshipPhase } from '../sim/worship';
import { worshipLook } from './spaces/congregation';
import { randomLook } from './pedestrians';
import { near, separate, type Spot } from './separation';

// Worshippers on their way: when the adzan sounds people walk to the mosque, on Sunday morning to
// church and the vihara, at Tri Sandhya to the pura. They come along the street and go in.

interface Walker {
  model: HumanModel;
  to: { x: number; z: number };
  entering: boolean;
}

const SPEED = 1.25;
const MAX_PER_PLACE = 4;

export class Worshippers {
  private readonly walkers = new Map<string, Walker[]>();
  /** How many went in at each place (they come out after the service). */
  private readonly inside = new Map<string, number>();
  private timer = 0;

  constructor(
    private readonly scene: Scene,
    private readonly places: { id: string; religion: string; door: { x: number; z: number; heading: number } }[],
    private readonly phase: (religion: string) => WorshipPhase,
    private readonly groundY = 0.14,
  ) {}

  private readonly bodies: Spot[] = [];

  /** Where everyone walking is now (reused array). */
  positions(): readonly Spot[] {
    this.bodies.length = 0;
    for (const list of this.walkers.values()) for (const w of list) if (w.model) this.bodies.push(w.model.root.position);
    return this.bodies;
  }

  /** `obstacles`: the player (people walk around you). */
  update(dt: number, obstacles: readonly Spot[] = []): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.9;
      for (const p of this.places) {
        const list = this.walkers.get(p.id) ?? [];
        this.walkers.set(p.id, list);
        const phase = this.phase(p.religion);
        const inside = this.inside.get(p.id) ?? 0;
        // Before and during worship people come; afterwards those inside come out again.
        const goingOut = phase === 'none' && inside > 0;
        if ((phase === 'none' && !goingOut) || list.length >= MAX_PER_PLACE) continue;
        if (phase === 'service' && Math.random() < 0.6) continue; // only a few latecomers
        const side = Math.random() < 0.5 ? -1 : 1;
        const street = { x: p.door.x + side * (8 + Math.random() * 10), z: p.door.z + (Math.random() - 0.5) * 1.5 };
        const door = near({ x: p.door.x, z: p.door.z }, 0.5);
        const from = goingOut ? door : street;
        if (goingOut) this.inside.set(p.id, inside - 1);
        const body: 'male' | 'female' = Math.random() < 0.5 ? 'male' : 'female';
        const look = worshipLook(p.religion, body, null) as HumanLook;
        const walker: Walker = { model: null as unknown as HumanModel, to: goingOut ? street : door, entering: !goingOut };
        list.push(walker);
        void HumanModel.load(look).then((m) => {
          walker.model = m;
          m.root.position.set(from.x, this.groundY, from.z);
          m.play('Walk_Loop', 0, SPEED / 0.94);
          this.scene.add(m.root);
        });
      }
    }
    for (const [id, list] of this.walkers) {
      for (let i = list.length - 1; i >= 0; i--) {
        const w = list[i];
        const m = w.model;
        if (!m) continue;
        const r = m.root;
        const dx = w.to.x - r.position.x;
        const dz = w.to.z - r.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.7) {
          // Went in (counted, to come out after the service) or went on their way.
          if (w.entering) this.inside.set(id, (this.inside.get(id) ?? 0) + 1);
          r.removeFromParent();
          m.dispose();
          list.splice(i, 1);
          continue;
        }
        r.position.x += (dx / d) * SPEED * dt;
        r.position.z += (dz / d) * SPEED * dt;
        r.rotation.y = Math.atan2(dx, dz);
        m.update(dt);
      }
      this.walkers.set(id, list);
    }
    separate(this.positions(), dt, undefined, obstacles);
  }

  dispose(): void {
    for (const list of this.walkers.values()) for (const w of list) w.model?.dispose();
    this.walkers.clear();
  }
}

/** People going in and coming out of busy places (mall, market, station, airport) by day. */
export class PlaceTraffic {
  private readonly walkers: { model: HumanModel; to: { x: number; z: number } }[] = [];
  private timer = 0;

  constructor(
    private readonly scene: Scene,
    private readonly doors: { x: number; z: number }[],
    private readonly open: () => boolean,
    private readonly groundY = 0.14,
  ) {}

  private readonly bodies: Spot[] = [];

  /** Where everyone walking is now (reused array). */
  positions(): readonly Spot[] {
    this.bodies.length = 0;
    for (const w of this.walkers) if (w.model) this.bodies.push(w.model.root.position);
    return this.bodies;
  }

  /** `obstacles`: the player and others on the pavement (people walk around them). */
  update(dt: number, obstacles: readonly Spot[] = []): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 2.2;
      if (this.open() && this.walkers.length < this.doors.length * 3) {
        const door = near(this.doors[Math.floor(Math.random() * this.doors.length)], 0.6);
        const street = { x: door.x + (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 9), z: door.z + (Math.random() - 0.5) * 1.5 };
        const out = Math.random() < 0.5;
        const from = out ? door : street;
        const to = out ? street : door;
        const w = { model: null as unknown as HumanModel, to };
        this.walkers.push(w);
        void HumanModel.load(randomLook()).then((m) => {
          w.model = m;
          m.root.position.set(from.x, this.groundY, from.z);
          m.play('Walk_Loop', 0, SPEED / 0.94);
          this.scene.add(m.root);
        });
      }
    }
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      const m = w.model;
      if (!m) continue;
      const r = m.root;
      const dx = w.to.x - r.position.x;
      const dz = w.to.z - r.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.7) {
        r.removeFromParent();
        m.dispose();
        this.walkers.splice(i, 1);
        continue;
      }
      r.position.x += (dx / d) * SPEED * dt;
      r.position.z += (dz / d) * SPEED * dt;
      r.rotation.y = Math.atan2(dx, dz);
      m.update(dt);
    }
    separate(this.positions(), dt, undefined, obstacles);
  }

  dispose(): void {
    for (const w of this.walkers) w.model?.dispose();
    this.walkers.length = 0;
  }
}
