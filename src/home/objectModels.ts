import { BoxGeometry, CapsuleGeometry, CircleGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, TorusGeometry, ConeGeometry } from 'three';
import { at, cyl, mat, rbox, sajadahTexture, shadowed, sphere } from './primitives';
import { addProp } from '../engine/props';
import { pbr } from '../engine/pbr';

// Greybox models for smart objects, built from rounded primitives. Each builder returns a group
// with its origin on the floor at the footprint centre and its front facing +z.
// Real GLB models replace these later; the object data does not change.

type Builder = () => Group;

const wood = (): MeshStandardMaterial => pbr('wood_dark', { tint: '#d9b48c' });
const lightWood = (): MeshStandardMaterial => pbr('wood_light');
const sheet = (): MeshStandardMaterial => pbr('fabric_white', { repeat: [2, 2], tint: '#fbf7ef' });
const white = (): MeshStandardMaterial => mat('#f4f4f2', 0.35);
const metal = (): MeshStandardMaterial => mat('#9aa3ab', 0.35, 0.6);

const bed: Builder = () => {
  const g = new Group();
  // Metal bed frame (Poly Haven, 0.9 x 2.0 m), with a mattress, pillow and blanket on it.
  addProp(g, 'old_bed_frame', { size: [1.04, null, 2.02], stretch: true });
  at(rbox(0.98, 0.2, 1.92, 0.08, sheet()), 0, 0.52, 0.02, g);
  const blanketMat = pbr('fabric_blue', { repeat: [3, 3], tint: '#7fa3d6' });
  const blanket = new Group();
  blanket.name = 'blanket';
  at(rbox(1.02, 0.07, 1.25, 0.035, blanketMat), 0, 0.64, 0.33, blanket);
  at(rbox(1.03, 0.025, 0.12, 0.012, sheet()), 0, 0.675, -0.22, blanket);
  g.add(blanket);
  // Blanket pulled over a sleeping character ("cover"), shown instead of the flat one.
  const cover = new Group();
  cover.name = 'cover';
  cover.visible = false;
  at(rbox(1.06, 0.44, 1.38, 0.2, blanketMat), 0, 0.74, 0.3, cover);
  at(rbox(1.08, 0.05, 0.16, 0.025, sheet()), 0, 0.94, -0.35, cover);
  g.add(cover);
  at(rbox(0.62, 0.13, 0.36, 0.065, sheet()), 0, 0.68, -0.7, g);
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
  at(rbox(0.5, 0.06, 0.01, 0.003, mat('#3a3d42', 0.6)), 0, 0.05, 0.3, g); // ventilation grille
  for (const x of [-0.25, 0.25]) at(cyl(0.02, 0.02, 0.03, mat('#2a2c30', 0.6), 8), x, 0.015, 0.22, g); // feet
  const inner = mat('#eef4f6', 0.4);
  // The inside is only drawn while the door is open (saves draw calls).
  const inside = new Group();
  inside.name = 'inside';
  g.add(inside);
  for (const y of [0.45, 0.8, 1.15]) at(rbox(0.5, 0.015, 0.5, 0.004, new MeshStandardMaterial({ color: '#dfeff5', transparent: true, opacity: 0.7, roughness: 0.1 })), 0, y, 0, inside);
  // Back panel glows when the door opens (the fridge light, without a real light source).
  const light = at(rbox(0.52, 1.3, 0.01, 0.004, new MeshStandardMaterial({ color: '#eef4f6', roughness: 0.4, emissive: '#eaf6ff', emissiveIntensity: 0 })), 0, 0.78, -0.255, inside);
  light.name = 'light';
  const contents = new Group();
  contents.name = 'contents';
  inside.add(contents);
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
  // Fridge magnets and a shopping note on the door.
  for (const [x, y, c] of [[0.12, 1.32, '#e2725b'], [0.2, 1.2, '#f2c14e'], [0.42, 1.38, '#4f9a8a']] as const) at(cyl(0.018, 0.018, 0.012, mat(c, 0.4), 12), x, y, 0.03, door).rotation.x = Math.PI / 2;
  at(rbox(0.12, 0.16, 0.003, 0.002, mat('#fbf6e8', 0.9)), 0.26, 1.12, 0.027, door).rotation.z = 0.06;
  at(rbox(0.09, 0.008, 0.004, 0.001, mat('#8a8f99', 0.8)), 0.26, 1.15, 0.03, door);
  at(rbox(0.07, 0.008, 0.004, 0.001, mat('#8a8f99', 0.8)), 0.25, 1.12, 0.03, door);
  // Door shelves with bottles.
  at(rbox(0.5, 0.02, 0.08, 0.005, inner), 0.3, 0.5, -0.06, door);
  at(rbox(0.5, 0.02, 0.08, 0.005, inner), 0.3, 1.0, -0.06, door);
  return g;
};

const stove: Builder = () => {
  const g = new Group();
  const cab = pbr('wood_light', { tint: '#f2e6d6', repeat: [1, 1] });
  // Cabinet: back, sides, middle divider, bottom; the left half is open and holds the gas tank.
  at(rbox(1.2, 0.85, 0.03, 0.01, cab), 0, 0.425, -0.285, g);
  for (const x of [-0.585, 0, 0.585]) at(rbox(0.03, 0.85, 0.6, 0.01, cab), x, 0.425, 0, g);
  at(rbox(1.2, 0.05, 0.6, 0.01, cab), 0, 0.025, 0, g);
  at(rbox(0.56, 0.02, 0.56, 0.005, mat('#5a4a3a', 0.9)), -0.3, 0.06, 0, g); // dark inside floor
  at(rbox(0.56, 0.74, 0.012, 0.01, pbr('wood_light', { tint: '#e8d6bf', repeat: [1, 1] })), 0.3, 0.43, 0.301, g);
  at(rbox(0.015, 0.12, 0.02, 0.006, metal()), 0.06, 0.62, 0.31, g);
  at(rbox(1.22, 0.04, 0.62, 0.01, pbr('tiles_cream', { tint: '#5d5a57', roughness: 0.35 })), 0, 0.87, 0, g);
  // LPG 3 kg tank (the green "melon") with regulator and hose up to the stove.
  const tank = mat('#4f9a3a', 0.45, 0.2);
  at(new Mesh(new CapsuleGeometry(0.13, 0.16, 6, 16), tank), -0.3, 0.27, 0, g).castShadow = true;
  at(cyl(0.05, 0.05, 0.06, tank, 12), -0.3, 0.48, 0, g);
  at(cyl(0.11, 0.11, 0.05, mat('#4f9a3a', 0.5, 0.2), 16), -0.3, 0.09, 0, g); // foot ring
  at(cyl(0.025, 0.025, 0.05, mat('#c9c9c9', 0.3, 0.7), 10), -0.3, 0.53, 0, g); // regulator
  at(rbox(0.06, 0.04, 0.03, 0.01, mat('#d9534f', 0.4)), -0.3, 0.57, 0, g); // regulator dial
  const hose = at(cyl(0.008, 0.008, 0.38, mat('#e2622b', 0.6), 6), -0.3, 0.74, -0.2, g);
  hose.rotation.x = 0.35;
  addProp(g, 'vintage_electric_kettle', { x: 0.42, y: 0.89, z: -0.2, size: [null, 0.18, null] });
  // Rice cooker ("magic com"): white body, lid, little orange "warm" light.
  const rc = mat('#f4f1ea', 0.35);
  at(cyl(0.12, 0.11, 0.2, rc, 20), 0.12, 0.99, -0.16, g);
  at(new Mesh(new SphereGeometry(0.12, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), rc), 0.12, 1.09, -0.16, g).scale.y = 0.45;
  at(rbox(0.07, 0.025, 0.04, 0.01, mat('#6a6f77', 0.4)), 0.12, 1.15, -0.16, g); // handle
  at(sphere(0.008, new MeshStandardMaterial({ color: '#ff9a3c', emissive: '#ff7a1a', emissiveIntensity: 1.2 })), 0.12, 0.97, -0.045, g);
  // Two-burner gas stove on the counter.
  at(rbox(0.6, 0.08, 0.4, 0.02, mat('#1f2124', 0.15, 0.4)), -0.2, 0.93, 0, g);
  for (const x of [-0.42, -0.12]) at(cyl(0.012, 0.012, 0.025, metal(), 8), x + 0.1, 0.93, 0.205, g).rotation.x = Math.PI / 2; // knobs
  for (const x of [-0.35, -0.05]) {
    at(cyl(0.08, 0.08, 0.02, metal()), x, 0.98, 0, g);
    for (let i = 0; i < 4; i++) at(rbox(0.16, 0.012, 0.012, 0.003, mat('#2a2a2d', 0.5, 0.5)), x, 0.995, 0, g).rotation.y = (i * Math.PI) / 4; // pan support
  }
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
  // Wajan (wok) with a wooden handle.
  const wok = new Mesh(new SphereGeometry(0.15, 22, 10, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), new MeshStandardMaterial({ color: '#2f3033', roughness: 0.45, metalness: 0.6, side: DoubleSide }));
  at(wok, -0.35, 1.13, 0, g).castShadow = true;
  at(cyl(0.012, 0.012, 0.2, pbr('wood_dark'), 8), -0.35, 1.08, 0.24, g).rotation.x = Math.PI / 2 - 0.25;
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
  at(rbox(0.32, 0.02, 0.26, 0.02, mat('#b8c0c7', 0.25, 0.8)), 0.38, 0.895, 0.06, g); // sink basin rim
  at(rbox(0.28, 0.01, 0.22, 0.01, mat('#7d858c', 0.3, 0.8)), 0.38, 0.9, 0.06, g);
  const tap = at(cyl(0.012, 0.012, 0.22, metal(), 8), 0.38, 0.99, -0.1, g);
  tap.rotation.x = 0.0;
  at(cyl(0.01, 0.01, 0.12, metal(), 8), 0.38, 1.09, -0.05, g).rotation.x = Math.PI / 2;
  // Running water from the tap ("water", animated by the room) and suds in the sink ("foam").
  const tapWater = new Group();
  tapWater.name = 'water';
  tapWater.visible = false;
  const streamMat = new MeshBasicMaterial({ color: '#cfeeff', transparent: true, opacity: 0.6, depthWrite: false });
  const streamGeo = new BoxGeometry(0.008, 0.05, 0.008);
  for (let i = 0; i < 14; i++) {
    const d = new Mesh(streamGeo, streamMat);
    d.position.set((Math.random() - 0.5) * 0.01, 0.91 + Math.random() * 0.16, (Math.random() - 0.5) * 0.01);
    d.userData.speed = 1.6;
    d.userData.top = 1.07;
    d.userData.bottom = 0.91;
    tapWater.add(d);
  }
  at(tapWater, 0.38, 0, 0.01, g);
  const foam = new Group();
  foam.name = 'foam';
  foam.visible = false;
  const foamMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 12; i++) {
    const b = new Mesh(new SphereGeometry(0.015 + Math.random() * 0.02, 8, 6), foamMat);
    b.position.set((Math.random() - 0.5) * 0.22, 0.905, 0.06 + (Math.random() - 0.5) * 0.16);
    foam.add(b);
  }
  at(foam, 0.38, 0, 0, g);
  // Dish soap and a small rack with clean plates beside the sink.
  at(cyl(0.025, 0.028, 0.14, mat('#27ae60', 0.25), 12), 0.55, 0.97, -0.12, g);
  at(cyl(0.008, 0.008, 0.03, mat('#f4f4f2', 0.4), 8), 0.55, 1.055, -0.12, g);
  for (let i = 0; i < 3; i++) {
    const plate = at(cyl(0.09, 0.09, 0.012, white(), 18), 0.55 + i * 0.012, 1.0, 0.1, g);
    plate.rotation.z = Math.PI / 2 - 0.15;
  }
  at(rbox(0.06, 0.015, 0.2, 0.005, mat('#9aa3ab', 0.4, 0.6)), 0.56, 0.905, 0.1, g);
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
  // Bak mandi: a small tiled water tub in the back-right corner, with a floating gayung.
  const tiles = pbr('bath_wall', { repeat: [1.5, 2], roughness: 0.3 });
  at(rbox(0.42, 0.62, 0.38, 0.02, tiles), 0.24, 0.31, -0.26, g);
  at(rbox(0.44, 0.03, 0.4, 0.01, mat('#e9eef0', 0.3)), 0.24, 0.625, -0.26, g); // rim
  const tubWater = new Mesh(new PlaneGeometry(0.36, 0.32), new MeshStandardMaterial({ color: '#7fc3e0', transparent: true, opacity: 0.65, roughness: 0.05, metalness: 0.1 }));
  tubWater.rotation.x = -Math.PI / 2;
  at(tubWater, 0.24, 0.6, -0.26, g);
  const dipper = mat('#f08a24', 0.4);
  at(cyl(0.055, 0.045, 0.07, dipper, 14), 0.2, 0.62, -0.22, g);
  at(cyl(0.012, 0.012, 0.15, dipper, 8), 0.28, 0.63, -0.18, g).rotation.z = Math.PI / 2 - 0.2;
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
  // Ember (plastic bucket) with water and a gayung (dipper).
  const bucket = mat('#3f7fc0', 0.45);
  at(cyl(0.13, 0.11, 0.3, bucket, 18), 0.33, 0.15, -0.15, g);
  at(new Mesh(new CircleGeometry(0.12, 18), new MeshStandardMaterial({ color: '#7fb7d9', transparent: true, opacity: 0.7, roughness: 0.05 })), 0.33, 0.28, -0.15, g).rotation.x = -Math.PI / 2;
  const gayung = mat('#f08a24', 0.4);
  at(cyl(0.055, 0.045, 0.08, gayung, 14), 0.31, 0.31, -0.13, g);
  at(cyl(0.012, 0.012, 0.16, gayung, 8), 0.39, 0.32, -0.08, g).rotation.z = Math.PI / 2 - 0.3;
  // Jet washer hose on the wall beside the toilet.
  at(rbox(0.04, 0.06, 0.03, 0.01, metal()), -0.26, 0.55, -0.3, g);
  at(rbox(0.03, 0.1, 0.03, 0.01, mat('#f4f4f2', 0.3)), -0.26, 0.5, -0.27, g);
  at(cyl(0.006, 0.006, 0.4, mat('#c9ced3', 0.3, 0.7), 6), -0.24, 0.32, -0.27, g);
  // Floor drain.
  at(cyl(0.05, 0.05, 0.004, mat('#9aa3ab', 0.3, 0.7), 16), 0.05, 0.004, 0.42, g);
  return g;
};

const desk: Builder = () => {
  const g = new Group();
  addProp(g, 'wooden_table_02', { size: [1.2, 0.75, 0.6], stretch: true });
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
  addProp(g, 'desk_lamp_arm_01', { x: 0.45, y: 0.75, z: -0.12, rot: -30, size: [null, 0.5, null] });
  // White plastic chair, placed right under the hips of the sitting character (spot z 0.58,
  // the sitting clip moves the hips ~0.3 m back).
  addProp(g, 'plastic_monobloc_chair_01', { z: 0.93, rot: -90, size: [null, 0.86, null] });
  return g;
};

const tv: Builder = () => {
  const g = new Group();
  // A wooden chest of drawers as the TV stand, and a clock on the wall above (Poly Haven).
  addProp(g, 'vintage_wooden_drawer_01', { size: [1.1, 0.45, 0.42], stretch: true });
  addProp(g, 'wall_clock', { y: 1.55, z: -0.2, size: [0.3, null, null] });
  at(rbox(0.95, 0.56, 0.05, 0.02, mat('#16181c', 0.3)), 0, 0.78, -0.05, g);
  const tvScreen = rbox(0.88, 0.5, 0.01, 0.005, new MeshStandardMaterial({ color: '#1b2a3a', emissive: '#3d6a9a', emissiveIntensity: 0.05 }));
  tvScreen.name = 'screen';
  at(tvScreen, 0, 0.78, -0.02, g);
  at(rbox(0.2, 0.04, 0.15, 0.01, mat('#16181c')), 0, 0.47, -0.05, g);
  // Floor cushion (bantal duduk) where the character sits to watch.
  at(rbox(0.6, 0.18, 0.55, 0.08, pbr('fabric_linen', { tint: '#d98a5f' })), 0, 0.09, 1.35, g);
  return g;
};

const exerciseMat: Builder = () => {
  const g = new Group();
  at(rbox(0.62, 0.02, 1.6, 0.01, pbr('fabric_weave', { tint: '#5fb3a2', repeat: [3, 8] })), 0, 0.01, 0, g);
  at(cyl(0.05, 0.05, 0.3, mat('#333'), 12), 0.38, 0.05, -0.65, g).rotation.z = Math.PI / 2; // dumbbell
  return g;
};

const sajadah: Builder = () => {
  const g = new Group();
  // Woven prayer rug: border, mihrab arch and small motifs drawn on a canvas.
  const top = new Mesh(new PlaneGeometry(0.68, 1.15), new MeshStandardMaterial({ map: sajadahTexture(), roughness: 0.95 }));
  top.rotation.x = -Math.PI / 2;
  at(top, 0, 0.016, 0, g);
  at(rbox(0.68, 0.015, 1.15, 0.005, mat('#6e1f2a', 0.95)), 0, 0.008, 0, g);
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
  const body = pbr('wood_light', { tint: '#e6c9a3', repeat: [1, 2] });
  at(rbox(1.0, 1.9, 0.04, 0.01, body), 0, 0.95, -0.255, g);
  at(rbox(0.04, 1.9, 0.55, 0.01, body), -0.48, 0.95, 0, g);
  at(rbox(0.04, 1.9, 0.55, 0.01, body), 0.48, 0.95, 0, g);
  at(rbox(1.0, 0.04, 0.55, 0.01, body), 0, 1.88, 0, g);
  at(rbox(1.0, 0.08, 0.55, 0.01, body), 0, 0.04, 0, g);
  at(rbox(0.04, 1.8, 0.5, 0.01, body), 0, 0.95, 0, g); // divider
  at(rbox(1.06, 0.05, 0.6, 0.01, body), 0, 1.92, 0.01, g); // top moulding
  const inside = new Group();
  inside.name = 'inside';
  g.add(inside);
  at(cyl(0.01, 0.01, 0.42, metal(), 8), -0.24, 1.65, 0, inside).rotation.z = Math.PI / 2;
  ['#f2c14e', '#3f6fa8', '#e8747c', '#ffffff', '#4f9a8a'].forEach((c, i) => at(rbox(0.05, 0.6, 0.36, 0.02, mat(c, 0.9)), -0.4 + i * 0.08, 1.33, 0, inside));
  for (let i = 0; i < 4; i++) at(rbox(0.38, 0.08, 0.3, 0.03, mat(['#ffffff', '#9cc5e8', '#ffffff', '#d9c59a'][i], 0.95)), 0.24, 0.5 + i * 0.25, 0, inside);
  for (const side of [-1, 1]) {
    const door = new Group();
    door.name = 'door';
    door.userData.openAngle = side * -1.7;
    door.position.set(side * 0.48, 0, 0.28);
    at(rbox(0.47, 1.8, 0.03, 0.01, pbr('wood_light', { tint: '#e6c9a3', repeat: [1, 2] })), -side * 0.24, 0.96, 0, door);
    at(cyl(0.012, 0.012, 0.14, metal(), 8), -side * 0.42, 1.0, 0.03, door);
    // Raised panels on the door.
    for (const [y, h] of [[1.38, 0.72], [0.55, 0.72]] as const) {
      const panel = pbr('wood_light', { tint: '#dcb98f', repeat: [1, 1] });
      at(rbox(0.36, h, 0.012, 0.006, panel), -side * 0.24, y, 0.018, door);
    }
    g.add(door);
  }
  return g;
};

/** Woven laundry basket with a lid and clothes inside. */
const laundry: Builder = () => {
  const g = new Group();
  at(cyl(0.18, 0.15, 0.5, pbr('fabric_weave', { repeat: [4, 2], tint: '#d9b77a' }), 16), 0, 0.25, 0, g);
  for (const [c, x] of [['#3f6fa8', -0.05], ['#f2c14e', 0.05]] as const) at(sphere(0.08, mat(c, 0.95)), x, 0.47, 0, g);
  const lid = new Group();
  lid.name = 'door';
  lid.userData.openAngle = -1.3;
  lid.userData.axis = 'x';
  lid.position.set(0, 0.5, -0.18);
  at(cyl(0.19, 0.19, 0.03, pbr('fabric_weave', { repeat: [4, 4], tint: '#c9a56a' }), 16), 0, 0.015, 0.18, lid);
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

/** Standing fan; its "blades" group spins. */
const fan: Builder = () => {
  const g = new Group();
  const fanMat = mat('#e9edf0', 0.4, 0.1);
  at(cyl(0.18, 0.2, 0.04, fanMat, 20), 0, 0.02, 0, g);
  at(cyl(0.02, 0.02, 1.0, fanMat, 10), 0, 0.52, 0, g);
  const head = at(new Group(), 0, 1.08, 0, g);
  at(sphere(0.07, fanMat), 0, 0, -0.05, head);
  const blades = at(new Group(), 0, 0, 0.03, head);
  blades.name = 'blades';
  const bladeMat = new MeshStandardMaterial({ color: '#8cc3e6', roughness: 0.25, transparent: true, opacity: 0.75 });
  for (let i = 0; i < 3; i++) {
    const holder = new Group();
    holder.rotation.z = (i / 3) * Math.PI * 2;
    const blade = at(rbox(0.09, 0.19, 0.008, 0.004, bladeMat), 0, 0.11, 0, holder);
    blade.rotation.y = 0.35;
    blades.add(holder);
  }
  at(cyl(0.03, 0.03, 0.03, fanMat, 12), 0, 0, 0.04, head).rotation.x = Math.PI / 2; // hub cap
  // Wire safety cage (front and back rings with spokes).
  const wire = mat('#dfe3e6', 0.35, 0.5);
  for (const z of [-0.02, 0.09]) at(new Mesh(new TorusGeometry(0.24, 0.004, 4, 32), wire), 0, 0, z, head);
  at(new Mesh(new TorusGeometry(0.12, 0.003, 4, 24), wire), 0, 0, 0.095, head);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const spoke = at(cyl(0.002, 0.002, 0.24, wire, 4), Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.095, head);
    spoke.rotation.z = a - Math.PI / 2;
  }
  return g;
};

const plant: Builder = () => {
  const g = new Group();
  addProp(g, 'potted_plant_02', { size: [0.45, null, 0.45] });
  return g;
};

const sofa: Builder = () => {
  const g = new Group();
  addProp(g, 'sofa_02', { z: 0.05, size: [1.6, null, 0.8] });
  addProp(g, 'throw_pillows_01', { y: 0.42, z: -0.12, size: [0.95, null, null] });
  return g;
};

const bookshelf: Builder = () => {
  const g = new Group();
  // Cube shelf turned to face the room; a few books in it.
  addProp(g, 'wooden_display_shelves_01', { rot: 90, size: [0.35, 1.6, 0.9], stretch: true });
  const colors = ['#8e3b2f', '#c99a3d', '#3f5f7a', '#4f7a52', '#6b4e7a'];
  for (let i = 0; i < 9; i++) at(rbox(0.035, 0.22, 0.18, 0.006, mat(colors[i % colors.length], 0.85)), -0.36 + (i % 3) * 0.045 + Math.floor(i / 3) * 0.29, 0.66 + 0.11, -0.02, g);
  return g;
};

const mirror: Builder = () => {
  const g = new Group();
  at(rbox(0.5, 1.6, 0.06, 0.03, lightWood()), 0, 0.8, 0, g);
  at(rbox(0.42, 1.48, 0.01, 0.01, new MeshStandardMaterial({ color: '#dfeff5', metalness: 0.9, roughness: 0.05 })), 0, 0.82, 0.032, g);
  at(rbox(0.4, 0.04, 0.3, 0.01, lightWood()), 0, 0.02, 0.1, g);
  return g;
};

const rug: Builder = () => {
  const g = new Group();
  at(rbox(1.6, 0.02, 1.1, 0.01, pbr('fabric_linen', { tint: '#e0b277', repeat: [4, 3] })), 0, 0.011, 0, g);
  at(rbox(1.3, 0.022, 0.8, 0.01, pbr('fabric_linen', { tint: '#4f78b0', repeat: [4, 3] })), 0, 0.012, 0, g);
  return g;
};

/** Broom and mop with a bucket, standing in a corner. */
const broomMop: Builder = () => {
  const g = new Group();
  const handle = mat('#b08452', 0.7);
  const s1 = at(cyl(0.013, 0.013, 1.2, handle, 8), -0.12, 0.62, -0.05, g);
  s1.rotation.z = 0.12;
  const bristles = at(new Mesh(new ConeGeometry(0.13, 0.3, 12, 1, true), mat('#6e4b2a', 0.95)), -0.05, 0.12, -0.05, g);
  bristles.rotation.x = Math.PI;
  bristles.scale.z = 0.35;
  const s2 = at(cyl(0.013, 0.013, 1.2, handle, 8), 0.12, 0.62, -0.08, g);
  s2.rotation.z = -0.1;
  at(rbox(0.34, 0.06, 0.12, 0.02, mat('#ecf0f1', 1)), 0.18, 0.05, -0.08, g);
  at(cyl(0.16, 0.13, 0.28, mat('#2e86c1', 0.5), 16), 0.05, 0.14, 0.12, g);
  return g;
};

/**
 * Ironing board with folding legs, the iron standing on its heel at one end and a pile of folded
 * clothes ("pile", shown while there is ironing waiting).
 */
const ironing: Builder = () => {
  const g = new Group();
  const steel = mat('#9aa3ab', 0.4, 0.6);
  // The board: a long padded top, rounded at the front.
  at(rbox(1.15, 0.03, 0.36, 0.015, pbr('fabric_weave', { tint: '#9fc5e8', repeat: [3, 1] })), 0, 0.86, 0, g);
  at(rbox(1.16, 0.012, 0.37, 0.005, steel), 0, 0.84, 0, g);
  // Crossed legs seen from the side.
  for (const s of [-1, 1]) {
    const leg = at(cyl(0.012, 0.012, 1.0, steel, 8), 0.0, 0.43, s * 0.14, g);
    leg.rotation.z = 0.62;
    const leg2 = at(cyl(0.012, 0.012, 1.0, steel, 8), 0.0, 0.43, s * 0.14, g);
    leg2.rotation.z = -0.62;
  }
  for (const x of [-0.29, 0.29]) at(rbox(0.04, 0.02, 0.34, 0.008, mat('#2c2c2c', 0.8)), x, 0.01, 0, g);
  // The iron: a white body on a shiny soleplate, standing on its heel, and its cord.
  const iron = new Group();
  at(rbox(0.22, 0.02, 0.11, 0.01, mat('#d5d8dc', 0.2, 0.9)), 0, 0.01, 0, iron);
  at(rbox(0.2, 0.07, 0.1, 0.035, mat('#f4f6f7', 0.35)), -0.01, 0.055, 0, iron);
  at(rbox(0.12, 0.025, 0.03, 0.012, mat('#2e86c1', 0.4)), -0.02, 0.11, 0, iron);
  iron.rotation.z = Math.PI / 2;
  iron.position.set(0.47, 0.98, 0.04);
  g.add(iron);
  at(cyl(0.004, 0.004, 0.9, mat('#1c1c1c', 0.6), 6), 0.5, 0.5, 0.12, g).rotation.x = 0.15;
  // Clothes waiting to be ironed.
  const pile = new Group();
  pile.name = 'pile';
  const colors = ['#f4f6f7', '#85c1e9', '#f5cba7', '#abebc6'];
  colors.forEach((c, i) => at(rbox(0.34, 0.035, 0.27, 0.015, pbr('fabric_linen', { tint: c })), -0.32 + (i % 2) * 0.02, 0.89 + i * 0.035, 0, pile));
  g.add(pile);
  return g;
};

/** Front-loading washing machine. */
const washer: Builder = () => {
  const g = new Group();
  at(rbox(0.6, 0.85, 0.6, 0.04, white()), 0, 0.425, 0, g);
  at(rbox(0.58, 0.08, 0.04, 0.01, mat('#d5d8dc', 0.4)), 0, 0.78, 0.29, g);
  const door = new Group();
  door.name = 'door';
  door.userData.openAngle = -1.4;
  door.position.set(-0.17, 0.42, 0.3);
  const ring = at(new Mesh(new TorusGeometry(0.17, 0.03, 10, 28), metal()), 0.17, 0, 0.01, door);
  ring.rotation.y = 0;
  at(new Mesh(new CircleGeometry(0.16, 28), new MeshStandardMaterial({ color: '#7fa7bd', transparent: true, opacity: 0.6, roughness: 0.05 })), 0.17, 0, 0.012, door);
  g.add(door);
  for (let i = 0; i < 3; i++) at(cyl(0.018, 0.018, 0.02, mat('#1c1c1c'), 10), 0.12 + i * 0.06, 0.78, 0.31, g).rotation.x = Math.PI / 2;
  return g;
};

/** A wide plastic tub with a washboard leaning in it. */
const tub: Builder = () => {
  const g = new Group();
  at(cyl(0.3, 0.24, 0.28, mat('#e67e22', 0.6), 20), 0, 0.14, 0, g);
  at(cyl(0.27, 0.27, 0.01, new MeshStandardMaterial({ color: '#cfe8f2', transparent: true, opacity: 0.7, roughness: 0.05 }), 20), 0, 0.22, 0, g);
  const board = at(rbox(0.3, 0.5, 0.03, 0.01, mat('#c9a36b', 0.8)), 0.05, 0.3, -0.12, g);
  board.rotation.x = -0.35;
  const soap = at(rbox(0.08, 0.04, 0.05, 0.01, mat('#58d68d', 0.4)), -0.2, 0.3, 0.1, g);
  soap.rotation.y = 0.4;
  return g;
};

/** A folding steel drying rack; its "clothes" group shows what is hanging out to dry. */
const dryingRack: Builder = () => {
  const g = new Group();
  const steel = mat('#c0c6cc', 0.3, 0.7);
  for (const x of [-0.65, 0.65]) {
    for (const z of [-0.25, 0.25]) {
      const leg = at(cyl(0.012, 0.012, 1.25, steel, 6), x, 0.62, z * 0.6, g);
      leg.rotation.x = z > 0 ? -0.22 : 0.22;
    }
  }
  for (const z of [-0.12, 0, 0.12]) at(cyl(0.008, 0.008, 1.35, steel, 6), 0, 1.2, z, g).rotation.z = Math.PI / 2;
  const clothes = new Group();
  clothes.name = 'clothes';
  const colors = ['#e74c3c', '#3498db', '#f1c40f', '#ecf0f1', '#2ecc71', '#9b59b6', '#34495e', '#f39c12'];
  colors.forEach((c, i) => {
    const shirt = at(rbox(0.22, 0.34, 0.01, 0.005, mat(c, 0.95)), -0.55 + (i % 4) * 0.36, 1.02, -0.12 + Math.floor(i / 4) * 0.24, clothes);
    shirt.rotation.y = 0.05;
    shirt.visible = false;
  });
  g.add(clothes);
  return g;
};

/** Split air conditioner on the wall. */
const ac: Builder = () => {
  const g = new Group();
  at(rbox(0.85, 0.28, 0.22, 0.05, white()), 0, 2.15, -0.02, g);
  at(rbox(0.7, 0.03, 0.05, 0.01, mat('#bdc3c7', 0.4)), 0, 2.04, 0.08, g);
  at(sphere(0.01, new MeshStandardMaterial({ color: '#2ecc71', emissive: '#2ecc71', emissiveIntensity: 0.8 })), 0.33, 2.18, 0.1, g);
  return g;
};

const BUILDERS: Record<string, Builder> = {
  broom_mop: broomMop,
  ironing,
  washer,
  tub,
  drying_rack: dryingRack,
  ac,
  fan,
  plant,
  sofa,
  bookshelf,
  mirror,
  rug,
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
