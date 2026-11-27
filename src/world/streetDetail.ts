import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  QuadraticBezierCurve3,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getQuality } from '../engine/graphics';
import { instanceProp } from '../engine/props';

// What makes an Indonesian street: concrete power poles with crossarms, a transformer here and
// there, sagging power and phone/internet cables (with the odd coil of spare cable), service
// wires running to the houses and shops, and the outdoor units of air conditioners on the walls.
// Everything is merged into a handful of meshes.

export interface Pole {
  x: number;
  z: number;
}

const POLE_H = 9;

/** A cable hanging between two points with a sag in the middle. */
function cable(a: Vector3, b: Vector3, sag: number, r: number): BufferGeometry {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y -= sag * 2; // a quadratic curve reaches half way to its control point
  return new TubeGeometry(new QuadraticBezierCurve3(a, mid, b), 10, r, 3, false);
}

export class StreetDetail {
  readonly group = new Group();
  private readonly materials: Material[] = [];

  /**
   * `poles`: lines of poles (each line in order along the street; cables run from one pole to the
   * next). `drops`: points on building fronts that get a service wire from the nearest pole.
   * `acUnits`: wall spots (x, y, z, facing angle) for air conditioner units.
   */
  constructor(poleLines: Pole[][], drops: { x: number; y: number; z: number }[], acUnits: { x: number; y: number; z: number; heading: number }[]) {
    const concrete: BufferGeometry[] = [];
    const steel: BufferGeometry[] = [];
    const power: BufferGeometry[] = [];
    const telecom: BufferGeometry[] = [];
    const all: Pole[] = poleLines.flat();
    let n = 0;
    for (const line of poleLines) {
      for (let i = 0; i < line.length; i++) {
        const p = line[i];
        const pole = new CylinderGeometry(0.09, 0.14, POLE_H, 8);
        pole.translate(p.x, POLE_H / 2, p.z);
        concrete.push(pole);
        // Crossarm across the street direction, with three insulators.
        const arm = new BoxGeometry(0.1, 0.1, 1.6);
        arm.translate(p.x, POLE_H - 0.5, p.z);
        steel.push(arm);
        for (const dz of [-0.7, 0, 0.7]) {
          const ins = new CylinderGeometry(0.04, 0.05, 0.16, 6);
          ins.translate(p.x, POLE_H - 0.37, p.z + dz);
          steel.push(ins);
        }
        // A transformer on every fourth pole.
        if (n++ % 4 === 1) {
          const tr = new CylinderGeometry(0.32, 0.32, 0.9, 10);
          tr.translate(p.x + 0.4, POLE_H - 2.2, p.z);
          steel.push(tr);
          const br = new BoxGeometry(0.5, 0.08, 0.1);
          br.translate(p.x + 0.2, POLE_H - 2.7, p.z);
          steel.push(br);
        }
        // Spare cable coiled on some poles.
        if (n % 3 === 0) {
          const coil = new TorusGeometry(0.28, 0.025, 4, 12);
          coil.rotateY(Math.PI / 2);
          coil.translate(p.x + 0.12, 6.0, p.z);
          telecom.push(coil);
        }
        const q = line[i + 1];
        if (!q) continue;
        const span = Math.hypot(q.x - p.x, q.z - p.z);
        // Three power lines on the insulators, two thick phone/internet bundles lower down.
        for (const dz of [-0.7, 0, 0.7]) power.push(cable(new Vector3(p.x, POLE_H - 0.3, p.z + dz), new Vector3(q.x, POLE_H - 0.3, q.z + dz), span * 0.02, 0.012));
        for (const [h, dz, extra] of [[6.6, 0.12, 0.04], [6.2, -0.1, 0.07]] as const)
          telecom.push(cable(new Vector3(p.x, h, p.z + dz), new Vector3(q.x, h, q.z + dz), span * extra, 0.028));
      }
    }
    // Service wires from the nearest pole to each building.
    for (const d of drops) {
      let best: Pole | null = null;
      let bd = 30;
      for (const p of all) {
        const dist = Math.hypot(p.x - d.x, p.z - d.z);
        if (dist < bd) {
          bd = dist;
          best = p;
        }
      }
      if (best) telecom.push(cable(new Vector3(best.x, 6.4, best.z), new Vector3(d.x, d.y, d.z), bd * 0.04, 0.015));
    }
    // AC outdoor units: a white box with a dark round fan grille and a pipe down the wall.
    const acBody: BufferGeometry[] = [];
    const acFan: BufferGeometry[] = [];
    // Medium/High: the real (photo-scanned) unit, all of them drawn together; Low: simple boxes.
    const real = getQuality() !== 'low';
    if (real) {
      const at = new Matrix4();
      const places = acUnits.map((a) => at.clone().makeRotationY(a.heading).setPosition(a.x, a.y - 0.3, a.z + 0));
      this.group.add(instanceProp('exterior_aircon_unit', places, 0.62));
    }
    for (const a of acUnits) {
      const body = new BoxGeometry(0.8, 0.56, 0.3);
      const fan = new CylinderGeometry(0.19, 0.19, 0.02, 14);
      fan.rotateX(Math.PI / 2);
      fan.translate(-0.12, 0, 0.16);
      const pipe = new BoxGeometry(0.04, 1.2, 0.04);
      pipe.translate(0.34, -0.8, -0.05);
      for (const [g, list] of (real ? [[pipe, acBody]] : [[body, acBody], [fan, acFan], [pipe, acBody]]) as [BufferGeometry, BufferGeometry[]][]) {
        g.rotateY(a.heading);
        g.translate(a.x, a.y, a.z);
        list.push(g);
      }
    }
    const add = (parts: BufferGeometry[], mat: MeshStandardMaterial, shadow = true): void => {
      if (!parts.length) return;
      this.materials.push(mat);
      const mesh = new Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!, mat);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    add(concrete, new MeshStandardMaterial({ color: '#a9a69e', roughness: 0.9 }));
    add(steel, new MeshStandardMaterial({ color: '#6f757b', roughness: 0.6, metalness: 0.4 }));
    add(power, new MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.6 }), false);
    add(telecom, new MeshStandardMaterial({ color: '#151515', roughness: 0.8 }), false);
    add(acBody, new MeshStandardMaterial({ color: '#e9eaea', roughness: 0.5 }));
    add(acFan, new MeshStandardMaterial({ color: '#3a3d40', roughness: 0.7 }), false);
  }

  dispose(): void {
    this.group.traverse((o) => {
      // Shared prop geometry (instanced AC units) stays with the prop cache.
      if (o instanceof Mesh && !(o instanceof InstancedMesh)) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}
