import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, type Material } from 'three';
import { pbr } from '../engine/pbr';
import { indoHouse } from './buildings';

// Realistic fronts for the neighbourhood's places (local space: front faces +z, origin on the
// ground at the footprint centre). Shared materials so the whole street merges into few meshes.

export interface FacadeSpec {
  kind: string;
  id: string;
  w: number;
  d: number;
  h: number;
  color: string;
}

const glass = new MeshStandardMaterial({ color: '#7f9aa8', roughness: 0.06, metalness: 0.4 });
const darkGlass = new MeshStandardMaterial({ color: '#3d4b55', roughness: 0.1, metalness: 0.5 });
const iron = new MeshStandardMaterial({ color: '#2f3134', roughness: 0.5, metalness: 0.6 });
const white = new MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.6 });

function box(g: Group, w: number, h: number, d: number, m: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/** A modern masonry block with a parapet (flat roof), a window grid and a glass door. */
function block(s: FacadeSpec, o: { glassFront?: boolean; floors?: number; band?: string; canopy?: boolean }): Group {
  const g = new Group();
  const wall = pbr('plaster', { tint: s.color, repeat: [4, 3], normalScale: 0.4 });
  const trim = pbr('plaster', { tint: '#e9e5dd', repeat: [2, 1], normalScale: 0.3 });
  const fz = s.d / 2;
  box(g, s.w + 0.1, 0.3, s.d + 0.1, pbr('concrete', { tint: '#c8c2b8', repeat: [3, 1] }), 0, 0.15, 0);
  box(g, s.w, s.h, s.d, wall, 0, s.h / 2 + 0.3, 0);
  box(g, s.w + 0.2, 0.5, s.d + 0.2, trim, 0, s.h + 0.55, 0); // parapet
  const floors = o.floors ?? Math.max(1, Math.round(s.h / 3.2));
  if (o.glassFront) {
    // Shop front: full-width glass with mullions and a coloured band above it.
    box(g, s.w - 0.6, 2.6, 0.06, glass, 0, 1.65, fz + 0.02);
    for (let x = -s.w / 2 + 0.3; x <= s.w / 2 - 0.3; x += 1.8) box(g, 0.08, 2.7, 0.1, iron, x, 1.65, fz + 0.05);
  } else {
    box(g, 1.8, 2.4, 0.08, darkGlass, 0, 1.5, fz + 0.03); // entrance
  }
  if (o.band) box(g, s.w, 0.7, 0.14, new MeshStandardMaterial({ color: o.band, roughness: 0.5 }), 0, 3.4, fz + 0.08);
  for (let f = o.glassFront ? 1 : 0; f < floors; f++) {
    for (let x = -s.w / 2 + 1.4; x <= s.w / 2 - 1.4; x += 2.2) {
      if (f === 0 && Math.abs(x) < 1.6) continue; // keep the entrance clear
      box(g, 1.3, 1.2, 0.06, glass, x, 1.9 + f * 3.2, fz + 0.03);
      box(g, 1.45, 0.08, 0.14, trim, x, 1.26 + f * 3.2, fz + 0.06);
    }
  }
  if (o.canopy) box(g, Math.min(s.w, 8), 0.12, 2.2, white, 0, 3.0, fz + 1.1);
  return g;
}

/** A street-food cart (gerobak) with a glass display, wheels and a big umbrella. */
export function gerobak(color: string): Group {
  const g = new Group();
  const wood = pbr('wood_light', { tint: '#e8cfa8' });
  box(g, 1.6, 0.8, 0.7, wood, 0, 0.75, 0);
  box(g, 1.2, 0.45, 0.55, glass, -0.15, 1.38, 0);
  box(g, 1.7, 0.06, 0.8, wood, 0, 1.15, 0);
  for (const x of [-0.5, 0.5]) {
    const wheel = new Mesh(new CylinderGeometry(0.3, 0.3, 0.06, 16), iron);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.3, 0.38);
    g.add(wheel);
  }
  // Pot of soup (bakso / soto) on the side.
  const pot = new Mesh(new CylinderGeometry(0.18, 0.16, 0.3, 14), new MeshStandardMaterial({ color: '#b8bec4', metalness: 0.7, roughness: 0.3 }));
  pot.position.set(0.55, 1.33, 0);
  g.add(pot);
  // Umbrella.
  const pole = new Mesh(new CylinderGeometry(0.025, 0.025, 1.6, 8), iron);
  pole.position.set(0, 1.95, -0.25);
  g.add(pole);
  const top = new Mesh(new SphereGeometry(1.0, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.6), new MeshStandardMaterial({ color, roughness: 0.7, side: 2 }));
  top.scale.y = 0.45;
  top.position.set(0, 2.6, -0.25);
  g.add(top);
  return g;
}

/** Front for a place, or null for kinds drawn elsewhere (park, stop, ojol base, cart). */
export function facade(s: FacadeSpec): Group | null {
  switch (s.kind) {
    case 'home':
      return indoHouse({ w: s.w, d: s.d, h: s.h / 2, wall: s.color, floors: 2, terrace: false });
    case 'warung':
      return indoHouse({ w: s.w, d: s.d, h: s.h, wall: s.color, roof: 'seng', shop: true, terrace: false });
    case 'cafe':
      return block(s, { glassFront: true, floors: 1, band: '#5b3a29', canopy: true });
    case 'shop':
      return block(s, { glassFront: true, floors: 1, band: s.id === 'betamart' ? '#6c3483' : '#e67e22', canopy: true });
    case 'market':
      return indoHouse({ w: s.w, d: s.d, h: s.h, wall: s.color, roof: 'seng', shop: true, terrace: false });
    case 'mall':
      return block(s, { glassFront: true, floors: 3, band: '#2c3e50', canopy: true });
    case 'hospital':
      return block(s, { floors: 3, band: '#1e8449', canopy: true });
    case 'police':
      return block(s, { floors: 1, band: '#1b2631' });
    case 'station':
      return block(s, { floors: 1, band: '#7b241c', canopy: true });
    case 'clinic':
      return block(s, { floors: 1, band: '#2e86c1', canopy: true });
    case 'gym':
    case 'work':
    case 'worship':
      return block(s, {});
    default:
      return null;
  }
}
