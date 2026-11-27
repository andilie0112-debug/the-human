import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergeStatic } from '../home/mergeStatic';
import { getQuality } from '../engine/graphics';
import { pbr } from '../engine/pbr';
import { cityBus, cityCar, mpv } from './vehicles';

// The city around the neighbourhood: open land to the horizon, towers of glass, offices and
// apartments in the distance (their windows light up at night), and two elevated toll roads on
// tall pillars with city buses and cars running along them. It is all far away (beyond where you
// can walk), so it is simple boxes with painted windows, merged into a few draw calls.

/** Where the elevated roads run: one east-west to the north, one north-south to the east. */
const FLY_Z = -104;
const FLY_X = 108;
const FLY_H1 = 9;
const FLY_H2 = 15;
const FLY_LEN = 300;

type Style = 'glass' | 'office' | 'apartment';

let seed = 4242;
const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** A painted façade: floors of windows (4 bays x 8 floors per tile), and which of them are lit. */
function facadeTextures(style: Style): { map: CanvasTexture; lit: CanvasTexture } {
  const W = 256;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const e = document.createElement('canvas');
  e.width = W;
  e.height = H;
  const x = c.getContext('2d')!;
  const l = e.getContext('2d')!;
  l.fillStyle = '#000';
  l.fillRect(0, 0, W, H);
  const wall = style === 'glass' ? '#4d6a7d' : style === 'office' ? '#c9c4ba' : '#e6dccb';
  x.fillStyle = wall;
  x.fillRect(0, 0, W, H);
  const bayW = W / 4;
  const floorH = H / 8;
  for (let f = 0; f < 8; f++) {
    for (let b = 0; b < 4; b++) {
      const x0 = b * bayW;
      const y0 = f * floorH;
      if (style === 'glass') {
        // Curtain wall: tinted panes with thin mullions, sky reflected a little lighter at the top.
        const grd = x.createLinearGradient(0, y0, 0, y0 + floorH);
        grd.addColorStop(0, '#7f9fb5');
        grd.addColorStop(1, '#3e5a6e');
        x.fillStyle = grd;
        x.fillRect(x0 + 2, y0 + 2, bayW - 4, floorH - 4);
      } else if (style === 'office') {
        x.fillStyle = '#2f3d4a';
        x.fillRect(x0 + 4, y0 + floorH * 0.3, bayW - 8, floorH * 0.55);
      } else {
        // Apartments: a window and a small balcony with a railing (and some laundry).
        x.fillStyle = '#34414d';
        x.fillRect(x0 + 10, y0 + 12, bayW - 20, floorH - 26);
        x.fillStyle = '#b9ae9c';
        x.fillRect(x0 + 6, y0 + floorH - 16, bayW - 12, 4);
        if (rnd() < 0.25) {
          x.fillStyle = ['#c0392b', '#2980b9', '#f1c40f', '#ecf0f1'][Math.floor(rnd() * 4)];
          x.fillRect(x0 + 14 + rnd() * 20, y0 + floorH - 26, 10, 10);
        }
        // An AC unit hanging under some windows.
        if (rnd() < 0.3) {
          x.fillStyle = '#f2f2f2';
          x.fillRect(x0 + bayW - 22, y0 + floorH - 12, 14, 8);
        }
      }
      // At night, some rooms are lit (warm or cool light).
      if (rnd() < (style === 'glass' ? 0.3 : 0.4)) {
        l.fillStyle = rnd() < 0.7 ? '#e8c088' : '#c4d8ec';
        if (style === 'glass') l.fillRect(x0 + 6, y0 + 10, bayW - 12, floorH - 20);
        else if (style === 'office') l.fillRect(x0 + 4, y0 + floorH * 0.3, bayW - 8, floorH * 0.55);
        else l.fillRect(x0 + 10, y0 + 12, bayW - 20, floorH - 26);
      }
    }
  }
  const tex = (cv: HTMLCanvasElement, srgb: boolean): CanvasTexture => {
    const t = new CanvasTexture(cv);
    t.wrapS = t.wrapT = RepeatWrapping;
    if (srgb) t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(c, true), lit: tex(e, true) };
}

/** A tower box whose sides repeat the façade by its size (one tile = 4 bays x 8 floors). */
function tower(w: number, h: number, d: number, x: number, z: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv');
  // BoxGeometry faces: +x, -x, +y, -y, +z, -z (4 vertices each).
  const span = [d, d, 0, 0, w, w];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      if (f === 2 || f === 3) {
        uv.setXY(k, 0.02, 0.02); // roofs: a plain corner of the tile
        continue;
      }
      uv.setXY(k, uv.getX(k) * (span[f] / 14), uv.getY(k) * (h / 28));
    }
  }
  g.translate(x, h / 2, z);
  return g;
}

interface Runner {
  obj: Group;
  axis: 'x' | 'z';
  dir: 1 | -1;
  lane: number;
  pos: number;
  speed: number;
}

export class Skyline {
  readonly group = new Group();
  private readonly materials: Material[] = [];
  private readonly windows: MeshStandardMaterial[] = [];
  private readonly runners: Runner[] = [];

  constructor(scene: Scene) {
    const low = getQuality() === 'low';
    scene.add(this.group);

    // Land to the horizon (under the neighbourhood's own ground).
    const land = new Mesh(new PlaneGeometry(900, 900), this.mat(new MeshStandardMaterial({ color: '#8a9363', roughness: 1 })));
    land.rotation.x = -Math.PI / 2;
    land.position.y = -0.08;
    land.receiveShadow = true;
    this.group.add(land);

    // Towers in a ring around the neighbourhood, clear of the elevated roads.
    const parts: Record<Style, BufferGeometry[]> = { glass: [], office: [], apartment: [] };
    const count = low ? 40 : 85;
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 8; tries++) {
      const a = rnd() * Math.PI * 2;
      const r = 98 + rnd() * 110;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const w = 12 + rnd() * 18;
      const d = 12 + rnd() * 18;
      if (Math.abs(z - FLY_Z) < w / 2 + 12 || Math.abs(x - FLY_X) < w / 2 + 12) continue;
      const tall = rnd();
      const h = tall < 0.15 ? 70 + rnd() * 60 : tall < 0.55 ? 35 + rnd() * 30 : 14 + rnd() * 18;
      const style: Style = h > 60 ? (rnd() < 0.7 ? 'glass' : 'office') : rnd() < 0.5 ? 'apartment' : rnd() < 0.5 ? 'office' : 'glass';
      parts[style].push(tower(w, h, d, x, z));
      // Water tanks and a little roof structure on top of some.
      if (rnd() < 0.5) parts.office.push(tower(w * 0.35, 3, d * 0.35, x + (rnd() - 0.5) * w * 0.3, z + (rnd() - 0.5) * d * 0.3).translate(0, h, 0));
      placed++;
    }
    for (const style of ['glass', 'office', 'apartment'] as Style[]) {
      if (!parts[style].length) continue;
      const { map, lit } = facadeTextures(style);
      const mat = new MeshStandardMaterial({
        map,
        emissiveMap: lit,
        emissive: new Color('#ffffff'),
        emissiveIntensity: 0,
        roughness: style === 'glass' ? 0.15 : 0.85,
        metalness: style === 'glass' ? 0.55 : 0,
      });
      this.windows.push(mat);
      this.mat(mat);
      const mesh = new Mesh(mergeGeometries(parts[style])!, mat);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
    }

    // The two elevated roads: deck, asphalt with lane marks, barriers and T-shaped pillars.
    this.group.add(this.flyover('x', FLY_Z, FLY_H1));
    this.group.add(this.flyover('z', FLY_X, FLY_H2));

    // Buses and cars on them, both ways.
    const add = (axis: 'x' | 'z', obj: Group, dir: 1 | -1, speed: number): void => {
      mergeStatic(obj);
      obj.traverse((o) => (o.castShadow = false));
      this.group.add(obj);
      const lane = dir * (axis === 'x' ? -2.6 : 2.6) + (rnd() - 0.5) * 0.4;
      this.runners.push({ obj, axis, dir, lane, pos: (rnd() * 2 - 1) * FLY_LEN, speed });
    };
    const colors = ['#f4f6f7', '#1c1c1e', '#bdc3c7', '#7f8c8d', '#c0392b', '#2e4053'];
    for (const axis of ['x', 'z'] as const) {
      for (let i = 0; i < (low ? 2 : 3); i++) add(axis, cityBus(), i % 2 ? 1 : -1, 13 + rnd() * 3);
      for (let i = 0; i < (low ? 3 : 6); i++) add(axis, i % 2 ? mpv(colors[i % colors.length]) : cityCar(colors[(i + 3) % colors.length]), i % 2 ? -1 : 1, 18 + rnd() * 6);
    }
    this.update(0);
  }

  private mat<T extends Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private flyover(axis: 'x' | 'z', at: number, h: number): Group {
    const g = new Group();
    const L = FLY_LEN * 2;
    const along = (len: number, a: number, b: number): [number, number, number] => (axis === 'x' ? [len, a, b] : [b, a, len]);
    const place = (m: Mesh, u: number, y: number, v: number): void => {
      if (axis === 'x') m.position.set(u, y, at + v);
      else m.position.set(at + v, y, u);
      g.add(m);
    };
    const concrete = pbr('concrete', { repeat: axis === 'x' ? [60, 2] : [2, 60], tint: '#d6d2c8' });
    const deck = new Mesh(new BoxGeometry(...along(L, 1.1, 13)), concrete);
    place(deck, 0, h, 0);
    const road = new Mesh(new BoxGeometry(...along(L, 0.06, 11.6)), pbr('asphalt', { repeat: axis === 'x' ? [90, 2] : [2, 90] }));
    place(road, 0, h + 0.58, 0);
    for (const s of [-1, 1]) {
      const barrier = new Mesh(new BoxGeometry(...along(L, 1.0, 0.35)), concrete);
      place(barrier, 0, h + 1.05, s * 6.3);
    }
    const marks: BufferGeometry[] = [];
    for (let u = -FLY_LEN; u < FLY_LEN; u += 9) {
      const b = new BoxGeometry(...along(3, 0.02, 0.15));
      if (axis === 'x') b.translate(u, h + 0.62, at);
      else b.translate(at, h + 0.62, u);
      marks.push(b);
    }
    g.add(new Mesh(mergeGeometries(marks)!, this.mat(new MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.6 }))));
    const piers: BufferGeometry[] = [];
    for (let u = -FLY_LEN + 10; u < FLY_LEN; u += 26) {
      const col = new BoxGeometry(2.0, h - 0.5, 2.4);
      const cap = new BoxGeometry(...(axis === 'x' ? [2.0, 1.3, 11] : [11, 1.3, 2.0]) as [number, number, number]);
      col.translate(0, (h - 0.5) / 2, 0);
      cap.translate(0, h - 1.1, 0);
      for (const p of [col, cap]) {
        if (axis === 'x') p.translate(u, 0, at);
        else p.translate(at, 0, u);
        piers.push(p);
      }
    }
    const pierMesh = new Mesh(mergeGeometries(piers)!, pbr('concrete', { repeat: [1, 3], tint: '#cfcabe' }));
    pierMesh.castShadow = true;
    g.add(pierMesh);
    mergeStatic(g);
    return g;
  }

  /** Windows lit at night. */
  setNight(night: boolean): void {
    for (const m of this.windows) m.emissiveIntensity = night ? 0.8 : 0;
  }

  update(dt: number): void {
    for (const r of this.runners) {
      r.pos += r.dir * r.speed * dt;
      if (r.pos > FLY_LEN) r.pos = -FLY_LEN;
      if (r.pos < -FLY_LEN) r.pos = FLY_LEN;
      if (r.axis === 'x') {
        r.obj.position.set(r.pos, FLY_H1 + 0.6, FLY_Z + r.lane);
        r.obj.rotation.y = r.dir > 0 ? 0 : Math.PI;
      } else {
        r.obj.position.set(FLY_X + r.lane, FLY_H2 + 0.6, r.pos);
        r.obj.rotation.y = r.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
    this.group.removeFromParent();
  }
}
