import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, type Scene } from 'three';
import { HumanModel, type HumanLook } from '../../characters/humanModel';
import { randomLook } from '../pedestrians';
import { near, separate, type Spot } from '../separation';

// People moving through a public place: they come in at the entrance, walk between a few spots
// (a shop front, the check-in desk, the gates, the platform), pause there, and some leave again,
// while new ones arrive. Optional luggage: a rolling suitcase or shopping bags. They stop when
// someone talks to them.

export interface CrowdOptions {
  /** Where people come in and go out. */
  entrance: { x: number; z: number };
  /** Spots they walk to and pause at (in open floor, connected by straight lines). */
  spots: { x: number; z: number }[];
  count: number;
  luggage?: 'koper' | 'tas' | null;
  look?: () => Partial<HumanLook>;
  /** Extra points to pass through between two places (a gap in the ticket gates). */
  route?: (from: { x: number; z: number }, to: { x: number; z: number }) => { x: number; z: number }[];
}

export interface Walker {
  model: HumanModel;
  path: { x: number; z: number }[];
  wait: number;
  /** Leaves at the entrance after this many stops. */
  stopsLeft: number;
  /** Removed when it reaches the end of its path (boarded, went out). */
  vanishAtEnd: boolean;
  talking: boolean;
  /** Seconds spent close to the next point without reaching it (someone else stands there). */
  close: number;
}

const SPEED = 1.15;

/** A rolling suitcase (also pulled by the player at the airport). */
export function suitcase(): Group {
  const g = new Group();
  const color = ['#2c3e50', '#c0392b', '#16a085', '#8e44ad', '#d35400'][Math.floor(Math.random() * 5)];
  const body = new Mesh(new BoxGeometry(0.38, 0.55, 0.24), new MeshStandardMaterial({ color, roughness: 0.4 }));
  body.position.y = 0.33;
  g.add(body);
  const handle = new Mesh(new CylinderGeometry(0.01, 0.01, 0.5, 6), new MeshStandardMaterial({ color: '#7f8c8d', metalness: 0.7 }));
  handle.position.set(0, 0.85, -0.08);
  g.add(handle);
  for (const x of [-0.14, 0.14]) {
    const wheel = new Mesh(new CylinderGeometry(0.03, 0.03, 0.03, 8), new MeshStandardMaterial({ color: '#1c1c1c' }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.03, -0.08);
    g.add(wheel);
  }
  return g;
}

function bags(): Group {
  const g = new Group();
  const color = ['#e74c3c', '#f1c40f', '#ecf0f1', '#3498db'][Math.floor(Math.random() * 4)];
  const bag = new Mesh(new BoxGeometry(0.3, 0.32, 0.12), new MeshStandardMaterial({ color, roughness: 0.8 }));
  bag.position.y = 0.55;
  g.add(bag);
  return g;
}

export class Crowd {
  readonly walkers: Walker[] = [];
  private spawnTimer = 0;
  private disposed = false;

  constructor(private readonly scene: Scene, private readonly opts: CrowdOptions) {
    // Some already inside at the start, the rest come in over time.
    for (let i = 0; i < Math.ceil(opts.count * 0.6); i++) this.spawn(true);
  }

  /** Adds one person: at a random spot (already inside) or at the entrance. */
  spawn(inside = false, from?: { x: number; z: number }, path?: { x: number; z: number }[], vanishAtEnd = false): void {
    const o = this.opts;
    const start = from ?? (inside ? near(o.spots[Math.floor(Math.random() * o.spots.length)], 1.1) : o.entrance);
    const look = { ...randomLook(), ...(o.look?.() ?? {}) } as HumanLook;
    void HumanModel.load(look).then((m) => {
      if (this.disposed) {
        m.dispose();
        return;
      }
      m.root.position.set(start.x + (Math.random() - 0.5) * 0.6, 0, start.z + (Math.random() - 0.5) * 0.6);
      m.play('Idle_Loop', 0);
      if (o.luggage && (o.luggage === 'koper' || Math.random() < 0.5)) {
        const item = o.luggage === 'koper' ? suitcase() : bags();
        // Beside the right hand (the root is scaled to the character's height).
        const s = 1 / (m.root.scale.x || 1);
        item.scale.setScalar(s);
        item.position.set(-0.32 * s, 0, o.luggage === 'koper' ? -0.25 * s : 0);
        m.root.add(item);
      }
      this.scene.add(m.root);
      const w: Walker = { model: m, path: [], wait: inside ? Math.random() * 4 : 0, stopsLeft: 1 + Math.floor(Math.random() * 3), vanishAtEnd, talking: false, close: 0 };
      if (path) w.path = [...path];
      else if (!inside) this.nextPath(w);
      this.walkers.push(w);
    });
  }

  /** Walks a person somewhere (through the route points), optionally vanishing there. */
  send(w: Walker, to: { x: number; z: number }, vanish = false): void {
    const r = w.model.root.position;
    w.path = [...(this.opts.route?.({ x: r.x, z: r.z }, to) ?? []), to];
    w.vanishAtEnd = vanish;
    w.wait = 0;
  }

  private nextPath(w: Walker): void {
    const o = this.opts;
    if (w.stopsLeft <= 0) return this.send(w, o.entrance, true);
    w.stopsLeft--;
    // Not all to the very same point: somewhere around the spot.
    this.send(w, near(o.spots[Math.floor(Math.random() * o.spots.length)], 1.1));
  }

  private readonly bodies: Spot[] = [];

  /** Where everyone stands now (reused array). */
  positions(): readonly Spot[] {
    this.bodies.length = 0;
    for (const w of this.walkers) this.bodies.push(w.model.root.position);
    return this.bodies;
  }

  /** `obstacles`: the player and anyone else who does not move (staff); people step around them. */
  update(dt: number, obstacles: readonly Spot[] = []): void {
    // Keep the place busy: new people come in now and then.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 3 + Math.random() * 4;
      if (this.walkers.length < this.opts.count) this.spawn(false);
    }
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      const m = w.model;
      if (w.talking) {
        m.update(dt);
        continue;
      }
      const next = w.path[0];
      if (!next) {
        w.wait -= dt;
        if (w.wait <= 0) this.nextPath(w);
        m.update(dt);
        continue;
      }
      const r = m.root;
      const dx = next.x - r.position.x;
      const dz = next.z - r.position.z;
      const d = Math.hypot(dx, dz);
      w.close = d < 1 ? w.close + dt : 0;
      // Reached it (or as near as the others there allow).
      if (d < 0.25 || w.close > 2) {
        w.close = 0;
        w.path.shift();
        if (w.path.length === 0) {
          if (w.vanishAtEnd) {
            r.removeFromParent();
            m.dispose();
            this.walkers.splice(i, 1);
            continue;
          }
          w.wait = 3 + Math.random() * 6;
          m.play(Math.random() < 0.3 ? 'Idle_TalkingPhone_Loop' : 'Idle_Loop', 0.3);
        }
      } else {
        r.position.x += (dx / d) * SPEED * dt;
        r.position.z += (dz / d) * SPEED * dt;
        r.rotation.y = Math.atan2(dx, dz);
        m.play('Walk_Loop', 0.25, SPEED / 0.94);
      }
      m.update(dt);
    }
    // Nobody walks through anybody (those talking with you stand still).
    separate(this.positions(), dt, (i) => this.walkers[i].talking, obstacles);
  }

  dispose(): void {
    this.disposed = true;
    for (const w of this.walkers) w.model.dispose();
    this.walkers.length = 0;
  }
}
