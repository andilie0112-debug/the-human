import { BoxGeometry, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PlaneGeometry, Scene, type Material } from 'three';
import { pbr } from '../../engine/pbr';
import { addProp } from '../../engine/props';
import { mergeStatic } from '../../home/mergeStatic';
import { HAIRSTYLES, HUMAN_SKIN_TONES, HumanModel } from '../../characters/humanModel';
import type { InteriorSpace, Zone } from '../interior';
import type { Box2 } from '../neighborhood';

// Inside a minimarket: entrance with automatic glass doors and a security gate, three gondola
// shelves (A-C), a drinks cooler along the back (D), the cashier counter with the register and
// a cashier in the brand's uniform. Local space: entrance at +z, 12 x 10 m.

export interface StoreSpace extends InteriorSpace {
  cashier: HumanModel | null;
  /** Fires once the cashier model has loaded (for greeting with a voice). */
  onCashier: ((m: HumanModel) => void) | null;
}

export const SHELVES: { id: string; label: string; category: string }[] = [
  { id: 'A', label: 'Rak A · Bahan masak', category: 'bahan' },
  { id: 'B', label: 'Rak B · Siap makan', category: 'siapMakan' },
  { id: 'C', label: 'Rak C · Camilan', category: 'camilan' },
  { id: 'D', label: 'Kulkas D · Minuman', category: 'minuman' },
];

function box(g: Group, w: number, h: number, d: number, m: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

export function buildMinimarket(brandColor: string, itemColors: Record<string, string[]>): StoreSpace {
  const scene = new Scene();
  scene.background = new Color('#2b2f35');
  scene.add(new HemisphereLight('#ffffff', '#b8b2a6', 1.7));
  const sun = new DirectionalLight('#ffffff', 1.2);
  sun.position.set(3, 8, 5);
  scene.add(sun);
  const W = 12;
  const D = 10;
  const g = new Group();
  scene.add(g);
  const colliders: Box2[] = [];
  const solid = (x0: number, z0: number, x1: number, z1: number): void => {
    colliders.push({ x0, z0, x1, z1 });
  };

  // Floor, walls, a brand-coloured band along the top.
  const floor = new Mesh(new PlaneGeometry(W, D), pbr('floor_tile', { repeat: [W / 1.2, D / 1.2], tint: '#ffffff', roughness: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);
  const wall = pbr('plaster', { tint: '#f6f4ef', repeat: [4, 2], normalScale: 0.2 });
  const band = new MeshStandardMaterial({ color: brandColor, roughness: 0.5 });
  box(g, W, 3, 0.2, wall, 0, 1.5, -D / 2);
  box(g, 0.2, 3, D, wall, -W / 2, 1.5, 0);
  box(g, 0.2, 3, D, wall, W / 2, 1.5, 0);
  box(g, W, 0.4, 0.22, band, 0, 2.8, -D / 2 + 0.02);
  // Front: glass wall with the entrance on the left.
  const glass = new MeshStandardMaterial({ color: '#a9c4cf', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35 });
  box(g, W / 2 + 0.6, 2.6, 0.06, glass, 2.8, 1.3, D / 2);
  box(g, 2.2, 2.6, 0.06, glass, -4.9, 1.3, D / 2);
  box(g, W, 0.35, 0.25, band, 0, 2.75, D / 2);
  solid(-W / 2, -D / 2 - 0.3, W / 2, -D / 2 + 0.1);
  solid(-W / 2 - 0.3, -D / 2, -W / 2 + 0.1, D / 2);
  solid(W / 2 - 0.1, -D / 2, W / 2 + 0.3, D / 2);
  solid(-0.5, D / 2 - 0.1, W / 2, D / 2 + 0.3);
  solid(-W / 2, D / 2 - 0.1, -3.8, D / 2 + 0.3);
  // Automatic sliding doors (they open as you come near) and the security gate posts.
  const doorL = box(g, 1.15, 2.4, 0.05, glass, -3.25, 1.2, D / 2);
  const doorR = box(g, 1.15, 2.4, 0.05, glass, -2.1, 1.2, D / 2);
  const gateMat = new MeshStandardMaterial({ color: '#cfd4d8', roughness: 0.3, metalness: 0.5 });
  for (const x of [-3.6, -1.7]) {
    box(g, 0.12, 1.4, 0.4, gateMat, x, 0.7, D / 2 - 0.6);
    solid(x - 0.1, D / 2 - 0.8, x + 0.1, D / 2 - 0.4);
  }

  // Gondola shelves A-C, filled with products on both sides.
  const shelfMat = new MeshStandardMaterial({ color: '#dfe3e6', roughness: 0.4, metalness: 0.3 });
  const productMats = new Map<string, MeshStandardMaterial>();
  const product = (c: string): MeshStandardMaterial => {
    let m = productMats.get(c);
    if (!m) {
      m = new MeshStandardMaterial({ color: c, roughness: 0.55 });
      productMats.set(c, m);
    }
    return m;
  };
  const rackX = [-3.6, -0.4, 2.8];
  SHELVES.slice(0, 3).forEach((s, i) => {
    const x = rackX[i];
    box(g, 0.9, 1.7, 5.2, shelfMat, x, 0.85, -1);
    solid(x - 0.5, -3.65, x + 0.5, 1.65);
    const colors = itemColors[s.category] ?? ['#c0392b'];
    for (const side of [-1, 1]) {
      for (let level = 0; level < 4; level++) {
        box(g, 0.06, 0.03, 5.1, shelfMat, x + side * 0.48, 0.25 + level * 0.42, -1);
        for (let k = 0; k < 16; k++) {
          const c = colors[(k + level * 3 + (side > 0 ? 1 : 0)) % colors.length];
          const h = 0.18 + ((k * 7 + level) % 4) * 0.04;
          box(g, 0.18, h, 0.26, product(c), x + side * 0.55, 0.28 + level * 0.42 + h / 2, -3.4 + k * 0.31);
        }
      }
    }
    // Hanging aisle sign.
    box(g, 1.2, 0.35, 0.04, band, x, 2.35, -1);
  });
  // Cooler D along the back wall: glass doors with drinks.
  const cooler = new MeshStandardMaterial({ color: '#e9ecee', roughness: 0.4 });
  box(g, W - 1.4, 2.2, 0.8, cooler, 0, 1.1, -D / 2 + 0.55);
  solid(-W / 2 + 0.7, -D / 2, W / 2 - 0.7, -D / 2 + 1.0);
  const drinks = itemColors.minuman ?? ['#9fd3f0'];
  for (let level = 0; level < 4; level++) {
    for (let k = 0; k < 30; k++) {
      const c = drinks[(k + level) % drinks.length];
      box(g, 0.12, 0.26, 0.12, product(c), -W / 2 + 1.0 + k * 0.34, 0.35 + level * 0.48, -D / 2 + 0.98);
    }
  }
  box(g, W - 1.4, 2.0, 0.03, glass, 0, 1.15, -D / 2 + 1.06);
  box(g, W - 1.4, 0.3, 0.06, band, 0, 2.3, -D / 2 + 1.06);

  // Cashier counter with a register, cigarettes and snacks behind.
  const counterMat = pbr('wood_light', { tint: '#f3efe8' });
  box(g, 3.4, 1.0, 0.75, counterMat, 3.4, 0.5, 2.9);
  box(g, 3.5, 0.05, 0.85, new MeshStandardMaterial({ color: '#4a4d52', roughness: 0.3 }), 3.4, 1.02, 2.9);
  solid(1.7, 2.5, 5.1, 3.3);
  box(g, 3.2, 1.6, 0.35, shelfMat, 3.4, 1.4, 1.35);
  for (let k = 0; k < 18; k++) box(g, 0.14, 0.1, 0.06, product(['#c0392b', '#f4f1e8', '#2e86c1', '#f2c14e'][k % 4]), 2.0 + (k % 9) * 0.33, 1.0 + Math.floor(k / 9) * 0.3, 1.55);
  const register = addProp(g, 'CashRegister_01', { x: 3.9, y: 1.05, z: 2.85, rot: 180, size: [null, 0.32, null] });
  void register;
  mergeStatic(g);

  const zones: Zone[] = [
    { id: 'A', label: `🛒 ${SHELVES[0].label}`, x: -2.0, z: -1, r: 1.5 },
    { id: 'B', label: `🛒 ${SHELVES[1].label}`, x: 1.2, z: -1, r: 1.4 },
    { id: 'C', label: `🛒 ${SHELVES[2].label}`, x: 4.4, z: -1, r: 1.5 },
    { id: 'D', label: `🧊 ${SHELVES[3].label}`, x: 0, z: -3.6, r: 2.6 },
    { id: 'kasir', label: '💳 Bayar di kasir', x: 3.4, z: 3.9, r: 1.3 },
    { id: 'exit', label: '🚪 Keluar', x: -2.7, z: 4.7, r: 0.8 },
  ];

  const space: StoreSpace = {
    scene,
    colliders,
    bounds: { x0: -W / 2 + 0.3, z0: -D / 2 + 0.3, x1: W / 2 - 0.3, z1: D / 2 + 0.5 },
    zones,
    spawn: { x: -2.7, z: 3.2, heading: Math.PI },
    cashier: null,
    onCashier: null,
    update: (dt, me) => {
      // Sliding doors.
      const open = Math.hypot(me.x + 2.7, me.z - D / 2) < 2.2 ? 1 : 0;
      doorL.position.x += (-3.25 - open * 1.0 - doorL.position.x) * Math.min(1, dt * 6);
      doorR.position.x += (-2.1 + open * 1.0 - doorR.position.x) * Math.min(1, dt * 6);
      space.cashier?.update(dt);
    },
    dispose: () => {
      space.cashier?.dispose();
      scene.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    },
  };
  // The cashier, in the brand's uniform colour, behind the counter facing the customers.
  const female = Math.random() < 0.6;
  void HumanModel.load({
    body: female ? 'female' : 'male',
    skinTone: HUMAN_SKIN_TONES[1 + Math.floor(Math.random() * 3)],
    hair: HAIRSTYLES[female ? 'female' : 'male'][0],
    hairColor: '#1a1310',
    hijab: female && Math.random() < 0.6,
    hijabColor: '#2d2d33',
    shirtColor: brandColor,
    topStyle: 'polo',
    pantsColor: '#2d2d33',
    shoesColor: '#222222',
    shoeStyle: 'pantofel',
  }).then((m) => {
    m.root.userData.body = female ? 'female' : 'male';
    m.root.position.set(3.4, 0, 2.15);
    m.root.rotation.y = 0;
    m.play('Idle_Loop', 0);
    scene.add(m.root);
    space.cashier = m;
    space.onCashier?.(m);
  });
  return space;
}
