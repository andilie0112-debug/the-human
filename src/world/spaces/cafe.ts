import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, SphereGeometry, type Material } from 'three';
import { pbr } from '../../engine/pbr';

// A neighbourhood coffee shop: a counter with an espresso machine and a chalk menu, tables with
// chairs, hanging lamps and plants. Seats are returned so people (and the player) can sit.

type Solid = (x0: number, z0: number, x1: number, z1: number) => void;

function box(g: Group, w: number, h: number, d: number, m: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

function menuTexture(lines: string[]): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = '#25302b';
  g.fillRect(0, 0, 512, 320);
  g.fillStyle = '#f5f0e1';
  g.font = 'bold 36px sans-serif';
  g.fillText('MENU', 24, 52);
  g.font = '26px sans-serif';
  lines.forEach((l, i) => g.fillText(l, 24, 104 + i * 44));
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export interface Seat {
  x: number;
  z: number;
  heading: number;
}

/** Builds the café; returns the seats (the first one is kept free for the player). */
export function addCafe(g: Group, W: number, D: number, solid: Solid, menu: string[]): Seat[] {
  const back = -D / 2;
  const wood = pbr('wood_light', { tint: '#8a6040' });
  const light = pbr('wood_light', { tint: '#e8d8c0' });
  const black = new MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.5, metalness: 0.4 });
  const steel = new MeshStandardMaterial({ color: '#c0c6cc', roughness: 0.25, metalness: 0.85 });
  // Counter along the back wall with the espresso machine, grinder, cups and a cake display.
  box(g, 5, 1.05, 0.8, wood, -2, 0.52, back + 1.6);
  box(g, 5.1, 0.05, 0.9, light, -2, 1.07, back + 1.6);
  solid(-4.5, back + 1.15, 0.5, back + 2.05);
  box(g, 0.9, 0.5, 0.5, steel, -3.2, 1.35, back + 1.5);
  box(g, 0.9, 0.08, 0.5, black, -3.2, 1.64, back + 1.5);
  box(g, 0.25, 0.45, 0.25, black, -2.3, 1.32, back + 1.5);
  for (let i = 0; i < 4; i++) {
    const cup = new Mesh(new CylinderGeometry(0.05, 0.04, 0.09, 10), new MeshStandardMaterial({ color: '#f5f5f0' }));
    cup.position.set(-1.7 + i * 0.14, 1.14, back + 1.35);
    g.add(cup);
  }
  box(g, 1.1, 0.45, 0.6, new MeshStandardMaterial({ color: '#dfeef2', transparent: true, opacity: 0.45, roughness: 0.05 }), -0.4, 1.32, back + 1.6);
  for (let i = 0; i < 3; i++) box(g, 0.25, 0.1, 0.25, new MeshStandardMaterial({ color: ['#a0522d', '#f5cba7', '#6e2c00'][i] }), -0.75 + i * 0.35, 1.16, back + 1.6);
  // Shelf with jars and the chalk menu on the wall.
  box(g, 3, 0.05, 0.3, light, -2.2, 2.0, back + 0.2);
  for (let i = 0; i < 6; i++) box(g, 0.18, 0.26, 0.18, new MeshStandardMaterial({ color: i % 2 ? '#6e4b2a' : '#3e2a18', transparent: true, opacity: 0.9 }), -3.4 + i * 0.45, 2.16, back + 0.2);
  const board = new Mesh(new PlaneGeometry(2.2, 1.4), new MeshStandardMaterial({ map: menuTexture(menu), roughness: 0.9 }));
  board.position.set(2.4, 2.1, back + 0.12);
  g.add(board);
  // Tables with two chairs each.
  const seats: Seat[] = [];
  const tables: [number, number][] = [[-3.2, 0.6], [0, 0.6], [3.2, 0.6], [-1.6, 3], [1.6, 3], [3.6, -1.6]];
  for (const [x, z] of tables) {
    const top = new Mesh(new CylinderGeometry(0.45, 0.45, 0.05, 20), light);
    top.position.set(x, 0.75, z);
    g.add(top);
    const leg = new Mesh(new CylinderGeometry(0.05, 0.05, 0.72, 8), black);
    leg.position.set(x, 0.37, z);
    g.add(leg);
    solid(x - 0.4, z - 0.4, x + 0.4, z + 0.4);
    for (const s of [-1, 1]) {
      // Chair facing the table; the seat centre is 0.65 m from the table centre.
      const cx = x + s * 0.68;
      box(g, 0.42, 0.05, 0.42, wood, cx, 0.46, z);
      box(g, 0.05, 0.45, 0.42, wood, cx + s * 0.2, 0.72, z);
      for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) box(g, 0.04, 0.44, 0.04, black, cx + dx, 0.22, z + dz);
      // Sitting: the body stands just in front of the seat, facing the table.
      seats.push({ x: cx - s * 0.32, z, heading: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
  }
  // Hanging lamps and plants.
  const bulb = new MeshStandardMaterial({ color: '#fff1c9', emissive: '#ffd27a', emissiveIntensity: 0.8 });
  for (const [x, z] of tables) {
    const cord = new Mesh(new CylinderGeometry(0.01, 0.01, 1.0, 4), black);
    cord.position.set(x, 2.9, z);
    g.add(cord);
    const shade = new Mesh(new CylinderGeometry(0.12, 0.25, 0.22, 16, 1, true), black);
    shade.position.set(x, 2.35, z);
    g.add(shade);
    const b = new Mesh(new SphereGeometry(0.08, 10, 8), bulb);
    b.position.set(x, 2.25, z);
    g.add(b);
  }
  const leaf = new MeshStandardMaterial({ color: '#3f7f3a', roughness: 0.8 });
  for (const [x, z] of [[-W / 2 + 0.6, D / 2 - 1], [W / 2 - 0.6, D / 2 - 1], [W / 2 - 0.6, back + 0.8]]) {
    const pot = new Mesh(new CylinderGeometry(0.25, 0.2, 0.45, 12), new MeshStandardMaterial({ color: '#b5651d' }));
    pot.position.set(x, 0.22, z);
    g.add(pot);
    const bush = new Mesh(new SphereGeometry(0.45, 12, 10), leaf);
    bush.position.set(x, 0.85, z);
    g.add(bush);
    solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
  }
  return seats;
}
