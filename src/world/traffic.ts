import { Group, Mesh, MeshStandardMaterial, type Scene } from 'three';
import { at, cyl, mat, rbox, sphere } from '../home/primitives';
import { mergeStatic } from '../home/mergeStatic';
import { quality } from '../engine/graphics';

// Cars and motorbikes on the two lanes of the main road. They loop around the map and stop
// when someone is standing in front of them.

interface Vehicle {
  group: Group;
  lane: -1 | 1;
  speed: number;
  x: number;
}

const LANE_Z = 2;
const END = 64;

function car(color: string): Group {
  const g = new Group();
  at(rbox(3.8, 0.9, 1.7, 0.25, mat(color, 0.35, 0.3)), 0, 0.75, 0, g);
  at(rbox(2.0, 0.7, 1.5, 0.22, mat('#2b3442', 0.2, 0.4)), -0.2, 1.45, 0, g);
  for (const [x, z] of [[-1.2, -0.85], [1.2, -0.85], [-1.2, 0.85], [1.2, 0.85]]) at(cyl(0.36, 0.36, 0.25, mat('#1d1d1f'), 12), x, 0.36, z, g).rotation.x = Math.PI / 2;
  at(rbox(0.1, 0.2, 0.4, 0.05, new MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffd27a', emissiveIntensity: 0.4 })), 1.9, 0.8, 0.5, g);
  at(rbox(0.1, 0.2, 0.4, 0.05, new MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffd27a', emissiveIntensity: 0.4 })), 1.9, 0.8, -0.5, g);
  return g;
}

/** Angkot: a small public minibus with an open side door and a route stripe. */
function angkot(color: string): Group {
  const g = new Group();
  at(rbox(3.6, 1.5, 1.6, 0.12, mat(color, 0.4, 0.2)), 0, 1.1, 0, g);
  at(rbox(3.62, 0.12, 1.62, 0.04, mat('#f4f1e8', 0.5)), 0, 1.0, 0, g); // stripe
  for (const s of [-1, 1]) at(rbox(2.6, 0.5, 0.02, 0.01, mat('#2b3442', 0.2, 0.4)), -0.2, 1.5, s * 0.81, g); // side windows
  at(rbox(0.05, 0.6, 1.3, 0.02, mat('#2b3442', 0.2, 0.4)), 1.8, 1.45, 0, g); // windscreen
  for (const [x, z] of [[-1.1, -0.8], [1.1, -0.8], [-1.1, 0.8], [1.1, 0.8]]) at(cyl(0.3, 0.3, 0.22, mat('#1d1d1f'), 12), x, 0.3, z, g).rotation.x = Math.PI / 2;
  return g;
}

/** A motorbike (also used for the player's own bike). */
export function motorbike(color: string, withRider: boolean): Group {
  const g = new Group();
  at(rbox(1.5, 0.35, 0.3, 0.12, mat(color, 0.4, 0.3)), 0, 0.65, 0, g);
  at(rbox(0.6, 0.12, 0.28, 0.06, mat('#222')), -0.15, 0.88, 0, g);
  for (const x of [-0.6, 0.6]) at(cyl(0.3, 0.3, 0.1, mat('#1d1d1f'), 12), x, 0.3, 0, g).rotation.x = Math.PI / 2;
  at(cyl(0.025, 0.025, 0.6, mat('#9aa3ab', 0.3, 0.6), 6), 0.6, 1.05, 0, g).rotation.x = Math.PI / 2;
  if (withRider) {
    const rider = mat(['#3f6fa8', '#e8747c', '#4f9a8a', '#f2c14e'][Math.floor(Math.random() * 4)], 0.8);
    at(rbox(0.3, 0.6, 0.4, 0.12, rider), -0.15, 1.25, 0, g);
    at(sphere(0.17, mat(['#e74c3c', '#2d2d33', '#f4f4f2'][Math.floor(Math.random() * 3)], 0.3)), -0.1, 1.7, 0, g);
  }
  return g;
}

export class Traffic {
  private readonly vehicles: Vehicle[] = [];

  constructor(scene: Scene, count = 8, opts: { angkotColor?: string } = {}) {
    const colors = ['#c0392b', '#2c3e50', '#ecf0f1', '#7f8c8d', '#2980b9', '#d35400', '#16a085', '#8e44ad'];
    for (let i = 0; i < count; i++) {
      const lane: -1 | 1 = i % 2 === 0 ? 1 : -1;
      const isBike = i % 3 !== 0; // motorbikes rule Indonesian roads
      // Cities with angkot: some of the cars are minibuses in the city's angkot colour.
      const group = isBike ? motorbike(colors[i % colors.length], true) : opts.angkotColor && i % 2 === 0 ? angkot(opts.angkotColor) : car(colors[i % colors.length]);
      mergeStatic(group); // one draw call per material
      if (!quality.extraShadows) group.traverse((o) => (o.castShadow = false));
      const v: Vehicle = { group, lane, speed: isBike ? 8 + Math.random() * 3 : 6 + Math.random() * 2, x: -END + (i / count) * END * 2 };
      group.rotation.y = lane === 1 ? 0 : Math.PI;
      group.position.set(v.x, 0, lane * LANE_Z * -1);
      scene.add(group);
      this.vehicles.push(v);
    }
  }

  /** `blockers`: positions of people on the road (vehicles wait for them). */
  update(dt: number, blockers: { x: number; z: number }[]): void {
    for (const v of this.vehicles) {
      const dir = v.lane;
      const z = -v.lane * LANE_Z;
      const ahead = blockers.some((b) => Math.abs(b.z - z) < 1.6 && (b.x - v.x) * dir > 0 && (b.x - v.x) * dir < 5);
      const carAhead = this.vehicles.some((o) => o !== v && o.lane === v.lane && (o.x - v.x) * dir > 0 && (o.x - v.x) * dir < 5);
      if (!ahead && !carAhead) v.x += dir * v.speed * dt;
      if (v.x > END) v.x = -END;
      if (v.x < -END) v.x = END;
      v.group.position.set(v.x, 0, z);
    }
  }

  dispose(): void {
    for (const v of this.vehicles) {
      v.group.removeFromParent();
      v.group.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          (o.material as MeshStandardMaterial).dispose();
        }
      });
    }
  }
}
