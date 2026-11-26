import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, type Material } from 'three';
import { pbr } from '../../engine/pbr';

// Inside the six houses of worship, each with its own features and equal care:
//   masjid: prayer carpet with rows, mihrab niche, mimbar, wudhu taps
//   gereja (Kristen): pews, altar, plain cross, pulpit
//   gereja Katolik: pews, altar with candles, crucifix, statue niche, coloured windows
//   pura: stone courtyard, split gate (candi bentar), padmasana shrine, umbrellas, offerings
//   vihara: seated Buddha figure on a lotus, candles, flowers, cushions
//   klenteng: red pillars, altar with an incense burner (hiolo), red lanterns
// The focal point is the far wall (-z); the entrance is at +z.

type Solid = (x0: number, z0: number, x1: number, z1: number) => void;

function box(g: Group, w: number, h: number, d: number, m: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

function cyl(g: Group, r0: number, r1: number, h: number, m: Material, x: number, y: number, z: number, seg = 16): Mesh {
  const mesh = new Mesh(new CylinderGeometry(r0, r1, h, seg), m);
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

export interface WorshipLayout {
  /** Where the visitor stands or kneels to pray, facing the focal wall. */
  prayer: { x: number; z: number; heading: number };
  /** Optional ablution spot (masjid). */
  wudhu: { x: number; z: number } | null;
  /** Floor and wall colours for the hall. */
  floorTint: string;
  wallTint: string;
}

const LAYOUT: Record<string, Omit<WorshipLayout, 'prayer' | 'wudhu'>> = {
  islam: { floorTint: '#f2efe6', wallTint: '#f6f3ea' },
  kristen: { floorTint: '#e8e2d6', wallTint: '#f7f4ee' },
  katolik: { floorTint: '#e6e0d4', wallTint: '#f1ece2' },
  hindu: { floorTint: '#bdb3a2', wallTint: '#c9bba3' },
  buddha: { floorTint: '#efe4cf', wallTint: '#f4ead6' },
  konghucu: { floorTint: '#d9cdb8', wallTint: '#f0e2cc' },
};

export function worshipLayout(religion: string): Omit<WorshipLayout, 'prayer' | 'wudhu'> {
  return LAYOUT[religion] ?? LAYOUT.islam;
}

export function addWorship(g: Group, W: number, D: number, religion: string, solid: Solid): WorshipLayout {
  const gold = new MeshStandardMaterial({ color: '#c9a227', roughness: 0.35, metalness: 0.7 });
  const wood = pbr('wood_light', { tint: '#a8794e' });
  const back = -D / 2;
  const prayer = { x: 0, z: back + 4.2, heading: Math.PI };
  let wudhu: { x: number; z: number } | null = null;

  if (religion === 'islam') {
    // Carpet with prayer rows facing the mihrab.
    const carpet = new MeshStandardMaterial({ color: '#2e7d5b', roughness: 0.95 });
    const line = new MeshStandardMaterial({ color: '#e6d28a', roughness: 0.9 });
    box(g, W - 2, 0.02, D - 4, carpet, 0, 0.01, back + (D - 4) / 2 + 0.3);
    for (let z = back + 1.6; z < D / 2 - 3; z += 1.2) box(g, W - 2.2, 0.025, 0.06, line, 0, 0.015, z);
    // Mihrab: an arched niche in the far wall, with a mimbar (stepped pulpit) to its right.
    const niche = new MeshStandardMaterial({ color: '#d4c49a', roughness: 0.6 });
    box(g, 1.8, 2.4, 0.3, niche, 0, 1.2, back + 0.2);
    const arch = new Mesh(new CylinderGeometry(0.9, 0.9, 0.3, 24, 1, false, 0, Math.PI), niche);
    arch.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    arch.position.set(0, 2.4, back + 0.2);
    g.add(arch);
    box(g, 1.3, 2.0, 0.1, new MeshStandardMaterial({ color: '#1e6b4f', roughness: 0.7 }), 0, 1.1, back + 0.36);
    for (let i = 0; i < 4; i++) box(g, 0.9, 0.3 * (i + 1), 0.45, wood, 2.0, 0.15 * (i + 1), back + 0.6 + i * 0.45);
    box(g, 0.9, 1.0, 0.1, wood, 2.0, 1.6, back + 0.4);
    solid(1.5, back, 2.5, back + 2.4);
    // Geometric ornament band along the walls (no lettering).
    for (let x = -W / 2 + 1; x < W / 2 - 0.5; x += 0.8) {
      const star = box(g, 0.32, 0.32, 0.04, gold, x, 2.9, back + 0.12);
      star.rotation.z = Math.PI / 4;
    }
    // Hanging lamp and a wudhu area with taps along the side wall near the entrance.
    for (const x of [-3, 3]) {
      cyl(g, 0.015, 0.015, 0.6, gold, x, 3.1, 0);
      const lamp = new Mesh(new SphereGeometry(0.28, 16, 12), new MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffe08a', emissiveIntensity: 0.6 }));
      lamp.position.set(x, 2.75, 0);
      g.add(lamp);
    }
    const tile = new MeshStandardMaterial({ color: '#b8d8d0', roughness: 0.3 });
    box(g, 0.5, 0.8, 3.2, tile, W / 2 - 0.45, 0.4, D / 2 - 2.4);
    for (let i = 0; i < 4; i++) cyl(g, 0.03, 0.03, 0.25, new MeshStandardMaterial({ color: '#c0c6cc', metalness: 0.8, roughness: 0.3 }), W / 2 - 0.5, 1.15, D / 2 - 3.6 + i * 0.8, 8);
    solid(W / 2 - 0.7, D / 2 - 4, W / 2, D / 2 - 0.8);
    wudhu = { x: W / 2 - 1.4, z: D / 2 - 2.4 };
  } else if (religion === 'kristen' || religion === 'katolik') {
    // Pews in two blocks with an aisle, a raised chancel with the altar.
    const aisle = new MeshStandardMaterial({ color: '#8e2c2c', roughness: 0.9 });
    box(g, 1.6, 0.02, D - 3, aisle, 0, 0.01, 0.6);
    for (let z = back + 4.6; z < D / 2 - 1.6; z += 1.3) {
      for (const s of [-1, 1]) {
        box(g, 4.2, 0.08, 0.45, wood, s * 3.3, 0.45, z);
        box(g, 4.2, 0.55, 0.08, wood, s * 3.3, 0.75, z + 0.24);
        solid(s * 3.3 - 2.1, z - 0.25, s * 3.3 + 2.1, z + 0.3);
      }
    }
    box(g, W - 2, 0.3, 2.6, pbr('wood_light', { tint: '#d8c8a8' }), 0, 0.15, back + 1.5);
    box(g, 2.2, 0.95, 0.8, new MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.8 }), 0, 0.78, back + 1.4);
    box(g, 2.3, 0.05, 0.85, gold, 0, 1.27, back + 1.4);
    solid(-1.2, back + 0.9, 1.2, back + 1.9);
    // Cross on the far wall (a crucifix-like dark cross for Katolik, plain wood for Kristen).
    const crossMat = religion === 'katolik' ? new MeshStandardMaterial({ color: '#4a3424', roughness: 0.6 }) : wood;
    box(g, 0.22, 2.0, 0.1, crossMat, 0, 2.3, back + 0.15);
    box(g, 1.1, 0.22, 0.1, crossMat, 0, 2.7, back + 0.15);
    // Pulpit to the side.
    box(g, 0.8, 1.2, 0.6, wood, -3.2, 0.9, back + 1.8);
    solid(-3.6, back + 1.5, -2.8, back + 2.1);
    if (religion === 'katolik') {
      // Candles on the altar, a statue niche and coloured windows.
      for (const x of [-0.8, 0.8]) {
        cyl(g, 0.04, 0.05, 0.5, new MeshStandardMaterial({ color: '#fdfaf0' }), x, 1.55, back + 1.4, 8);
        const flame = new Mesh(new ConeGeometry(0.03, 0.08, 8), new MeshStandardMaterial({ color: '#ffcc55', emissive: '#ffaa22', emissiveIntensity: 1 }));
        flame.position.set(x, 1.85, back + 1.4);
        g.add(flame);
      }
      const niche = box(g, 1.0, 1.8, 0.3, new MeshStandardMaterial({ color: '#cdbfa6' }), 3.6, 1.6, back + 0.2);
      niche.castShadow = false;
      cyl(g, 0.22, 0.3, 1.1, new MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.7 }), 3.6, 1.25, back + 0.45, 12);
      const head = new Mesh(new SphereGeometry(0.15, 12, 10), new MeshStandardMaterial({ color: '#f2f2f2' }));
      head.position.set(3.6, 1.95, back + 0.45);
      g.add(head);
      const colors = ['#c0392b', '#2471a3', '#d4ac0d', '#1e8449'];
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          box(g, 0.05, 1.4, 0.7, new MeshStandardMaterial({ color: colors[(i + (s > 0 ? 1 : 0)) % 4], emissive: colors[(i + 2) % 4], emissiveIntensity: 0.25, transparent: true, opacity: 0.85 }), s * (W / 2 - 0.12), 2.0, back + 3 + i * 2.6);
        }
      }
    }
    prayer.z = back + 3.6;
  } else if (religion === 'hindu') {
    // Open stone courtyard: split gate near the entrance, padmasana shrine at the back.
    const stone = new MeshStandardMaterial({ color: '#7d746a', roughness: 0.95 });
    const brick = new MeshStandardMaterial({ color: '#a0523a', roughness: 0.9 });
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) box(g, 1.6 - i * 0.25, 0.7, 1.0 - i * 0.1, i % 2 ? stone : brick, s * 1.9, 0.35 + i * 0.7, D / 2 - 3);
      solid(s * 1.9 - 0.8, D / 2 - 3.5, s * 1.9 + 0.8, D / 2 - 2.5);
    }
    // Padmasana: stepped stone tower with a throne seat on top.
    for (let i = 0; i < 6; i++) box(g, 2.6 - i * 0.3, 0.55, 2.0 - i * 0.22, i % 2 ? stone : new MeshStandardMaterial({ color: '#c7bfb2', roughness: 0.9 }), 0, 0.28 + i * 0.55, back + 1.4);
    box(g, 1.0, 0.8, 0.12, gold, 0, 3.7, back + 1.0);
    solid(-1.4, back + 0.3, 1.4, back + 2.5);
    // Ceremonial umbrellas (tedung) and offerings on a low table.
    for (const s of [-1, 1]) {
      cyl(g, 0.03, 0.03, 2.4, wood, s * 2.2, 1.2, back + 2.6, 8);
      const top = new Mesh(new ConeGeometry(0.7, 0.4, 16), new MeshStandardMaterial({ color: s > 0 ? '#f4d03f' : '#ffffff', roughness: 0.8 }));
      top.position.set(s * 2.2, 2.5, back + 2.6);
      g.add(top);
    }
    box(g, 1.6, 0.4, 0.6, wood, 0, 0.2, back + 3.0);
    const colors = ['#e74c3c', '#f4d03f', '#ffffff', '#27ae60', '#8e44ad'];
    for (let i = 0; i < 5; i++) box(g, 0.18, 0.05, 0.18, new MeshStandardMaterial({ color: colors[i] }), -0.6 + i * 0.3, 0.43, back + 3.0);
    // Wrapped poleng (black and white check) cloth around a shrine post.
    for (let i = 0; i < 4; i++) box(g, 0.5, 0.25, 0.5, new MeshStandardMaterial({ color: i % 2 ? '#111111' : '#f5f5f5' }), -W / 2 + 1.5, 0.15 + i * 0.25, back + 2);
    prayer.z = back + 4.4;
  } else if (religion === 'buddha') {
    // Seated figure on a lotus base, on an altar, with candles, flowers and cushions in rows.
    box(g, 4, 0.9, 1.4, new MeshStandardMaterial({ color: '#7b241c', roughness: 0.6 }), 0, 0.45, back + 1.0);
    solid(-2, back + 0.2, 2, back + 1.8);
    const lotus = cyl(g, 0.9, 0.7, 0.35, new MeshStandardMaterial({ color: '#e8a1b0', roughness: 0.6 }), 0, 1.08, back + 0.95, 20);
    lotus.castShadow = false;
    // A seated figure in meditation: crossed legs, hands in the lap, upright body, head.
    const z = back + 0.95;
    const lap = new Mesh(new SphereGeometry(0.5, 20, 12), gold);
    lap.scale.set(1.6, 0.45, 1.1);
    lap.position.set(0, 1.42, z + 0.05);
    g.add(lap);
    cyl(g, 0.34, 0.46, 0.95, gold, 0, 2.0, z - 0.05, 20); // body
    const shoulders = new Mesh(new SphereGeometry(0.5, 20, 12), gold);
    shoulders.scale.set(1.05, 0.38, 0.62);
    shoulders.position.set(0, 2.42, z - 0.05);
    g.add(shoulders);
    for (const sx of [-1, 1]) {
      const arm = cyl(g, 0.1, 0.12, 0.75, gold, sx * 0.48, 1.98, z + 0.05, 10);
      arm.rotation.z = sx * 0.25;
      arm.rotation.x = 0.35;
    }
    const hands = new Mesh(new SphereGeometry(0.14, 12, 10), gold);
    hands.scale.set(1.4, 0.6, 1);
    hands.position.set(0, 1.62, z + 0.3);
    g.add(hands);
    cyl(g, 0.11, 0.13, 0.18, gold, 0, 2.62, z - 0.05, 12); // neck
    const head = new Mesh(new SphereGeometry(0.27, 20, 16), gold);
    head.scale.set(0.9, 1.08, 0.95);
    head.position.set(0, 2.95, z - 0.05);
    g.add(head);
    const top = new Mesh(new SphereGeometry(0.1, 12, 10), gold);
    top.position.set(0, 3.27, z - 0.05);
    g.add(top);
    const halo = new Mesh(new TorusGeometry(0.62, 0.04, 8, 32), gold);
    halo.position.set(0, 2.95, back + 0.55);
    g.add(halo);
    for (const x of [-1.5, 1.5]) {
      cyl(g, 0.06, 0.07, 0.6, new MeshStandardMaterial({ color: '#fdfaf0' }), x, 1.2, back + 1.3, 8);
      const flame = new Mesh(new ConeGeometry(0.04, 0.1, 8), new MeshStandardMaterial({ color: '#ffcc55', emissive: '#ffaa22', emissiveIntensity: 1 }));
      flame.position.set(x, 1.56, back + 1.3);
      g.add(flame);
      cyl(g, 0.12, 0.08, 0.35, gold, x * 0.6, 1.08, back + 1.5, 10);
      const flowers = new Mesh(new SphereGeometry(0.16, 10, 8), new MeshStandardMaterial({ color: '#f39c12' }));
      flowers.position.set(x * 0.6, 1.35, back + 1.5);
      g.add(flowers);
    }
    const cushion = new MeshStandardMaterial({ color: '#d4ac0d', roughness: 0.9 });
    for (let r = 0; r < 3; r++) for (let c = -2; c <= 2; c++) box(g, 0.6, 0.12, 0.6, cushion, c * 1.2, 0.06, back + 4.4 + r * 1.4);
    prayer.z = back + 3.4;
  } else {
    // Klenteng: red pillars, altar with an incense burner, red lanterns.
    const red = new MeshStandardMaterial({ color: '#b0281f', roughness: 0.5 });
    for (const s of [-1, 1]) {
      for (const z of [back + 2, back + 6]) {
        cyl(g, 0.22, 0.22, 3.3, red, s * 3.2, 1.65, z, 14);
        solid(s * 3.2 - 0.3, z - 0.3, s * 3.2 + 0.3, z + 0.3);
      }
    }
    box(g, 3.2, 1.0, 1.1, red, 0, 0.5, back + 1.0);
    box(g, 3.3, 0.06, 1.2, gold, 0, 1.03, back + 1.0);
    solid(-1.7, back + 0.4, 1.7, back + 1.6);
    const bronze = new MeshStandardMaterial({ color: '#8c6d3f', roughness: 0.4, metalness: 0.7 });
    cyl(g, 0.45, 0.35, 0.5, bronze, 0, 0.3, back + 2.6, 18); // hiolo in front of the altar
    for (const x of [-0.12, 0, 0.12]) cyl(g, 0.008, 0.008, 0.45, new MeshStandardMaterial({ color: '#c0392b' }), x, 0.75, back + 2.6, 4);
    for (const x of [-1.2, 1.2]) cyl(g, 0.07, 0.08, 0.8, red, x, 1.45, back + 1.0, 10);
    // Plaque frame and lanterns.
    box(g, 2.6, 0.7, 0.08, gold, 0, 2.7, back + 0.12);
    box(g, 2.3, 0.5, 0.09, red, 0, 2.7, back + 0.12);
    const lantern = new MeshStandardMaterial({ color: '#e03b2c', emissive: '#b81d10', emissiveIntensity: 0.5, roughness: 0.6 });
    for (const x of [-4, -1.6, 1.6, 4]) {
      for (const z of [back + 3.5, back + 7]) {
        const l = new Mesh(new SphereGeometry(0.32, 14, 10), lantern);
        l.scale.y = 0.8;
        l.position.set(x, 2.6, z);
        g.add(l);
        cyl(g, 0.12, 0.12, 0.08, gold, x, 2.88, z, 10);
      }
    }
    prayer.z = back + 3.8;
  }
  return { prayer, wudhu, ...worshipLayout(religion) };
}
