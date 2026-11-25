import { BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, PointLight, TorusGeometry, ConeGeometry } from 'three';
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
  const blanketMat = mat('#3f6fa8', 0.9);
  const blanket = new Group();
  blanket.name = 'blanket';
  at(rbox(1.04, 0.08, 1.25, 0.04, blanketMat), 0, 0.5, 0.32, blanket);
  at(rbox(1.06, 0.03, 0.12, 0.015, mat('#e7c65a', 0.9)), 0, 0.54, -0.2, blanket);
  g.add(blanket);
  // Blanket pulled over a sleeping character ("cover"), shown instead of the flat one.
  const cover = new Group();
  cover.name = 'cover';
  cover.visible = false;
  at(rbox(1.1, 0.5, 1.38, 0.2, blanketMat), 0, 0.62, 0.29, cover);
  at(rbox(1.12, 0.06, 0.16, 0.03, mat('#e7c65a', 0.9)), 0, 0.84, -0.36, cover);
  g.add(cover);
  at(rbox(0.7, 0.14, 0.34, 0.07, mat('#ffffff', 0.95)), 0, 0.55, -0.72, g);
  at(rbox(1.1, 0.75, 0.08, 0.04, wood()), 0, 0.37, -1.0, g);
  return g;
};

/**
 * Fridge with a hinged door (named "door", hinge on the left), shelves, an inside light ("light")
 * and a "contents" group that the room fills from the inventory.
 */
const fridge: Builder = () => {
  const g = new Group();
  const shell = white();
  // Open-front cabinet: back, sides, top, bottom.
  at(rbox(0.6, 1.5, 0.04, 0.01, shell), 0, 0.75, -0.28, g);
  at(rbox(0.04, 1.5, 0.58, 0.01, shell), -0.28, 0.75, 0, g);
  at(rbox(0.04, 1.5, 0.58, 0.01, shell), 0.28, 0.75, 0, g);
  at(rbox(0.6, 0.04, 0.58, 0.01, shell), 0, 1.48, 0, g);
  at(rbox(0.6, 0.12, 0.58, 0.01, shell), 0, 0.06, 0, g);
  const inner = mat('#eef4f6', 0.4);
  for (const y of [0.45, 0.8, 1.15]) at(rbox(0.5, 0.015, 0.5, 0.004, new MeshStandardMaterial({ color: '#dfeff5', transparent: true, opacity: 0.7, roughness: 0.1 })), 0, y, 0, g);
  at(rbox(0.52, 1.3, 0.01, 0.004, inner), 0, 0.78, -0.255, g);
  const contents = new Group();
  contents.name = 'contents';
  g.add(contents);
  const light = new PointLight('#eaf6ff', 0, 0.8, 2);
  light.name = 'light';
  at(light, 0, 1.3, 0.05, g);
  // Door: pivot at the hinge (left front edge).
  const door = new Group();
  door.name = 'door';
  door.userData.openAngle = -1.9;
  door.position.set(-0.3, 0, 0.31);
  g.add(door);
  at(rbox(0.6, 1.48, 0.05, 0.03, shell), 0.3, 0.75, 0, door);
  at(rbox(0.58, 0.01, 0.02, 0.005, mat('#cfd4d8')), 0.3, 1.05, 0.026, door);
  at(rbox(0.03, 0.3, 0.03, 0.01, metal()), 0.52, 1.3, 0.04, door);
  at(rbox(0.03, 0.3, 0.03, 0.01, metal()), 0.52, 0.75, 0.04, door);
  // Door shelves with bottles.
  at(rbox(0.5, 0.02, 0.08, 0.005, inner), 0.3, 0.5, -0.06, door);
  at(rbox(0.5, 0.02, 0.08, 0.005, inner), 0.3, 1.0, -0.06, door);
  return g;
};

const stove: Builder = () => {
  const g = new Group();
  at(rbox(1.2, 0.85, 0.6, 0.03, mat('#e9e2d6', 0.6)), 0, 0.425, 0, g);
  at(rbox(1.22, 0.04, 0.62, 0.01, mat('#5c5f63', 0.4)), 0, 0.87, 0, g);
  // Two-burner gas stove and a pan.
  at(rbox(0.6, 0.08, 0.4, 0.02, mat('#2d2f33', 0.4, 0.3)), -0.2, 0.93, 0, g);
  for (const x of [-0.35, -0.05]) at(cyl(0.08, 0.08, 0.02, metal()), x, 0.98, 0, g);
  // Gas flame ring (named "flame"), hidden until cooking.
  const flame = new Group();
  flame.name = 'flame';
  flame.visible = false;
  const flameMat = new MeshBasicMaterial({ color: '#4fa3ff', transparent: true, opacity: 0.85 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const cone = new Mesh(new ConeGeometry(0.012, 0.05, 5), flameMat);
    cone.position.set(Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06);
    flame.add(cone);
  }
  at(flame, -0.35, 1.0, 0, g);
  at(cyl(0.13, 0.11, 0.06, mat('#3a3a3e', 0.4, 0.4)), -0.35, 1.03, 0, g);
  at(rbox(0.04, 0.03, 0.25, 0.01, mat('#222')), -0.35, 1.05, 0.22, g);
  // Food in the pan ("food"), coloured by what is being cooked.
  const food = cyl(0.1, 0.1, 0.02, mat('#e2b53c', 0.8));
  food.name = 'food';
  food.visible = false;
  at(food, -0.35, 1.06, 0, g);
  const steam = new Group();
  steam.name = 'steam';
  steam.visible = false;
  for (let i = 0; i < 6; i++) {
    const puff = new Mesh(new PlaneGeometry(0.12, 0.12), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, depthWrite: false }));
    puff.userData.phase = i / 6;
    steam.add(puff);
  }
  at(steam, -0.35, 1.08, 0, g);
  at(rbox(0.35, 0.12, 0.3, 0.02, metal()), 0.42, 0.95, -0.05, g); // sink
  // Cutting board with knife and vegetables ("board"), shown while chopping.
  const board = new Group();
  board.name = 'board';
  board.visible = false;
  at(rbox(0.32, 0.02, 0.22, 0.01, mat('#c8a27a', 0.6)), 0, 0, 0, board);
  at(rbox(0.16, 0.006, 0.03, 0.002, metal()), 0.05, 0.016, 0.06, board);
  for (const [x, z, c] of [[-0.08, -0.04, '#4f9a52'], [-0.03, -0.05, '#d9534f'], [-0.1, 0.03, '#f3e6cf']] as const) at(sphere(0.022, mat(c)), x, 0.03, z, board);
  at(board, 0.25, 0.9, 0.12, g);
  // Plate being served ("serve").
  const serve = new Group();
  serve.name = 'serve';
  serve.visible = false;
  at(cyl(0.12, 0.1, 0.02, white(), 20), 0, 0, 0, serve);
  const served = cyl(0.08, 0.09, 0.03, mat('#e2b53c', 0.8), 14);
  served.name = 'food';
  at(served, 0, 0.02, 0, serve);
  at(serve, -0.05, 0.9, 0.15, g);
  return g;
};

const shower: Builder = () => {
  const g = new Group();
  at(rbox(0.9, 0.05, 0.9, 0.02, mat('#d9e3e6', 0.3)), 0, 0.025, 0, g);
  at(cyl(0.015, 0.015, 2.0, metal()), -0.38, 1.0, -0.38, g);
  at(cyl(0.08, 0.06, 0.03, metal()), -0.3, 1.95, -0.3, g);
  const glass = new Mesh(new PlaneGeometry(0.9, 1.9), new MeshStandardMaterial({ color: '#cfe9f2', transparent: true, opacity: 0.25, roughness: 0.1, side: DoubleSide }));
  at(glass, 0, 1.0, 0.45, g);
  // Falling water ("water"): thin streaks animated by the room.
  const water = new Group();
  water.name = 'water';
  water.visible = false;
  const dropMat = new MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.55, depthWrite: false });
  const dropGeo = new BoxGeometry(0.006, 0.12, 0.006);
  for (let i = 0; i < 70; i++) {
    const d = new Mesh(dropGeo, dropMat);
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.16;
    d.position.set(-0.3 + Math.cos(a) * r, Math.random() * 1.9, -0.3 + Math.sin(a) * r);
    d.userData.speed = 3 + Math.random() * 1.5;
    water.add(d);
  }
  g.add(water);
  return g;
};

const toilet: Builder = () => {
  const g = new Group();
  at(rbox(0.36, 0.4, 0.5, 0.12, white()), 0, 0.2, 0.05, g);
  at(rbox(0.38, 0.04, 0.48, 0.15, white()), 0, 0.41, 0.06, g);
  at(rbox(0.4, 0.4, 0.17, 0.04, white()), 0, 0.6, -0.24, g);
  // Lid hinged at the back ("door" so it opens like the other doors).
  const lid = new Group();
  lid.name = 'door';
  lid.userData.openAngle = -1.45;
  lid.userData.axis = 'x';
  lid.position.set(0, 0.44, -0.16);
  at(rbox(0.38, 0.03, 0.46, 0.14, white()), 0, 0, 0.22, lid);
  g.add(lid);
  at(cyl(0.12, 0.1, 0.4, mat('#6b8fa3', 0.5), 12), 0.3, 0.2, -0.2, g); // bucket (ember) and gayung
  return g;
};

const desk: Builder = () => {
  const g = new Group();
  at(rbox(1.2, 0.05, 0.6, 0.02, lightWood()), 0, 0.74, 0, g);
  for (const [x, z] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]]) at(rbox(0.05, 0.72, 0.05, 0.02, lightWood()), x, 0.36, z, g);
  at(rbox(0.36, 0.02, 0.25, 0.01, mat('#5a6270', 0.4, 0.3)), -0.1, 0.775, 0.05, g);
  const screen = rbox(0.36, 0.24, 0.015, 0.01, new MeshStandardMaterial({ color: '#2b3442', emissive: '#6fa8ff', emissiveIntensity: 0.15 }));
  screen.name = 'screen';
  screen.rotation.x = -0.25;
  at(screen, -0.1, 0.9, -0.08, g);
  // Plate with food ("plate"), shown while eating at the desk.
  const plate = new Group();
  plate.name = 'plate';
  plate.visible = false;
  at(cyl(0.12, 0.1, 0.02, white(), 20), 0, 0, 0, plate);
  const meal = cyl(0.08, 0.09, 0.03, mat('#e2b53c', 0.8), 14);
  meal.name = 'food';
  at(meal, 0, 0.02, 0, plate);
  at(rbox(0.015, 0.005, 0.16, 0.002, metal()), 0.14, 0.0, 0, plate);
  at(plate, 0.15, 0.775, 0.12, g);
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
  const tvScreen = rbox(0.88, 0.5, 0.01, 0.005, new MeshStandardMaterial({ color: '#1b2a3a', emissive: '#3d6a9a', emissiveIntensity: 0.05 }));
  tvScreen.name = 'screen';
  at(tvScreen, 0, 0.78, -0.02, g);
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

/** Wardrobe with two doors, clothes on a rail and folded towels. */
const wardrobe: Builder = () => {
  const g = new Group();
  const body = mat('#b98a5e', 0.6);
  at(rbox(1.0, 1.9, 0.04, 0.01, body), 0, 0.95, -0.255, g);
  at(rbox(0.04, 1.9, 0.55, 0.01, body), -0.48, 0.95, 0, g);
  at(rbox(0.04, 1.9, 0.55, 0.01, body), 0.48, 0.95, 0, g);
  at(rbox(1.0, 0.04, 0.55, 0.01, body), 0, 1.88, 0, g);
  at(rbox(1.0, 0.08, 0.55, 0.01, body), 0, 0.04, 0, g);
  at(rbox(0.04, 1.8, 0.5, 0.01, body), 0, 0.95, 0, g); // divider
  at(cyl(0.01, 0.01, 0.42, metal(), 8), -0.24, 1.65, 0, g).rotation.z = Math.PI / 2;
  ['#f2c14e', '#3f6fa8', '#e8747c', '#ffffff', '#4f9a8a'].forEach((c, i) => at(rbox(0.05, 0.6, 0.36, 0.02, mat(c, 0.9)), -0.4 + i * 0.08, 1.33, 0, g));
  for (let i = 0; i < 4; i++) at(rbox(0.38, 0.08, 0.3, 0.03, mat(['#ffffff', '#9cc5e8', '#ffffff', '#d9c59a'][i], 0.95)), 0.24, 0.5 + i * 0.25, 0, g);
  for (const side of [-1, 1]) {
    const door = new Group();
    door.name = 'door';
    door.userData.openAngle = side * -1.7;
    door.position.set(side * 0.48, 0, 0.28);
    at(rbox(0.47, 1.8, 0.03, 0.01, mat('#c79a6a', 0.55)), -side * 0.24, 0.96, 0, door);
    at(cyl(0.012, 0.012, 0.14, metal(), 8), -side * 0.42, 1.0, 0.03, door);
    g.add(door);
  }
  return g;
};

/** Woven laundry basket with a lid and clothes inside. */
const laundry: Builder = () => {
  const g = new Group();
  at(cyl(0.18, 0.15, 0.5, mat('#c9a86a', 0.95), 16), 0, 0.25, 0, g);
  for (const [c, x] of [['#3f6fa8', -0.05], ['#f2c14e', 0.05]] as const) at(sphere(0.08, mat(c, 0.95)), x, 0.47, 0, g);
  const lid = new Group();
  lid.name = 'door';
  lid.userData.openAngle = -1.3;
  lid.userData.axis = 'x';
  lid.position.set(0, 0.5, -0.18);
  at(cyl(0.19, 0.19, 0.03, mat('#b8955a', 0.95), 16), 0, 0.015, 0.18, lid);
  g.add(lid);
  return g;
};

/** Invisible tap target filling the front doorway (the door leaf itself belongs to the wall). */
const doorway: Builder = () => {
  const g = new Group();
  const hit = new Mesh(new BoxGeometry(0.85, 2.05, 0.3), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  at(hit, 0, 1.03, 0, g);
  return g;
};

const BUILDERS: Record<string, Builder> = {
  doorway,
  wardrobe,
  laundry,
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
