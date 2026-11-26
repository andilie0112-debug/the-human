import type { Scene } from 'three';
import { HumanModel, type HumanLook } from '../characters/humanModel';
import type { WorshipPhase } from '../sim/worship';
import { worshipLook } from './spaces/congregation';
import { randomLook } from './pedestrians';

// Worshippers on their way: when the adzan sounds people walk to the mosque, on Sunday morning to
// church and the vihara, at Tri Sandhya to the pura. They come along the street and go in.

interface Walker {
  model: HumanModel;
  to: { x: number; z: number };
}

const SPEED = 1.25;
const MAX_PER_PLACE = 4;

export class Worshippers {
  private readonly walkers = new Map<string, Walker[]>();
  private timer = 0;

  constructor(
    private readonly scene: Scene,
    private readonly places: { id: string; religion: string; door: { x: number; z: number; heading: number } }[],
    private readonly phase: (religion: string) => WorshipPhase,
    private readonly groundY = 0.14,
  ) {}

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1.6;
      for (const p of this.places) {
        const list = this.walkers.get(p.id) ?? [];
        this.walkers.set(p.id, list);
        if (this.phase(p.religion) === 'none' || list.length >= MAX_PER_PLACE) continue;
        // Start somewhere along the street, 8 to 18 m from the door.
        const side = Math.random() < 0.5 ? -1 : 1;
        const from = { x: p.door.x + side * (8 + Math.random() * 10), z: p.door.z + (Math.random() - 0.5) * 1.5 };
        const body: 'male' | 'female' = Math.random() < 0.5 ? 'male' : 'female';
        const look = worshipLook(p.religion, body, null) as HumanLook;
        const walker: Walker = { model: null as unknown as HumanModel, to: { x: p.door.x, z: p.door.z } };
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
        if (d < 0.4) {
          // Went in.
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

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 2.2;
      if (this.open() && this.walkers.length < this.doors.length * 3) {
        const door = this.doors[Math.floor(Math.random() * this.doors.length)];
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
      if (d < 0.4) {
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
  }

  dispose(): void {
    for (const w of this.walkers) w.model?.dispose();
    this.walkers.length = 0;
  }
}
