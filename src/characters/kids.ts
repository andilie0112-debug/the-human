import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, type Scene } from 'three';
import type { KosRoom } from '../home/kosRoom';
import type { Point } from '../home/navGrid';
import { childStage, type Child } from '../sim/children';
import type { CharacterState } from '../sim/session';
import { HAIRSTYLES, HUMAN_SKIN_TONES, HumanModel } from './humanModel';

// Children at home: a baby sleeps in a crib, older children walk around the house, stop to play
// (a little dance) or stand and look around. Their size follows their age.

const SIZE: Record<string, number> = { balita: 0.55, anak: 0.72, remaja: 0.93 };
const WALK = 0.9;

interface Kid {
  id: string;
  model: HumanModel | null;
  crib: Group | null;
  path: Point[];
  wait: number;
}

function crib(): Group {
  const g = new Group();
  const wood = new MeshStandardMaterial({ color: '#e8d5b5', roughness: 0.7 });
  const add = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
    const m = new Mesh(new BoxGeometry(w, h, d), wood);
    m.position.set(x, y, z);
    g.add(m);
  };
  add(1.0, 0.05, 0.6, 0, 0.45, 0);
  for (const [x, z] of [[-0.48, -0.28], [0.48, -0.28], [-0.48, 0.28], [0.48, 0.28]]) add(0.05, 0.9, 0.05, x, 0.45, z);
  for (const z of [-0.28, 0.28]) {
    add(1.0, 0.04, 0.04, 0, 0.88, z);
    for (let i = -4; i <= 4; i++) add(0.02, 0.4, 0.02, i * 0.1, 0.68, z);
  }
  const blanket = new Mesh(new BoxGeometry(0.55, 0.08, 0.4), new MeshStandardMaterial({ color: '#f9c6d0', roughness: 0.9 }));
  blanket.position.set(0.1, 0.52, 0);
  g.add(blanket);
  const head = new Mesh(new SphereGeometry(0.09, 14, 10), new MeshStandardMaterial({ color: '#e0b894', roughness: 0.8 }));
  head.position.set(-0.25, 0.54, 0);
  g.add(head);
  const pillow = new Mesh(new CylinderGeometry(0.08, 0.08, 0.3, 10), new MeshStandardMaterial({ color: '#ffffff' }));
  pillow.rotation.x = Math.PI / 2;
  pillow.position.set(-0.32, 0.5, 0);
  g.add(pillow);
  return g;
}

export class KidsAtHome {
  private readonly kids = new Map<string, Kid>();

  constructor(private readonly scene: Scene, private readonly room: KosRoom, private readonly parent: () => CharacterState) {}

  /** Matches the children living at home (call after family news or loading). */
  sync(children: readonly Child[]): void {
    const home = children.filter((c) => childStage(c.age) !== 'dewasa');
    for (const [id, k] of this.kids) {
      const c = home.find((x) => x.id === id);
      const stage = c ? childStage(c.age) : null;
      // Gone (grown up), or grew out of the crib: rebuild.
      if (!c || (k.crib && stage !== 'bayi') || (k.model && stage === 'bayi')) this.remove(id);
    }
    for (const c of home) {
      if (this.kids.has(c.id)) {
        this.resize(c);
        continue;
      }
      const kid: Kid = { id: c.id, model: null, crib: null, path: [], wait: 2 };
      this.kids.set(c.id, kid);
      const spot = this.freeSpot();
      if (childStage(c.age) === 'bayi') {
        kid.crib = crib();
        kid.crib.position.set(spot.x, 0, spot.z);
        this.scene.add(kid.crib);
        continue;
      }
      const p = this.parent().appearance;
      void HumanModel.load({
        body: c.gender,
        skinTone: p.skinTone ?? HUMAN_SKIN_TONES[2],
        hair: HAIRSTYLES[c.gender][c.gender === 'female' ? 0 : 1] ?? HAIRSTYLES[c.gender][0],
        hairColor: '#1a1310',
        shirtColor: ['#f5b041', '#5dade2', '#58d68d', '#ec7063'][c.name.length % 4],
        pantsColor: '#2e4053',
        shoesColor: '#e74c3c',
        shoeStyle: 'sneakers',
      }).then((m) => {
        if (!this.kids.has(c.id)) {
          m.dispose();
          return;
        }
        kid.model = m;
        m.root.position.set(spot.x, 0, spot.z);
        this.scene.add(m.root);
        this.resize(c);
        m.play('Idle_Loop', 0);
      });
    }
  }

  private resize(c: Child): void {
    const m = this.kids.get(c.id)?.model;
    if (!m) return;
    const base = m.root.userData.baseScale ?? (m.root.userData.baseScale = m.root.scale.x);
    m.root.scale.setScalar(base * (SIZE[childStage(c.age)] ?? 1));
  }

  private remove(id: string): void {
    const k = this.kids.get(id);
    if (!k) return;
    if (k.model) {
      k.model.root.removeFromParent();
      k.model.dispose();
    }
    if (k.crib) {
      k.crib.removeFromParent();
      k.crib.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    }
    this.kids.delete(id);
  }

  /** A random walkable spot in the house. */
  private freeSpot(): Point {
    const { width, depth } = this.room.layout;
    for (let i = 0; i < 20; i++) {
      const p = { x: (Math.random() - 0.5) * (width - 1.5), z: (Math.random() - 0.5) * (depth - 1.5) };
      if (!this.room.nav.isBlockedAt(p)) return p;
    }
    return this.room.nav.nearestFree({ x: 0, z: 0 }) ?? { x: 0, z: 0 };
  }

  update(dt: number): void {
    for (const k of this.kids.values()) {
      const m = k.model;
      if (!m) continue;
      const r = m.root;
      const next = k.path[0];
      if (next) {
        const dx = next.x - r.position.x;
        const dz = next.z - r.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) k.path.shift();
        else {
          const step = Math.min(d, WALK * dt);
          r.position.x += (dx / d) * step;
          r.position.z += (dz / d) * step;
          r.rotation.y = Math.atan2(dx, dz);
          m.play('Walk_Loop', 0.2, WALK / 0.94 / (r.scale.x / (r.userData.baseScale ?? 1)));
        }
        if (k.path.length === 0) {
          k.wait = 3 + Math.random() * 6;
          m.play(Math.random() < 0.35 ? 'Dance_Loop' : 'Idle_Loop', 0.3);
        }
      } else {
        k.wait -= dt;
        if (k.wait <= 0) {
          const to = this.freeSpot();
          k.path = this.room.nav.findPath({ x: r.position.x, z: r.position.z }, to) ?? [];
          k.wait = 2;
        }
      }
      m.update(dt);
    }
  }

  dispose(): void {
    for (const id of [...this.kids.keys()]) this.remove(id);
  }
}
