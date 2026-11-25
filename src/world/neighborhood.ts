import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  type Material,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tDynamic } from '../data/strings';

// The neighborhood (open world), built from primitives. Static parts are merged per colour so
// the whole map costs few draw calls on phones.

export interface PlaceData {
  id: string;
  nameKey: string;
  kind: string;
  religion?: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** Direction the door faces, degrees around Y (0 = +z). */
  rot: number;
  color: string;
}

export interface Box2 {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Neighborhood {
  scene: Scene;
  colliders: Box2[];
  /** Point in front of each place's door, and the direction facing the door. */
  doors: Map<string, { x: number; z: number; heading: number }>;
  bounds: Box2;
  setNight: (night: boolean) => void;
  dispose: () => void;
}

const MAP = 66;

function signTexture(text: string, bg: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#ffffff';
  g.font = 'bold 54px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66, 490);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Collects static meshes and merges them by material colour. */
class StaticBatch {
  private readonly buckets = new Map<string, { mat: MeshStandardMaterial; geos: BufferGeometry[] }>();

  add(geo: BufferGeometry, color: string, x: number, y: number, z: number, rotY = 0, emissive?: string): void {
    const g = geo.toNonIndexed();
    g.rotateY(rotY);
    g.translate(x, y, z);
    const key = `${color}|${emissive ?? ''}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { mat: new MeshStandardMaterial({ color, roughness: 0.85, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 0.6 : 0 }), geos: [] };
      this.buckets.set(key, b);
    }
    // Keep only the attributes every primitive has, so they merge.
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    b.geos.push(g);
    geo.dispose();
  }

  box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, rotY = 0, emissive?: string): void {
    this.add(new BoxGeometry(w, h, d), color, x, y, z, rotY, emissive);
  }

  build(parent: Object3D): Material[] {
    const mats: Material[] = [];
    for (const { mat, geos } of this.buckets.values()) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      mats.push(mat);
    }
    return mats;
  }
}

/** Rotates a local offset (lx, lz) of a building by its door direction. */
function local(p: PlaceData, lx: number, lz: number): [number, number] {
  const a = (p.rot * Math.PI) / 180;
  return [p.x + lx * Math.cos(a) + lz * Math.sin(a), p.z - lx * Math.sin(a) + lz * Math.cos(a)];
}

export function createNeighborhood(places: readonly PlaceData[], labels: Record<string, string> = {}): Neighborhood {
  const scene = new Scene();
  scene.background = new Color('#bfe0f5');
  scene.fog = new Fog('#bfe0f5', 60, 140);
  const hemi = new HemisphereLight('#fff6e8', '#6b7d5a', 1.2);
  scene.add(hemi);
  const sun = new DirectionalLight('#ffe2b8', 2.4);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 150;
  scene.add(sun);

  const batch = new StaticBatch();
  const colliders: Box2[] = [];
  const doors = new Map<string, { x: number; z: number; heading: number }>();
  const extras: Object3D[] = [];
  const textures: CanvasTexture[] = [];

  // Ground, roads, sidewalks.
  batch.add(new PlaneGeometry(MAP * 2.4, MAP * 2.4).rotateX(-Math.PI / 2), '#8fae6e', 0, -0.02, 0);
  batch.box(MAP * 2, 0.04, 8, '#4a4d52', 0, 0, 0); // main road
  for (let x = -MAP + 3; x < MAP; x += 6) batch.box(2.4, 0.045, 0.18, '#f4f1e8', x, 0.005, 0); // centre dashes
  for (const z of [-5.25, 5.25]) batch.box(MAP * 2, 0.16, 2.5, '#c9c4b8', 0, 0.06, z); // sidewalks
  batch.box(4, 0.04, MAP - 6, '#55585d', 10, 0, -(MAP + 6) / 2); // gang
  for (const x of [7.4, 12.6]) batch.box(1.2, 0.14, MAP - 6.5, '#c9c4b8', x, 0.05, -(MAP + 6.5) / 2);

  // Trees and street lamps along the main road.
  const lampBulbs: MeshStandardMaterial[] = [];
  for (let x = -60; x <= 60; x += 15) {
    for (const z of [-6.2, 6.2]) {
      const tx = x + (z > 0 ? 7 : 0);
      if (places.some((p) => Math.abs(tx - p.x) < p.w / 2 + 1 && Math.abs(z - (p.z + Math.sign(p.z) * -1 * (p.d / 2))) < 2)) continue;
      batch.add(new CylinderGeometry(0.18, 0.25, 2.6, 8), '#7a5638', tx, 1.3, z);
      batch.add(new SphereGeometry(1.5, 10, 8), '#4f8a4a', tx, 3.4, z);
      colliders.push({ x0: tx - 0.4, z0: z - 0.4, x1: tx + 0.4, z1: z + 0.4 });
    }
  }
  for (let x = -55; x <= 55; x += 22) {
    batch.add(new CylinderGeometry(0.07, 0.09, 4.4, 6), '#3a3d42', x, 2.2, -4.2);
    batch.box(0.9, 0.08, 0.1, '#3a3d42', x, 4.35, -3.8);
    const bulbMat = new MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffd27a', emissiveIntensity: 0.1 });
    lampBulbs.push(bulbMat);
    const bulb = new Mesh(new SphereGeometry(0.16, 10, 8), bulbMat);
    bulb.position.set(x, 4.25, -3.4);
    extras.push(bulb);
  }
  const nightLights: PointLight[] = [];
  for (const x of [-30, 0, 30]) {
    const l = new PointLight('#ffcf8a', 0, 30, 1.2);
    l.position.set(x, 5, 0);
    nightLights.push(l);
    scene.add(l);
  }

  // Buildings.
  for (const p of places) {
    const [dx, dz] = [Math.sin((p.rot * Math.PI) / 180), Math.cos((p.rot * Math.PI) / 180)];
    const a = (p.rot * Math.PI) / 180;
    const frontDist = p.d / 2;
    const doorDist = frontDist + (p.id === 'pura' ? 3.4 : 1.6); // the pura gate stands in front of its door
    doors.set(p.id, { x: p.x + dx * doorDist, z: p.z + dz * doorDist, heading: Math.atan2(-dx, -dz) });
    const roofColor = new Color(p.color).multiplyScalar(0.65).getStyle();
    if (p.kind === 'park') {
      batch.box(p.w, 0.06, p.d, '#7fb069', p.x, 0.03, p.z);
      batch.box(p.w * 0.8, 0.07, 1.4, '#d9c9a8', p.x, 0.04, p.z);
      for (const [lx, lz] of [[-6, -4], [5, 3], [-3, 4], [7, -4]]) {
        const [tx, tz] = local(p, lx, lz);
        batch.add(new CylinderGeometry(0.2, 0.28, 2.6, 8), '#7a5638', tx, 1.3, tz);
        batch.add(new SphereGeometry(1.8, 10, 8), '#4f9a52', tx, 3.5, tz);
        colliders.push({ x0: tx - 0.4, z0: tz - 0.4, x1: tx + 0.4, z1: tz + 0.4 });
      }
      for (const lx of [-3, 3]) {
        const [bx, bz] = local(p, lx, -1.6);
        batch.box(1.8, 0.1, 0.5, '#a8774e', bx, 0.5, bz, a);
        batch.box(1.8, 0.5, 0.1, '#a8774e', bx, 0.75, bz - dz * 0.25, a);
      }
    } else if (p.kind === 'stop' || p.kind === 'ojol') {
      batch.box(p.w, 0.12, p.d, p.color, p.x, p.h, p.z);
      for (const lx of [-p.w / 2 + 0.2, p.w / 2 - 0.2]) {
        const [px, pz] = local(p, lx, -p.d / 2 + 0.2);
        batch.box(0.12, p.h, 0.12, '#3a3d42', px, p.h / 2, pz);
      }
      const [bx, bz] = local(p, 0, -p.d / 2 + 0.5);
      batch.box(p.w * 0.8, 0.1, 0.5, '#a8774e', bx, 0.5, bz, a);
    } else {
      // Body, roof slab, door and windows.
      batch.box(p.w, p.h, p.d, p.color, p.x, p.h / 2, p.z, a);
      batch.box(p.w + 0.6, 0.35, p.d + 0.6, roofColor, p.x, p.h + 0.17, p.z, a);
      colliders.push({ x0: p.x - (Math.abs(dz) > 0.5 ? p.w : p.d) / 2 - 0.2, z0: p.z - (Math.abs(dz) > 0.5 ? p.d : p.w) / 2 - 0.2, x1: p.x + (Math.abs(dz) > 0.5 ? p.w : p.d) / 2 + 0.2, z1: p.z + (Math.abs(dz) > 0.5 ? p.d : p.w) / 2 + 0.2 });
      const [doorX, doorZ] = local(p, 0, frontDist + 0.03);
      batch.box(1.6, 2.3, 0.08, '#5a3d2b', doorX, 1.15, doorZ, a);
      const floors = Math.max(1, Math.round(p.h / 3.2));
      for (let f = 0; f < floors; f++) {
        for (const lx of [-p.w / 2 + 1.8, p.w / 2 - 1.8]) {
          if (p.w < 6) continue;
          const [wx, wz] = local(p, lx, frontDist + 0.04);
          batch.box(1.6, 1.1, 0.06, '#bfe0f5', wx, 1.6 + f * 3.2, wz, a, '#0a1a2a');
        }
      }
      // Distinctive shapes for places of worship and the market.
      if (p.id === 'masjid') {
        batch.add(new SphereGeometry(3.2, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#3f8f6b', p.x, p.h + 0.3, p.z);
        const [mx, mz] = local(p, p.w / 2 - 1, -p.d / 2 + 1);
        batch.add(new CylinderGeometry(0.6, 0.7, 13, 10), '#f4f1e8', mx, 6.5, mz);
        batch.add(new ConeGeometry(0.8, 2, 10), '#3f8f6b', mx, 14, mz);
      }
      if (p.id === 'gereja' || p.id === 'gereja_katolik') {
        const roof = new ConeGeometry(p.w * 0.75, 3, 4);
        roof.rotateY(Math.PI / 4);
        batch.add(roof, '#8a4b3a', p.x, p.h + 1.6, p.z, a);
        const [cx, cz] = local(p, 0, frontDist - 1);
        batch.add(new CylinderGeometry(1, 1, 4, 4).rotateY(Math.PI / 4), p.color, cx, p.h + 2, cz, a);
        batch.box(0.25, 1.6, 0.25, '#f2c14e', cx, p.h + 4.9, cz, a);
        batch.box(1.0, 0.25, 0.25, '#f2c14e', cx, p.h + 5.2, cz, a);
      }
      if (p.id === 'pura') {
        // Candi bentar: the split gate in front.
        for (const lx of [-1.8, 1.8]) {
          const [gx, gz] = local(p, lx, frontDist + 1.2);
          batch.add(new CylinderGeometry(0.4, 1.0, 4.5, 4).rotateY(Math.PI / 4), '#a0522d', gx, 2.25, gz, a);
          colliders.push({ x0: gx - 0.8, z0: gz - 0.8, x1: gx + 0.8, z1: gz + 0.8 });
        }
        for (let i = 0; i < 3; i++) batch.box(p.w * (0.9 - i * 0.22), 0.5, p.d * (0.9 - i * 0.22), '#3d2f22', p.x, p.h + 0.6 + i * 0.9, p.z, a);
      }
      if (p.id === 'vihara') {
        for (let i = 0; i < 3; i++) batch.box(p.w * (1.1 - i * 0.25), 0.4, p.d * (1.1 - i * 0.25), '#c0392b', p.x, p.h + 0.5 + i * 1.2, p.z, a);
        batch.add(new ConeGeometry(0.5, 1.6, 8), '#f2c14e', p.x, p.h + 4.3, p.z);
      }
      if (p.id === 'klenteng') {
        batch.box(p.w + 1.6, 0.5, p.d + 1.2, '#2f6e4f', p.x, p.h + 0.6, p.z, a);
        for (const lx of [-2.5, 2.5]) {
          const [lxw, lzw] = local(p, lx, frontDist + 0.6);
          batch.add(new SphereGeometry(0.4, 10, 8), '#e74c3c', lxw, p.h - 0.6, lzw, 0, '#7a1a10');
        }
      }
      if (p.id === 'pasar') {
        for (let i = 0; i < 4; i++) {
          const [sx, sz] = local(p, -6 + i * 4, frontDist + 1.4);
          batch.box(3, 0.9, 1.2, ['#e2725b', '#f2c14e', '#4f9a52', '#5bc0de'][i], sx, 0.45, sz, a);
          batch.box(3.2, 0.08, 1.6, '#f4f1e8', sx, 2.4, sz, a);
          colliders.push({ x0: sx - 1.6, z0: sz - 0.7, x1: sx + 1.6, z1: sz + 0.7 });
        }
      }
    }
    // Name sign above the door.
    const tex = signTexture(labels[p.id] ?? tDynamic(p.nameKey), p.kind === 'worship' ? '#2f4a5f' : '#c0392b');
    textures.push(tex);
    const sign = new Mesh(new PlaneGeometry(4, 1), new MeshBasicMaterial({ map: tex }));
    const [sx, sz] = local(p, 0, (p.kind === 'park' || p.kind === 'stop' || p.kind === 'ojol' ? p.d / 2 : frontDist) + 0.12);
    sign.position.set(sx, p.kind === 'park' ? 2.4 : Math.min(p.h - 0.4, 3.4), sz);
    sign.rotation.y = a;
    if (p.kind === 'park') {
      batch.box(0.15, 2.2, 0.15, '#7a5638', sx - 1.5 * Math.cos(a), 1.1, sz + 1.5 * Math.sin(a));
      batch.box(0.15, 2.2, 0.15, '#7a5638', sx + 1.5 * Math.cos(a), 1.1, sz - 1.5 * Math.sin(a));
    }
    extras.push(sign);
  }

  const root = new Group();
  const mats = batch.build(root);
  root.add(...extras);
  scene.add(root);

  const daySky = new Color('#bfe0f5');
  const nightSky = new Color('#16203a');
  const setNight = (night: boolean): void => {
    scene.background = night ? nightSky : daySky;
    (scene.fog as Fog).color.copy(night ? nightSky : daySky);
    sun.intensity = night ? 0.2 : 2.4;
    hemi.intensity = night ? 0.35 : 1.2;
    for (const m of lampBulbs) m.emissiveIntensity = night ? 2 : 0.1;
    for (const l of nightLights) l.intensity = night ? 40 : 0;
  };
  setNight(false);

  const dispose = (): void => {
    scene.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    mats.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };

  return { scene, colliders, doors, bounds: { x0: -MAP + 1, z0: -MAP + 1, x1: MAP - 1, z1: MAP - 1 }, setNight, dispose };
}
