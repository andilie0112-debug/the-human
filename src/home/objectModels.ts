import { DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, TorusGeometry } from 'three';
import { at, cyl, mat, rbox, shadowed, sphere } from './primitives';

// Greybox models for smart objects, built from rounded primitives. Each builder returns a group
// with its origin on the floor at the footprint centre and its front facing +z.
// Real GLB models replace these later; the object data does not change.

type Builder = () => Group;

const wood = (): MeshStandardMaterial => mat('#a8774e', 0.6);
const lightWood = (): MeshStandardMaterial => mat('#c8a27a', 0.55);
const white = (): MeshStandardMaterial => mat('#f4f4f2', 0.35);
const metal = (): MeshStandardMaterial => mat('#9aa3ab', 0.35, 0.6);

const bed: Builder = () => {
  const g = new Group();
  at(rbox(1.1, 0.3, 2.0, 0.06, wood()), 0, 0.15, 0, g);
  at(rbox(1.0, 0.18, 1.9, 0.08, mat('#fbf7ef', 0.9)), 0, 0.39, 0, g);
  at(rbox(1.04, 0.08, 1.25, 0.04, mat('#3f6fa8', 0.9)), 0, 0.5, 0.32, g);
  at(rbox(1.06, 0.03, 0.12, 0.015, mat('#e7c65a', 0.9)), 0, 0.54, -0.2, g);
  at(rbox(0.7, 0.14, 0.34, 0.07, mat('#ffffff', 0.95)), 0, 0.55, -0.72, g);
  at(rbox(1.1, 0.75, 0.08, 0.04, wood()), 0, 0.37, -1.0, g);
  return g;
};

const fridge: Builder = () => {
  const g = new Group();
  at(rbox(0.6, 1.5, 0.6, 0.05, white()), 0, 0.75, 0, g);
  at(rbox(0.58, 0.01, 0.02, 0.005, mat('#cfd4d8')), 0, 1.05, 0.301, g);
  at(rbox(0.03, 0.3, 0.03, 0.01, metal()), 0.22, 1.3, 0.32, g);
  at(rbox(0.03, 0.3, 0.03, 0.01, metal()), 0.22, 0.75, 0.32, g);
  return g;
};

const stove: Builder = () => {
  const g = new Group();
  at(rbox(1.2, 0.85, 0.6, 0.03, mat('#e9e2d6', 0.6)), 0, 0.425, 0, g);
  at(rbox(1.22, 0.04, 0.62, 0.01, mat('#5c5f63', 0.4)), 0, 0.87, 0, g);
  // Two-burner gas stove and a pan.
  at(rbox(0.6, 0.08, 0.4, 0.02, mat('#2d2f33', 0.4, 0.3)), -0.2, 0.93, 0, g);
  for (const x of [-0.35, -0.05]) at(cyl(0.08, 0.08, 0.02, metal()), x, 0.98, 0, g);
  at(cyl(0.13, 0.11, 0.06, mat('#3a3a3e', 0.4, 0.4)), -0.35, 1.02, 0, g);
  at(rbox(0.04, 0.03, 0.25, 0.01, mat('#222')), -0.35, 1.04, 0.22, g);
  at(rbox(0.35, 0.12, 0.3, 0.02, metal()), 0.35, 0.95, 0, g); // sink
  return g;
};

const shower: Builder = () => {
  const g = new Group();
  at(rbox(0.9, 0.05, 0.9, 0.02, mat('#d9e3e6', 0.3)), 0, 0.025, 0, g);
  at(cyl(0.015, 0.015, 2.0, metal()), -0.38, 1.0, -0.38, g);
  at(cyl(0.08, 0.06, 0.03, metal()), -0.3, 1.95, -0.3, g);
  const glass = new Mesh(new PlaneGeometry(0.9, 1.9), new MeshStandardMaterial({ color: '#cfe9f2', transparent: true, opacity: 0.25, roughness: 0.1, side: DoubleSide }));
  at(glass, 0, 1.0, 0.45, g);
  return g;
};

const toilet: Builder = () => {
  const g = new Group();
  at(rbox(0.36, 0.4, 0.5, 0.12, white()), 0, 0.2, 0.05, g);
  at(rbox(0.38, 0.05, 0.48, 0.15, white()), 0, 0.42, 0.06, g);
  at(rbox(0.4, 0.4, 0.17, 0.04, white()), 0, 0.6, -0.24, g);
  at(cyl(0.12, 0.1, 0.4, mat('#6b8fa3', 0.5), 12), 0.3, 0.2, -0.2, g); // bucket (ember) and gayung
  return g;
};

const desk: Builder = () => {
  const g = new Group();
  at(rbox(1.2, 0.05, 0.6, 0.02, lightWood()), 0, 0.74, 0, g);
  for (const [x, z] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]]) at(rbox(0.05, 0.72, 0.05, 0.02, lightWood()), x, 0.36, z, g);
  at(rbox(0.36, 0.02, 0.25, 0.01, mat('#5a6270', 0.4, 0.3)), -0.1, 0.775, 0.05, g);
  const screen = rbox(0.36, 0.24, 0.015, 0.01, new MeshStandardMaterial({ color: '#2b3442', emissive: '#6fa8ff', emissiveIntensity: 0.4 }));
  screen.rotation.x = -0.25;
  at(screen, -0.1, 0.9, -0.08, g);
  at(rbox(0.12, 0.14, 0.12, 0.05, mat('#e2725b', 0.5)), 0.42, 0.84, -0.1, g);
  // Chair in front of the desk.
  const chair = new Group();
  const chairMat = mat('#4e7d6b', 0.7);
  at(rbox(0.45, 0.06, 0.45, 0.03, chairMat), 0, 0.46, 0, chair);
  at(rbox(0.45, 0.45, 0.05, 0.03, chairMat), 0, 0.72, 0.21, chair);
  for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) at(rbox(0.04, 0.45, 0.04, 0.015, mat('#333')), x, 0.22, z, chair);
  at(chair, 0, 0, 0.62, g);
  return g;
};

const tv: Builder = () => {
  const g = new Group();
  at(rbox(1.1, 0.45, 0.42, 0.03, wood()), 0, 0.225, 0, g);
  at(rbox(0.95, 0.56, 0.05, 0.02, mat('#16181c', 0.3)), 0, 0.78, -0.05, g);
  at(rbox(0.88, 0.5, 0.01, 0.005, new MeshStandardMaterial({ color: '#1b2a3a', emissive: '#3d6a9a', emissiveIntensity: 0.35 })), 0, 0.78, -0.02, g);
  at(rbox(0.2, 0.04, 0.15, 0.01, mat('#16181c')), 0, 0.47, -0.05, g);
  // Floor cushion (bantal duduk) where the character sits to watch.
  at(rbox(0.6, 0.18, 0.55, 0.08, mat('#c0603a', 0.95)), 0, 0.09, 1.35, g);
  return g;
};

const exerciseMat: Builder = () => {
  const g = new Group();
  at(rbox(0.62, 0.02, 1.6, 0.01, mat('#4f9a8a', 0.95)), 0, 0.01, 0, g);
  at(cyl(0.05, 0.05, 0.3, mat('#333'), 12), 0.38, 0.05, -0.65, g).rotation.z = Math.PI / 2; // dumbbell
  return g;
};

const sajadah: Builder = () => {
  const g = new Group();
  at(rbox(0.68, 0.015, 1.15, 0.005, mat('#8a2f3c', 0.95)), 0, 0.008, 0, g);
  at(rbox(0.5, 0.017, 0.25, 0.004, mat('#d8b25a', 0.9)), 0, 0.009, -0.38, g); // mihrab motif at the top
  return g;
};

function wallShelf(withItems: (g: Group) => void): Group {
  const g = new Group();
  at(rbox(0.7, 0.04, 0.3, 0.015, wood()), 0, 1.1, -0.02, g);
  at(rbox(0.6, 0.6, 0.04, 0.01, mat('#efe5d4')), 0, 1.4, -0.15, g);
  withItems(g);
  return g;
}

const crossShelf: Builder = () =>
  wallShelf((g) => {
    at(rbox(0.04, 0.4, 0.03, 0.01, wood()), 0, 1.4, -0.12, g);
    at(rbox(0.24, 0.04, 0.03, 0.01, wood()), 0, 1.48, -0.12, g);
    at(rbox(0.22, 0.05, 0.16, 0.01, mat('#2d3e6b')), -0.2, 1.145, 0, g); // Bible
  });

const rosaryShelf: Builder = () =>
  wallShelf((g) => {
    at(rbox(0.04, 0.4, 0.03, 0.01, wood()), 0, 1.4, -0.12, g);
    at(rbox(0.24, 0.04, 0.03, 0.01, wood()), 0, 1.48, -0.12, g);
    const beads = shadowed(new Mesh(new TorusGeometry(0.08, 0.008, 6, 24), mat('#6b3e26', 0.5)));
    beads.rotation.x = Math.PI / 2;
    at(beads, 0.2, 1.13, 0.02, g);
    at(cyl(0.025, 0.025, 0.15, mat('#f6efe0'), 10), -0.22, 1.195, 0, g); // candle
  });

const pelinggih: Builder = () => {
  const g = new Group();
  const stone = mat('#8d8a82', 0.9);
  at(rbox(0.5, 0.5, 0.5, 0.03, stone), 0, 0.25, 0, g);
  at(rbox(0.36, 0.3, 0.36, 0.03, mat('#c9a86a', 0.7)), 0, 0.65, 0, g);
  at(cyl(0.02, 0.32, 0.28, mat('#4a3423', 0.9), 4), 0, 0.94, 0, g).rotation.y = Math.PI / 4;
  // Canang sari offering.
  at(cyl(0.08, 0.07, 0.03, mat('#7fa651')), 0, 0.515, 0.18, g);
  for (const [x, c] of [[-0.03, '#e8c14a'], [0.03, '#d9534f']] as const) at(sphere(0.025, mat(c)), x, 0.54, 0.18, g);
  return g;
};

function altar(statue: (g: Group) => void): Group {
  const g = new Group();
  at(rbox(0.8, 0.85, 0.42, 0.03, mat('#7a2c22', 0.5)), 0, 0.425, 0, g);
  statue(g);
  at(cyl(0.05, 0.04, 0.08, mat('#c9a227', 0.3, 0.6)), 0.28, 0.89, 0.1, g); // incense holder
  for (const x of [-0.3, 0.3]) at(cyl(0.02, 0.02, 0.12, mat('#d9534f'), 8), x, 0.91, -0.05, g); // candles
  return g;
}

const altarBuddha: Builder = () =>
  altar((g) => {
    const gold = mat('#d4a73a', 0.35, 0.6);
    at(rbox(0.26, 0.08, 0.2, 0.03, gold), 0, 0.89, -0.05, g);
    at(sphere(0.11, gold), 0, 1.0, -0.05, g).scale.set(1.2, 0.9, 0.9);
    at(sphere(0.06, gold), 0, 1.14, -0.05, g);
  });

const altarAncestor: Builder = () =>
  altar((g) => {
    at(rbox(0.36, 0.38, 0.04, 0.01, mat('#2a1a10', 0.5)), 0, 1.06, -0.12, g); // ancestor tablet
    at(rbox(0.3, 0.3, 0.01, 0.005, mat('#c9a227', 0.4, 0.4)), 0, 1.06, -0.095, g);
    for (const x of [-0.12, 0.12]) at(sphere(0.04, mat('#e2725b')), x, 0.89, 0.12, g); // fruit offerings
  });

const BUILDERS: Record<string, Builder> = {
  bed,
  fridge,
  stove,
  shower,
  toilet,
  desk,
  tv,
  mat: exerciseMat,
  sajadah,
  cross_shelf: crossShelf,
  rosary_shelf: rosaryShelf,
  pelinggih,
  altar_buddha: altarBuddha,
  altar_ancestor: altarAncestor,
};

export function buildObjectModel(model: string): Group {
  const builder = BUILDERS[model];
  if (!builder) throw new Error(`no model builder for ${model}`);
  return builder();
}

export const MODEL_IDS = Object.keys(BUILDERS);
