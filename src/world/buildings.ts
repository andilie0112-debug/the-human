import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, type Material } from 'three';
import { pbr } from '../engine/pbr';
import { BoxGeometry } from 'three';
import { at } from '../home/primitives';

/** A plain box mesh (12 triangles): scenery does not need rounded edges. */
function rbox(w: number, h: number, d: number, _r: number, m: Material): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Everyday Indonesian buildings from scanned textures: plastered and painted walls, clay-tile
// (genteng) or zinc (seng) gable roofs, framed windows with bars, a door, a tiled terrace and a
// low iron fence. Used around the player's home and in the neighbourhood.

export interface HouseOptions {
  w: number;
  d: number;
  /** Wall height. */
  h?: number;
  wall: string;
  roof?: 'genteng' | 'seng';
  /** Second floor (ruko-style). */
  floors?: 1 | 2;
  terrace?: boolean;
  fence?: boolean;
  /** Optional shop front instead of windows (warung). */
  shop?: boolean;
}

const glassMat = new MeshStandardMaterial({ color: '#9fb7c4', roughness: 0.08, metalness: 0.3 });
const darkMat = new MeshStandardMaterial({ color: '#2a2622', roughness: 0.7 });
const ironMat = new MeshStandardMaterial({ color: '#2f3134', roughness: 0.5, metalness: 0.6 });

/** A triangular gable wall in the x/y plane. */
function gable(w: number, rise: number, m: Material): Mesh {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, rise, 0], 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, w / 2, 0, w / 4, rise / 2], 2));
  g.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const mesh = new Mesh(g, m);
  mesh.castShadow = true;
  return mesh;
}

/** A house facing +z, origin at the ground centre of its footprint. */
export function indoHouse(o: HouseOptions): Group {
  const g = new Group();
  const h = o.h ?? 2.9;
  const floors = o.floors ?? 1;
  const H = h * floors;
  const wall = pbr('plaster', { tint: o.wall, repeat: [3, 2], normalScale: 0.4 });
  const trim = pbr('plaster', { tint: '#efe9df', repeat: [1, 1], normalScale: 0.3 });
  const frame = pbr('wood_dark', { tint: '#e0c4a0' });
  // Plinth and walls.
  at(rbox(o.w + 0.1, 0.3, o.d + 0.1, 0.02, pbr('concrete', { tint: '#c8c2b8', repeat: [3, 1] })), 0, 0.15, 0, g);
  at(rbox(o.w, H, o.d, 0.03, wall), 0, H / 2 + 0.3, 0, g);
  if (floors === 2) at(rbox(o.w + 0.2, 0.12, o.d + 0.2, 0.02, trim), 0, h + 0.3, 0, g); // floor band
  // Roof: gable along x, ridge in the middle.
  const rise = Math.min(1.6, o.d * 0.32);
  const half = o.d / 2 + 0.45;
  const slope = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  const roofMat = o.roof === 'seng' ? pbr('zinc', { repeat: [6, 2], tint: '#b8bcc0', roughness: 0.5, metalness: 0.5 }) : pbr('roof_tiles', { repeat: [6, 3], tint: '#d0866a' });
  for (const s of [-1, 1]) {
    const plane = at(rbox(o.w + 0.7, 0.06, slope, 0.01, roofMat), 0, H + 0.3 + rise / 2, (s * half) / 2, g);
    plane.rotation.x = s * ang;
  }
  for (const s of [-1, 1]) {
    const tri = gable(o.d + 0.02, rise, wall);
    tri.rotation.y = (s * Math.PI) / 2;
    tri.position.set((s * o.w) / 2, H + 0.3, 0);
    g.add(tri);
  }
  at(rbox(o.w + 0.75, 0.1, 0.16, 0.03, o.roof === 'seng' ? roofMat : pbr('roof_tiles', { tint: '#b56a52' })), 0, H + 0.3 + rise + 0.02, 0, g); // ridge
  // Front: door, windows (with iron bars) or a shop opening.
  const fz = o.d / 2 + 0.01;
  const doorX = o.shop ? o.w / 2 - 0.7 : -o.w / 4;
  at(rbox(0.95, 2.1, 0.06, 0.01, frame), doorX, 1.35, fz, g);
  at(rbox(0.8, 1.95, 0.04, 0.01, pbr('wood_dark', { tint: '#c99d73' })), doorX, 1.3, fz + 0.02, g);
  if (o.shop) {
    // Warung front: wide opening with a counter and a zinc awning.
    at(rbox(o.w * 0.6, 1.6, 0.04, 0.01, darkMat), -o.w * 0.12, 1.5, fz, g);
    at(rbox(o.w * 0.62, 0.9, 0.5, 0.02, frame), -o.w * 0.12, 0.75, fz + 0.3, g);
    const awning = at(rbox(o.w + 0.3, 0.04, 1.4, 0.01, pbr('zinc', { repeat: [6, 2], tint: '#b8bcc0', roughness: 0.5, metalness: 0.5 })), 0, 2.55, fz + 0.65, g);
    awning.rotation.x = 0.18;
  } else {
    for (const wx of [o.w / 6, o.w / 2.6].filter((x) => x + 0.6 < o.w / 2)) {
      at(rbox(1.0, 1.15, 0.06, 0.01, frame), wx, 1.65, fz, g);
      at(rbox(0.86, 1.0, 0.02, 0.005, glassMat), wx, 1.65, fz + 0.02, g);
      for (let b = -2; b <= 2; b++) at(rbox(0.015, 1.0, 0.015, 0.003, ironMat), wx + b * 0.17, 1.65, fz + 0.06, g);
    }
  }
  if (floors === 2) {
    for (const wx of [-o.w / 4, o.w / 4]) {
      at(rbox(1.1, 1.1, 0.06, 0.01, frame), wx, h + 1.6, fz, g);
      at(rbox(0.96, 0.96, 0.02, 0.005, glassMat), wx, h + 1.6, fz + 0.02, g);
    }
  }
  // Terrace with tiles, two columns and a small roof.
  if (o.terrace !== false && !o.shop) {
    at(rbox(o.w, 0.12, 1.6, 0.01, pbr('tiles_cream', { repeat: [5, 1.3] })), 0, 0.36, o.d / 2 + 0.8, g);
    for (const cx of [-o.w / 2 + 0.2, o.w / 2 - 0.2]) at(rbox(0.16, 2.2, 0.16, 0.02, trim), cx, 1.5, o.d / 2 + 1.5, g);
    const canopy = at(rbox(o.w + 0.2, 0.05, 1.8, 0.01, o.roof === 'seng' ? roofMat : pbr('roof_tiles', { repeat: [6, 3], tint: '#d0866a' })), 0, 2.7, o.d / 2 + 0.85, g);
    canopy.rotation.x = 0.12;
  }
  // Low fence with a gate gap.
  if (o.fence) {
    const fz2 = o.d / 2 + 2.4;
    at(rbox(o.w, 0.45, 0.15, 0.01, trim), -0.6, 0.22, fz2, g).scale.x = (o.w - 1.4) / o.w;
    for (let x = -o.w / 2; x <= o.w / 2 - 1.4; x += 0.12) at(rbox(0.02, 0.7, 0.02, 0.003, ironMat), x, 0.8, fz2, g);
    at(rbox(o.w - 1.4, 0.03, 0.03, 0.005, ironMat), -0.7, 1.13, fz2, g);
  }
  return g;
}
