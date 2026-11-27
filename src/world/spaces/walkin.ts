import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, SphereGeometry, type Material } from 'three';
import { pbr } from '../../engine/pbr';
import type { HumanClip, HumanLook } from '../../characters/humanModel';
import type { CrowdOptions } from './crowd';

// Walk-in versions of everyday places, each with activity spots that run the place's own
// actions: the warung (eat at the bench), the traditional market (stalls, shop, job board),
// the gym (treadmill), the mall (shops, cinema, food court), the police station (SKCK counter)
// and the clinic (doctor). Our own designs; entrance at +z.

type Solid = (x0: number, z0: number, x1: number, z1: number) => void;

export type Pose = 'sit' | 'stand' | 'shop' | 'run' | 'browse' | 'lift' | 'stretch' | 'ride';

export interface Station {
  /** Zone id (also the label key suffix). */
  id: string;
  /** The place action this spot runs. */
  actionId: string;
  x: number;
  z: number;
  heading: number;
  pose: Pose;
  /** Order here, then carry a tray to this seat and eat there (food court). */
  seat?: { x: number; z: number; heading: number };
}

export interface WalkinLayout {
  W: number;
  D: number;
  floor: { texture: 'tiles_cream' | 'floor_tile' | 'concrete' | 'wood_light' | 'paving'; tint: string };
  wallTint: string;
  accent: string;
  stations: Station[];
  /** Workers at their posts (seller, trainer, officer...). */
  staff: { x: number; z: number; heading: number; look: Partial<HumanLook> }[];
  /** Where you arrive (default: the front door), and no way out at the front (upper floors). */
  spawn?: { x: number; z: number; heading: number };
  noExit?: boolean;
  /** People coming and going (shoppers). */
  crowd?: Omit<CrowdOptions, 'look'>;
  /** Other visitors: standing or sitting, with their spot. */
  visitors: { x: number; z: number; heading: number; sit: boolean; clip?: HumanClip }[];
}

function box(g: Group, w: number, h: number, d: number, m: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

function ball(g: Group, r: number, m: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new SphereGeometry(r, 8, 6), m);
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

function sign(text: string, bg: string, fg = '#ffffff', w = 512, h = 128): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `bold ${Math.round(h * 0.42)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function signBoard(g: Group, text: string, bg: string, x: number, y: number, z: number, w = 2.4, rotY = 0): void {
  const m = new Mesh(new PlaneGeometry(w, w / 4), new MeshStandardMaterial({ map: sign(text, bg), roughness: 0.7 }));
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  g.add(m);
}

const mat = (color: string, roughness = 0.7, metalness = 0): MeshStandardMaterial => new MeshStandardMaterial({ color, roughness, metalness });

/** Simple table with a bench on each long side; returns the sitting spots (facing the table). */
function benchTable(g: Group, solid: Solid, x: number, z: number, len: number, wood: Material): { x: number; z: number; heading: number }[] {
  box(g, len, 0.05, 0.7, wood, x, 0.74, z);
  for (const s of [-1, 1]) box(g, 0.06, 0.72, 0.6, wood, x + s * (len / 2 - 0.1), 0.37, z);
  const seats: { x: number; z: number; heading: number }[] = [];
  for (const s of [-1, 1]) {
    box(g, len, 0.05, 0.3, wood, x, 0.45, z + s * 0.62);
    box(g, 0.06, 0.44, 0.25, wood, x - len / 2 + 0.1, 0.22, z + s * 0.62);
    box(g, 0.06, 0.44, 0.25, wood, x + len / 2 - 0.1, 0.22, z + s * 0.62);
    for (let i = 0; i < Math.floor(len / 0.8); i++) seats.push({ x: x - len / 2 + 0.45 + i * 0.8, z: z + s * 0.3, heading: s > 0 ? Math.PI : 0 });
  }
  solid(x - len / 2, z - 0.4, x + len / 2, z + 0.4);
  return seats;
}

export function addWalkin(variant: string, g: Group, solid: Solid): WalkinLayout {
  const wood = pbr('wood_light', { tint: '#a8794e' });
  const steel = mat('#b8c0c7', 0.3, 0.7);
  const dark = mat('#2d2d33', 0.5);

  if (variant === 'warung') {
    const W = 9;
    const D = 8;
    const back = -D / 2;
    // Glass food display with dishes, rice cooker and the cook behind it.
    box(g, 3.4, 0.9, 0.7, wood, -1.6, 0.45, back + 1.4);
    box(g, 3.4, 0.6, 0.7, new MeshStandardMaterial({ color: '#e8f4f8', transparent: true, opacity: 0.35, roughness: 0.05 }), -1.6, 1.2, back + 1.4);
    const dishes = ['#c0392b', '#e67e22', '#27ae60', '#f4d03f', '#8e5a2b', '#d35400', '#ecf0f1', '#6e2c00'];
    dishes.forEach((c, i) => {
      box(g, 0.3, 0.04, 0.3, mat('#f5f5f0'), -3 + (i % 4) * 0.4 + 0.1, 0.95 + Math.floor(i / 4) * 0.28, back + 1.4);
      ball(g, 0.11, mat(c, 0.8), -3 + (i % 4) * 0.4 + 0.1, 1.0 + Math.floor(i / 4) * 0.28, back + 1.4).scale.y = 0.5;
    });
    solid(-3.3, back + 1.0, 0.1, back + 1.8);
    const cooker = new Mesh(new CylinderGeometry(0.2, 0.2, 0.3, 16), mat('#f2f2f2', 0.3));
    cooker.position.set(0.5, 1.05, back + 0.6);
    g.add(cooker);
    box(g, 1.6, 0.9, 0.6, wood, 1.0, 0.45, back + 0.6);
    // Kettle and glasses of iced tea, a calendar on the wall, a fan.
    for (let i = 0; i < 5; i++) {
      const glass = new Mesh(new CylinderGeometry(0.04, 0.035, 0.12, 8), new MeshStandardMaterial({ color: '#c0703a', transparent: true, opacity: 0.8 }));
      glass.position.set(0.5 + i * 0.12, 0.96, back + 0.75);
      g.add(glass);
    }
    signBoard(g, 'WARUNG MAKAN', '#b03a2e', 0, 2.5, back + 0.12, 3.2);
    const tables: { x: number; z: number; heading: number }[] = [];
    tables.push(...benchTable(g, solid, -1.8, 0.6, 2.4, wood));
    tables.push(...benchTable(g, solid, 2.0, 0.6, 2.4, wood));
    tables.push(...benchTable(g, solid, 0, 2.6, 2.4, wood));
    return {
      W, D,
      floor: { texture: 'tiles_cream', tint: '#e9e1d3' },
      wallTint: '#efe4cf',
      accent: '#b03a2e',
      stations: [
        { id: 'makan', actionId: 'eat_warung', ...tables[0], pose: 'sit' },
        { id: 'tanya', actionId: 'tanya_loker', x: -1.6, z: back + 2.3, heading: Math.PI, pose: 'stand' },
      ],
      staff: [{ x: -1.6, z: back + 0.6, heading: 0, look: { body: 'female', hijab: true, hijabColor: '#a93226', shirtColor: '#f5cba7', topStyle: 'kaos' } }],
      visitors: [tables[5], tables[8], tables[11]].filter(Boolean).map((s) => ({ ...s, sit: true })),
    };
  }

  if (variant === 'market') {
    const W = 16;
    const D = 13;
    const back = -D / 2;
    // Rows of stalls under tarps: vegetables, fruit, fish on ice, spices, eggs.
    const tarps = ['#2e86c1', '#e67e22', '#27ae60', '#c0392b'];
    const goods: [string, string[]][] = [
      ['SAYUR', ['#27ae60', '#52be80', '#e74c3c', '#f39c12']],
      ['BUAH', ['#f1c40f', '#e67e22', '#c0392b', '#8e44ad']],
      ['IKAN', ['#aab7b8', '#85929e', '#d5d8dc', '#aab7b8']],
      ['BUMBU', ['#a04000', '#d35400', '#f5b041', '#6e2c00']],
    ];
    const stalls: { x: number; z: number }[] = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const x = -5.4 + col * 3.6;
        const z = back + 2.0 + row * 4.4;
        const [label, colors] = goods[(col + row) % 4];
        box(g, 2.6, 0.85, 1.1, wood, x, 0.42, z);
        for (const s of [-1, 1]) box(g, 0.08, 2.3, 0.08, steel, x + s * 1.25, 1.15, z - 0.5);
        const tarp = box(g, 2.9, 0.06, 1.6, mat(tarps[(col + row * 2) % 4], 0.9), x, 2.35, z - 0.2);
        tarp.rotation.x = -0.12;
        for (let i = 0; i < 12; i++) ball(g, label === 'IKAN' ? 0.08 : 0.1, mat(colors[i % 4], 0.8), x - 1.0 + (i % 6) * 0.4, 0.95, z - 0.25 + Math.floor(i / 6) * 0.35).scale.set(label === 'IKAN' ? 2.2 : 1, label === 'IKAN' ? 0.5 : 1, 1);
        if (label === 'IKAN') box(g, 2.2, 0.05, 0.9, mat('#e8f6f8', 0.2), x, 0.87, z);
        signBoard(g, label, '#1c2833', x, 1.9, z + 0.52, 1.2);
        solid(x - 1.35, z - 0.6, x + 1.35, z + 0.6);
        stalls.push({ x, z });
      }
    }
    // Hanging scales and baskets, a job board on the side wall.
    for (const st of stalls.slice(0, 4)) ball(g, 0.12, steel, st.x + 0.9, 1.7, st.z - 0.3);
    box(g, 0.08, 1.2, 1.8, mat('#8e6e4e'), W / 2 - 0.15, 1.5, 0);
    box(g, 0.04, 1.0, 1.6, mat('#f4ecd8'), W / 2 - 0.2, 1.5, 0);
    for (let i = 0; i < 5; i++) box(g, 0.02, 0.22, 0.3, mat(['#fdfefe', '#f9e79f', '#d6eaf8'][i % 3]), W / 2 - 0.23, 1.3 + (i % 2) * 0.35, -0.6 + i * 0.3);
    return {
      W, D,
      floor: { texture: 'concrete', tint: '#a9a39a' },
      wallTint: '#d8d2c4',
      accent: '#1e8449',
      stations: [
        { id: 'belanja', actionId: 'shop_market', x: stalls[1].x, z: stalls[1].z + 1.2, heading: Math.PI, pose: 'shop' },
        { id: 'papan', actionId: 'papan_loker', x: W / 2 - 1.1, z: 0, heading: Math.PI / 2, pose: 'stand' },
        { id: 'tanya', actionId: 'tanya_loker', x: stalls[2].x, z: stalls[2].z + 1.2, heading: Math.PI, pose: 'stand' },
      ],
      staff: stalls.map((s, i) => ({ x: s.x, z: s.z - 1.0, heading: 0, look: { body: i % 2 ? 'female' : 'male', shirtColor: ['#f5cba7', '#aed6f1', '#f9e79f', '#d5f5e3'][i % 4], topStyle: 'kaos' } as Partial<HumanLook> })),
      visitors: [{ x: stalls[4].x + 0.5, z: stalls[4].z + 1.3, heading: Math.PI, sit: false }, { x: stalls[6].x - 0.4, z: stalls[6].z + 1.2, heading: Math.PI, sit: false }],
      crowd: {
        entrance: { x: 0, z: D / 2 - 0.4 },
        spots: [...stalls.slice(0, 4).map((st) => ({ x: st.x, z: st.z + 1.25 })), ...stalls.slice(4).map((st) => ({ x: st.x + 0.6, z: st.z + 1.25 }))],
        count: 10,
        luggage: 'tas',
        // Between the two rows of stalls through the middle gap.
        route: (from, to) => ((from.z > back + 4.2) !== (to.z > back + 4.2) ? [{ x: 0, z: from.z }, { x: 0, z: to.z }] : []),
      },
    };
  }

  if (variant === 'gym') {
    const W = 12;
    const D = 10;
    const back = -D / 2;
    // Treadmills facing the mirror wall, a bench press, dumbbell rack, mats.
    box(g, W - 1, 2.2, 0.05, new MeshStandardMaterial({ color: '#dfe9ef', roughness: 0.02, metalness: 0.9 }), 0, 1.4, back + 0.13);
    const treadmills: { x: number; z: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const x = -4 + i * 1.6;
      const z = back + 2.2;
      box(g, 0.8, 0.18, 1.7, dark, x, 0.09, z);
      box(g, 0.6, 0.02, 1.4, mat('#111111', 0.9), x, 0.19, z);
      for (const s of [-1, 1]) box(g, 0.05, 1.1, 0.05, steel, x + s * 0.36, 0.7, z - 0.75);
      box(g, 0.75, 0.3, 0.12, dark, x, 1.3, z - 0.78);
      treadmills.push({ x, z });
    }
    box(g, 1.4, 0.45, 0.4, dark, 3.2, 0.25, back + 2.4);
    box(g, 0.06, 1.3, 0.06, steel, 2.6, 0.9, back + 2.0);
    box(g, 0.06, 1.3, 0.06, steel, 3.8, 0.9, back + 2.0);
    const bar = new Mesh(new CylinderGeometry(0.03, 0.03, 2.0, 8), steel);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(3.2, 1.45, back + 2.0);
    g.add(bar);
    for (const s of [-1, 1]) {
      const plate = new Mesh(new CylinderGeometry(0.25, 0.25, 0.06, 16), dark);
      plate.rotation.z = Math.PI / 2;
      plate.position.set(3.2 + s * 0.85, 1.45, back + 2.0);
      g.add(plate);
    }
    solid(2.4, back + 1.7, 4.0, back + 2.7);
    box(g, 2.4, 0.9, 0.5, steel, W / 2 - 1.5, 0.45, 1.5);
    for (let i = 0; i < 8; i++) box(g, 0.25, 0.1, 0.1, dark, W / 2 - 2.5 + (i % 4) * 0.6, 0.95 + Math.floor(i / 4) * 0.2, 1.5);
    solid(W / 2 - 2.8, 1.2, W / 2 - 0.2, 1.8);
    for (let i = 0; i < 3; i++) box(g, 0.8, 0.02, 1.8, mat('#1e8449', 0.9), -3 + i * 1.3, 0.01, 2.2);
    signBoard(g, 'FITNESS', '#e74c3c', 0, 3.0, back + 0.15, 2.4);
    for (const t of treadmills) solid(t.x - 0.45, t.z - 0.9, t.x + 0.45, t.z - 0.6);
    return {
      W, D,
      floor: { texture: 'concrete', tint: '#4d5156' },
      wallTint: '#e5e8eb',
      accent: '#e74c3c',
      // Every machine can be used: treadmill, the dumbbell rack, the mats; others are training too.
      stations: [
        { id: 'latihan', actionId: 'gym_workout', x: treadmills[0].x, z: treadmills[0].z + 0.1, heading: Math.PI, pose: 'run' },
        { id: 'beban', actionId: 'gym_workout', x: W / 2 - 2.0, z: 2.4, heading: Math.PI, pose: 'lift' },
        { id: 'matras', actionId: 'gym_workout', x: -3, z: 2.2, heading: Math.PI, pose: 'stretch' },
        { id: 'bench', actionId: 'gym_workout', x: 3.2, z: back + 2.95, heading: Math.PI, pose: 'sit' },
      ],
      staff: [{ x: 4.5, z: 3, heading: -2.4, look: { shirtColor: '#e74c3c', topStyle: 'polo', pantsColor: '#1c1c1c', shoeStyle: 'sneakers' } }],
      visitors: [
        { x: treadmills[1].x, z: treadmills[1].z + 0.1, heading: Math.PI, sit: false, clip: 'Jog_Fwd_Loop' },
        { x: treadmills[2].x, z: treadmills[2].z + 0.1, heading: Math.PI, sit: false, clip: 'Jog_Fwd_Loop' },
        { x: -1.7, z: 2.2, heading: Math.PI, sit: false, clip: 'Fixing_Kneeling' },
        { x: W / 2 - 3.0, z: 2.5, heading: Math.PI, sit: false, clip: 'PickUp_Table' },
        { x: 0.2, z: 3.4, heading: 2.5, sit: false, clip: 'Idle_Talking_Loop' },
      ],
    };
  }

  if (variant === 'mall') {
    const W = 20;
    const D = 15;
    const back = -D / 2;
    // Shop fronts with glass and mannequins, a cinema entrance with posters, escalator, food court.
    const shops: [string, string][] = [['BUSANA', '#8e44ad'], ['SEPATU', '#2471a3'], ['GADGET', '#1c2833'], ['BIOSKOP', '#922b21']];
    shops.forEach(([label, color], i) => {
      const x = -7.5 + i * 5;
      box(g, 4.4, 3.2, 0.1, new MeshStandardMaterial({ color: '#dfeef2', transparent: true, opacity: 0.3, roughness: 0.05 }), x, 1.6, back + 2.5);
      box(g, 4.6, 0.6, 0.2, mat(color, 0.5), x, 3.5, back + 2.5);
      signBoard(g, label, color, x, 3.5, back + 2.62, 2.4);
      solid(x - 2.2, back + 2.4, x + 2.2, back + 2.6);
      if (label === 'BIOSKOP') {
        for (const px of [-1.2, 0, 1.2]) box(g, 0.9, 1.3, 0.03, mat(['#1a5276', '#7d3c98', '#b9770e'][Math.round(px + 1.2) % 3], 0.4), x + px, 1.8, back + 2.56);
      } else {
        for (const px of [-1.2, 1.2]) {
          ball(g, 0.12, mat('#f2f2f2'), x + px, 1.75, back + 1.9);
          box(g, 0.35, 0.6, 0.2, mat(color, 0.6), x + px, 1.3, back + 1.9);
          box(g, 0.25, 0.7, 0.15, mat('#2c3e50'), x + px, 0.65, back + 1.9);
        }
      }
    });
    // Escalator to the upper floor.
    const esc = box(g, 1.2, 0.2, 6, steel, W / 2 - 1.5, 1.6, 1);
    esc.rotation.x = 0.5;
    for (const s of [-1, 1]) {
      const rail = box(g, 0.08, 0.9, 6, dark, W / 2 - 1.5 + s * 0.62, 2.1, 1);
      rail.rotation.x = 0.5;
    }
    solid(W / 2 - 2.2, -2, W / 2 - 0.8, 4);
    // Food court tables.
    const seats: { x: number; z: number; heading: number }[] = [];
    for (const [x, z] of [[-6, 3], [-3, 3], [0, 3.5]] as const) seats.push(...benchTable(g, solid, x, z, 1.6, wood));
    // Plants and benches in the middle.
    for (const x of [-4, 4]) {
      const pot = new Mesh(new CylinderGeometry(0.5, 0.45, 0.6, 16), mat('#f2f2f2', 0.3));
      pot.position.set(x, 0.3, -0.5);
      g.add(pot);
      ball(g, 0.7, mat('#3f7f3a', 0.8), x, 1.2, -0.5).scale.y = 1.3;
      solid(x - 0.55, -1.05, x + 0.55, 0.05);
    }
    return {
      W, D,
      floor: { texture: 'tiles_cream', tint: '#f4f1ea' },
      wallTint: '#efece6',
      accent: '#5b2c6f',
      stations: [
        { id: 'jalan', actionId: 'mall_walk', x: -2.5, z: back + 3.6, heading: Math.PI, pose: 'browse' },
        { id: 'baju', actionId: 'mall_clothes', x: -7.5, z: back + 3.4, heading: Math.PI, pose: 'shop' },
        { id: 'bioskop', actionId: 'mall_cinema', x: 7.5, z: back + 3.4, heading: Math.PI, pose: 'stand' },
        { id: 'tanya', actionId: 'tanya_loker', x: 2.5, z: back + 3.4, heading: Math.PI, pose: 'stand' },
        { id: 'duduk', actionId: 'mall_rest', x: -6.6, z: 2.7, heading: 0, pose: 'sit' },
        { id: 'naik', actionId: 'escalator', x: W / 2 - 1.5, z: 4.6, heading: Math.PI, pose: 'ride' },
      ],
      crowd: {
        entrance: { x: 0, z: D / 2 - 0.4 },
        spots: [{ x: -7.5, z: back + 3.8 }, { x: -2.5, z: back + 3.8 }, { x: 2.5, z: back + 3.8 }, { x: 7.5, z: back + 3.8 }, { x: 0, z: 1 }, { x: -2, z: 5.6 }, { x: 2, z: 1.5 }, { x: W / 2 - 1.5, z: 4.8 }],
        count: 12,
        luggage: 'tas',
      },
      staff: [{ x: -7.5, z: back + 1.4, heading: 0, look: { shirtColor: '#1c1c1c', topStyle: 'kemeja', pantsColor: '#1c1c1c', shoeStyle: 'pantofel' } }, { x: 7.5, z: back + 1.4, heading: 0, look: { shirtColor: '#922b21', topStyle: 'polo' } }],
      visitors: [{ ...seats[1], sit: true }, { ...seats[4], sit: true }, { ...seats[6], sit: true }, { ...seats[9], sit: true }],
    };
  }

  if (variant === 'mall2') {
    // The upper floor: food court, game corner and the way back down.
    const W = 20;
    const D = 15;
    const back = -D / 2;
    const counters = [['BAKSO', '#c0392b'], ['NASI', '#d35400'], ['KOPI', '#6e2c00'], ['BOBA', '#8e44ad']] as const;
    counters.forEach(([label, color], i) => {
      const x = -7.5 + i * 5;
      box(g, 3.6, 1.05, 0.7, mat('#f4f1ea', 0.4), x, 0.52, back + 1.6);
      box(g, 3.8, 0.5, 0.2, mat(color, 0.5), x, 2.6, back + 0.3);
      signBoard(g, label, color, x, 2.6, back + 0.42, 2);
      solid(x - 1.8, back + 1.2, x + 1.8, back + 2.0);
    });
    const seats: { x: number; z: number; heading: number }[] = [];
    for (const [x, z] of [[-6, 0], [-2, 0], [2, 0], [-6, 3], [-2, 3], [2, 3]] as const) seats.push(...benchTable(g, solid, x, z, 1.6, wood));
    // Railing along the void and the escalator coming up.
    box(g, 0.06, 1.0, 10, mat('#bdc3c7', 0.3, 0.7), W / 2 - 3.2, 0.5, 0.5);
    const esc = box(g, 1.2, 0.2, 4, steel, W / 2 - 1.5, -0.9, 3.5);
    esc.rotation.x = 0.5;
    solid(W / 2 - 3.25, -4.5, W / 2 - 3.15, 5.5);
    return {
      W, D,
      floor: { texture: 'tiles_cream', tint: '#efe9df' },
      wallTint: '#efece6',
      accent: '#5b2c6f',
      spawn: { x: W / 2 - 1.5, z: 2.0, heading: Math.PI },
      noExit: true,
      stations: [
        { id: 'duduk', actionId: 'mall_rest', ...seats[0], pose: 'sit' },
        { id: 'makan', actionId: 'mall_food', x: -7.5, z: back + 2.6, heading: Math.PI, pose: 'stand', seat: seats[3] },
        { id: 'tanya', actionId: 'tanya_loker', x: 2.5, z: back + 2.6, heading: Math.PI, pose: 'stand' },
        { id: 'turun', actionId: 'escalator', x: W / 2 - 1.5, z: 1.2, heading: 0, pose: 'ride' },
      ],
      staff: counters.map((_, i) => ({ x: -7.5 + i * 5, z: back + 0.9, heading: 0, look: { shirtColor: '#fdfefe', topStyle: 'polo', pantsColor: '#1c1c1c' } as Partial<HumanLook> })),
      visitors: [seats[2], seats[5], seats[7], seats[10], seats[13], seats[16]].filter(Boolean).map((st) => ({ ...st, sit: true })),
      crowd: {
        entrance: { x: W / 2 - 1.5, z: 1.2 },
        spots: [{ x: -7.5, z: back + 2.6 }, { x: -2.5, z: back + 2.6 }, { x: 2.5, z: back + 2.6 }, { x: 0, z: 1.5 }, { x: -4, z: 4.8 }, { x: 2, z: 5.2 }],
        count: 8,
        luggage: 'tas',
      },
    };
  }

  if (variant === 'police') {
    const W = 12;
    const D = 10;
    const back = -D / 2;
    box(g, 6, 1.05, 0.7, mat('#5d6d7e', 0.5), -1, 0.52, back + 2);
    box(g, 6.1, 0.05, 0.8, mat('#d5d8dc', 0.4), -1, 1.07, back + 2);
    solid(-4, back + 1.6, 2, back + 2.4);
    signBoard(g, 'PELAYANAN SKCK', '#1b2631', -1, 2.6, back + 0.12, 3.6);
    // Flag on a pole, notice board, waiting chairs.
    box(g, 0.05, 2.6, 0.05, steel, W / 2 - 1, 1.3, back + 0.6);
    box(g, 0.9, 0.3, 0.02, mat('#e74c3c', 0.8), W / 2 - 0.53, 2.38, back + 0.6);
    box(g, 0.9, 0.3, 0.02, mat('#ffffff', 0.8), W / 2 - 0.53, 2.08, back + 0.6);
    box(g, 2.0, 1.2, 0.05, mat('#8e6e4e'), -W / 2 + 0.15, 1.6, 0).rotation.y = Math.PI / 2;
    const seat = mat('#2e86c1', 0.5);
    for (let i = 0; i < 6; i++) {
      box(g, 0.5, 0.08, 0.5, seat, -2.5 + i * 0.6, 0.45, 1.5);
      box(g, 0.5, 0.5, 0.06, seat, -2.5 + i * 0.6, 0.72, 1.25);
    }
    solid(-2.8, 1.2, 1.0, 1.8);
    return {
      W, D,
      floor: { texture: 'floor_tile', tint: '#e6e8ea' },
      wallTint: '#eef0f2',
      accent: '#1b2631',
      stations: [{ id: 'skck', actionId: 'skck', x: -1, z: back + 2.75, heading: Math.PI, pose: 'stand' }],
      staff: [{ x: -1, z: back + 1.3, heading: 0, look: { shirtColor: '#7e5c3a', topStyle: 'kemeja', pantsColor: '#5a4128', shoeStyle: 'pantofel' } }, { x: -3, z: back + 1.3, heading: 0, look: { shirtColor: '#7e5c3a', topStyle: 'kemeja', pantsColor: '#5a4128', shoeStyle: 'pantofel', body: 'female', hijab: true, hijabColor: '#5a4128' } }],
      visitors: [{ x: -1.3, z: 1.75, heading: 0, sit: true }],
    };
  }

  if (variant === 'work_office') {
    // Open-plan office: rows of desks with monitors, a meeting room behind glass, a pantry corner.
    const W = 14;
    const D = 11;
    const back = -D / 2;
    const deskTop = mat('#f2efe8', 0.5);
    const screen = new MeshStandardMaterial({ color: '#1b2631', emissive: '#5dade2', emissiveIntensity: 0.35, roughness: 0.3 });
    const chair = mat('#2c3e50', 0.6);
    const seats: { x: number; z: number; heading: number }[] = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const x = -5 + col * 2.2;
        const z = back + 3.2 + row * 3;
        box(g, 1.5, 0.05, 0.75, deskTop, x, 0.75, z);
        box(g, 1.5, 0.72, 0.04, mat('#bfc5ca'), x, 0.37, z - 0.36);
        box(g, 0.6, 0.38, 0.03, screen, x, 1.02, z - 0.2);
        box(g, 0.05, 0.2, 0.05, dark, x, 0.85, z - 0.22);
        box(g, 0.45, 0.02, 0.15, dark, x, 0.78, z + 0.05);
        box(g, 0.04, 0.45, 0.8, mat('#7f8c8d', 0.6), x + 0.77, 1.0, z);
        // Office chair facing the desk; the sitter stands just in front of the seat.
        box(g, 0.48, 0.06, 0.48, chair, x, 0.47, z + 0.62);
        box(g, 0.48, 0.5, 0.06, chair, x, 0.76, z + 0.86);
        solid(x - 0.75, z - 0.4, x + 0.8, z + 0.4);
        seats.push({ x, z: z + 0.3, heading: Math.PI });
      }
    }
    // Meeting room with a glass wall, whiteboard and table.
    box(g, 0.06, 2.6, 4, new MeshStandardMaterial({ color: '#d6eaf8', transparent: true, opacity: 0.35, roughness: 0.05 }), W / 2 - 3.6, 1.3, back + 2.2);
    box(g, 2.2, 0.05, 1.1, wood, W / 2 - 1.8, 0.75, back + 2.2);
    box(g, 2.4, 1.1, 0.03, mat('#fdfefe', 0.3), W / 2 - 1.8, 1.6, back + 0.15);
    solid(W / 2 - 3.65, back, W / 2 - 3.55, back + 4.2);
    // Pantry: counter with a water dispenser and coffee maker; plants.
    box(g, 2.2, 0.9, 0.6, wood, -W / 2 + 1.4, 0.45, D / 2 - 2.5);
    box(g, 0.35, 1.2, 0.35, mat('#ecf0f1', 0.4), -W / 2 + 0.5, 0.6, D / 2 - 3.5);
    ball(g, 0.18, mat('#5dade2', 0.1), -W / 2 + 0.5, 1.35, D / 2 - 3.5);
    solid(-W / 2, D / 2 - 3.8, -W / 2 + 2.5, D / 2 - 2.2);
    signBoard(g, 'KANTOR', '#1f3a68', 0, 2.8, back + 0.12, 2.4);
    return {
      W, D,
      floor: { texture: 'floor_tile', tint: '#d9dde0' },
      wallTint: '#eef0f2',
      accent: '#1f3a68',
      stations: [{ id: 'kerja', actionId: 'go_work', ...seats[1], pose: 'sit' }],
      staff: [],
      visitors: [seats[0], seats[2], seats[5], seats[6]].map((st) => ({ ...st, sit: true })),
    };
  }

  if (variant === 'work_factory') {
    // Production hall: a conveyor line with boxes, machines, shelves of parts, safety lines.
    const W = 18;
    const D = 13;
    const back = -D / 2;
    box(g, 12, 0.85, 1.0, steel, 0, 0.42, back + 4);
    box(g, 12, 0.04, 0.8, mat('#1c1c1c', 0.9), 0, 0.87, back + 4);
    solid(-6, back + 3.5, 6, back + 4.5);
    for (let i = 0; i < 6; i++) box(g, 0.4, 0.3, 0.4, mat('#c9a36b', 0.9), -5 + i * 2, 1.04, back + 4);
    for (const x of [-7.5, 7.5]) {
      box(g, 2, 2.2, 1.6, mat('#2e86c1', 0.5, 0.3), x, 1.1, back + 4);
      box(g, 0.6, 0.4, 0.05, mat('#58d68d', 0.2), x, 1.6, back + 4.82);
      solid(x - 1, back + 3.2, x + 1, back + 4.8);
    }
    for (let i = 0; i < 3; i++) {
      box(g, 3, 0.05, 0.8, steel, -6 + i * 4, 1.0, back + 0.6);
      box(g, 3, 0.05, 0.8, steel, -6 + i * 4, 2.0, back + 0.6);
      for (let k = 0; k < 4; k++) box(g, 0.5, 0.4, 0.5, mat(['#c9a36b', '#5d6d7e', '#a04000'][k % 3], 0.8), -7 + i * 4 + k * 0.7, 1.25, back + 0.6);
    }
    solid(-7.6, back + 0.1, 4.6, back + 1.1);
    const yellow = mat('#f1c40f', 0.6);
    for (const z of [back + 2.6, back + 5.4]) box(g, 14, 0.02, 0.12, yellow, 0, 0.01, z);
    signBoard(g, 'AREA PRODUKSI · WAJIB HELM', '#b03a2e', 0, 3.2, back + 0.12, 4.4);
    const line = [-4, -1, 2, 5].map((x) => ({ x, z: back + 5.0, heading: Math.PI }));
    return {
      W, D,
      floor: { texture: 'concrete', tint: '#8e9196' },
      wallTint: '#cfd3d6',
      accent: '#b03a2e',
      stations: [{ id: 'kerja', actionId: 'go_work', ...line[1], pose: 'shop' }],
      staff: [{ x: 6, z: 1.5, heading: -2.2, look: { shirtColor: '#f4f6f7', topStyle: 'kemeja', pantsColor: '#1c1c1c' } }],
      visitors: [line[0], line[2], line[3]].map((st) => ({ ...st, sit: false, clip: 'Interact' as const })),
    };
  }

  if (variant === 'work_counter') {
    // Service counter (shop, café, hotel lobby): register, shelves, customers in line.
    const W = 12;
    const D = 10;
    const back = -D / 2;
    box(g, 5, 1.05, 0.7, wood, 0, 0.52, back + 2.4);
    box(g, 5.1, 0.05, 0.8, mat('#ecf0f1', 0.3), 0, 1.07, back + 2.4);
    box(g, 0.45, 0.25, 0.35, dark, -0.8, 1.22, back + 2.4);
    box(g, 0.3, 0.2, 0.03, new MeshStandardMaterial({ color: '#1b2631', emissive: '#58d68d', emissiveIntensity: 0.4 }), -0.8, 1.45, back + 2.28);
    solid(-2.5, back + 2.0, 2.5, back + 2.8);
    for (let i = 0; i < 3; i++) {
      box(g, 3.6, 0.05, 0.4, wood, 0, 1.0 + i * 0.6, back + 0.3);
      for (let k = 0; k < 8; k++) box(g, 0.25, 0.35, 0.25, mat(['#e74c3c', '#f4d03f', '#27ae60', '#2e86c1'][(k + i) % 4], 0.6), -1.6 + k * 0.45, 1.2 + i * 0.6, back + 0.3);
    }
    signBoard(g, 'SELAMAT DATANG', '#117a65', 0, 2.9, back + 0.12, 3.2);
    return {
      W, D,
      floor: { texture: 'tiles_cream', tint: '#f2eee6' },
      wallTint: '#f4efe6',
      accent: '#117a65',
      stations: [{ id: 'kerja', actionId: 'go_work', x: -0.8, z: back + 1.6, heading: 0, pose: 'stand' }],
      staff: [],
      visitors: [{ x: -0.6, z: back + 3.4, heading: Math.PI, sit: false }, { x: -0.3, z: back + 4.4, heading: Math.PI, sit: false }, { x: 0.1, z: back + 5.3, heading: Math.PI, sit: false }],
    };
  }

  // Clinic: reception, a few waiting chairs, the doctor's desk behind a screen.
  const W = 11;
  const D = 9;
  const back = -D / 2;
  box(g, 3, 1.05, 0.7, mat('#f3efe8', 0.5), -3, 0.52, 1.6);
  solid(-4.5, 1.2, -1.5, 2);
  signBoard(g, 'KLINIK PRATAMA', '#1e8449', 0, 2.6, back + 0.12, 3.2);
  box(g, 0.1, 2, 3, mat('#d6eaf8', 0.6), 1.0, 1, back + 1.6);
  solid(0.9, back, 1.1, back + 3.1);
  box(g, 1.4, 0.75, 0.7, wood, 3.2, 0.38, back + 1.4);
  box(g, 0.9, 0.6, 1.8, mat('#d6eaf8', 0.7), 4.6, 0.5, back + 2.2);
  box(g, 0.42, 0.46, 0.42, mat('#5d6d7e', 0.5), 3.2, 0.23, back + 2.6); // patient's stool
  solid(2.4, back + 0.9, 5.4, back + 3.2);
  const seat = mat('#48c9b0', 0.5);
  for (let i = 0; i < 5; i++) {
    box(g, 0.5, 0.08, 0.5, seat, -3.5 + i * 0.6, 0.45, -0.6);
    box(g, 0.5, 0.5, 0.06, seat, -3.5 + i * 0.6, 0.72, -0.85);
  }
  solid(-3.8, -0.95, -0.7, -0.3);
  return {
    W, D,
    floor: { texture: 'floor_tile', tint: '#f4f7f6' },
    wallTint: '#eef5f1',
    accent: '#1e8449',
    stations: [{ id: 'dokter', actionId: 'see_doctor', x: 3.2, z: back + 2.2, heading: Math.PI, pose: 'sit' }],
    staff: [{ x: -3, z: 2.3, heading: Math.PI, look: { body: 'female', hijab: true, hijabColor: '#e8f4f8', shirtColor: '#e8f4f8', topStyle: 'kemeja' } }, { x: 3.2, z: back + 0.7, heading: 0, look: { shirtColor: '#ffffff', topStyle: 'jaket', glasses: 'kotak' } }],
    visitors: [{ x: -2.9, z: -0.18, heading: 0, sit: true }],
  };
}
