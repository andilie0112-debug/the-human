import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, type Scene } from 'three';
import { pbr } from '../engine/pbr';
import { HAIRSTYLES, HUMAN_SKIN_TONES, HumanModel } from '../characters/humanModel';
import { indoHouse } from '../world/buildings';
import { mergeStatic } from './mergeStatic';
import { quality } from '../engine/graphics';
import { Pedestrians } from '../world/pedestrians';
import { Traffic } from '../world/traffic';
import type { RoomLayout } from '../data/objectCatalog';

// What you see around the home without going out: the gang in front with motorbikes and
// neighbours walking past, the houses next door and across the street, and neighbours chatting
// on their terraces. Purely visual; the open world is still entered through the front door.

const WALLS = ['#e8d8b8', '#cfe0d4', '#f0c9a6'];

export interface Surroundings {
  update: (dt: number) => void;
  dispose: () => void;
}

export function createSurroundings(scene: Scene, layout: RoomLayout): Surroundings {
  if (layout.setting === 'apartment') return apartmentView(scene, layout);
  const root = new Group();
  scene.add(root);
  const land = layout.setting === 'land';
  const hw = layout.width / 2;
  const hd = layout.depth / 2;
  const roadZ = hd + 6.2; // yard, then the road in front

  // Grass ground, front yard paving, road and sidewalks.
  const plane = (w: number, d: number, x: number, y: number, z: number, m: ReturnType<typeof pbr>): void => {
    const p = new Mesh(new PlaneGeometry(w, d), m);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, y, z);
    p.receiveShadow = true;
    root.add(p);
  };
  plane(140, 140, 0, -0.07, 0, pbr('grass', { repeat: [60, 60], tint: '#b9c99a' }));
  if (land) plane(14, 12, 0, -0.06, 0, pbr('concrete', { repeat: [6, 5], tint: '#9c7b5a' })); // bare soil of the plot
  else plane(layout.width + 0.6, roadZ - hd - 3.6, 0, -0.05, hd + (roadZ - hd - 3.6) / 2, pbr('paving', { repeat: [layout.width / 1.5, 2] }));
  plane(140, 6, 0, -0.04, roadZ, pbr('asphalt', { repeat: [40, 2] }));
  for (const s of [-1, 1]) plane(140, 1.4, 0, -0.03, roadZ + s * 3.7, pbr('concrete', { repeat: [60, 1], tint: '#c8c2b8' }));
  // Painted centre line.
  const line = new Mesh(new PlaneGeometry(140, 0.12), pbr('concrete', { tint: '#f4f1e8' }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, -0.035, roadZ);
  root.add(line);

  // Houses next door (same row) and across the road, slightly varied.
  const rand = (i: number): number => ((Math.sin(i * 91.7) + 1) / 2) % 1;
  let i = 0;
  for (const side of [-1, 1]) {
    // On the family land the nearest neighbours are further away.
    let x = side * (hw + (land ? 7 : 1.2));
    for (let k = 0; k < 4; k++) {
      const w = 6 + rand(++i) * 3;
      const house = indoHouse({ w, d: 6 + rand(++i) * 2, wall: WALLS[i % WALLS.length], roof: rand(++i) < 0.25 ? 'seng' : 'genteng', fence: true, floors: rand(++i) < 0.2 ? 2 : 1, shop: k === 1 && side === 1 });
      house.position.set(x + (side * w) / 2, 0, -0.5);
      root.add(house);
      x += side * (w + 1.0);
    }
  }
  // Across the road only to the sides, so the camera keeps a clear view of the home.
  for (const k of [-4, -3, -2, 2, 3, 4]) {
    const w = 6.5 + rand(++i) * 2;
    const house = indoHouse({ w, d: 6.5, wall: WALLS[(i + 3) % WALLS.length], roof: rand(++i) < 0.2 ? 'seng' : 'genteng', fence: true, floors: rand(++i) < 0.25 ? 2 : 1 });
    house.position.set(k * 9, 0, roadZ + 9);
    house.rotation.y = Math.PI;
    root.add(house);
  }

  // One mesh per material for all the static scenery (few draw calls).
  mergeStatic(root);
  // Scenery receives shadows but does not cast them (the shadow pass stays small).
  root.traverse((o) => {
    o.castShadow = false;
  });

  // Street life: traffic on the road, people on both sidewalks.
  const street = new Group();
  street.position.z = roadZ;
  root.add(street);
  // How much street life depends on the graphics setting (phones stay smooth on Low).
  const q = quality.current;
  const traffic = new Traffic(street as unknown as Scene, q === 'low' ? 2 : 3);
  const walkers = new Pedestrians(street as unknown as Scene, q === 'low' ? 0 : 2, [-3.7, 3.7], 40);
  const neighbours = q === 'high' ? 2 : q === 'medium' ? 1 : 0;

  // Neighbours chatting on the terraces next door.
  const chatting: HumanModel[] = [];
  for (const [x, z, ry] of ([[hw + 4.2, hd + 0.4, -0.5], [-(hw + 4), hd + 0.3, 0.4]] as const).slice(0, neighbours)) {
    const body = Math.random() < 0.5 ? 'male' : 'female';
    void HumanModel.load({
      body,
      skinTone: HUMAN_SKIN_TONES[Math.floor(Math.random() * HUMAN_SKIN_TONES.length)],
      hair: HAIRSTYLES[body][0],
      hairColor: '#1a1310',
      hijab: body === 'female' && Math.random() < 0.5,
      hijabColor: '#3f6fa8',
      shirtColor: ['#e8747c', '#4f9a8a', '#f2c14e', '#ffffff'][Math.floor(Math.random() * 4)],
      pantsColor: '#2f3a52',
      shoesColor: '#8a5a3a',
      topStyle: Math.random() < 0.4 ? 'batik' : 'kaos',
      bottomStyle: body === 'male' && Math.random() < 0.5 ? 'sarung' : body === 'female' ? 'rokPanjang' : 'chino',
      shoeStyle: 'sandal',
    }).then((m) => {
      m.root.position.set(x, 0.36, z);
      m.root.rotation.y = ry;
      m.play('Idle_Talking_Loop', 0);
      root.add(m.root);
      chatting.push(m);
    });
  }

  return {
    update: (dt) => {
      traffic.update(dt, walkers.positions());
      walkers.update(dt);
      for (const m of chatting) m.update(dt);
    },
    dispose: () => {
      traffic.dispose();
      walkers.dispose();
      for (const m of chatting) m.dispose();
      root.removeFromParent();
    },
  };
}

/** A studio high up in a tower: a balcony rail, a city skyline and the street far below. */
function apartmentView(scene: Scene, layout: RoomLayout): Surroundings {
  const root = new Group();
  scene.add(root);
  const hd = layout.depth / 2;
  // Balcony slab and glass rail in front of the room.
  const slab = new Mesh(new PlaneGeometry(layout.width + 0.4, 1.6), pbr('tiles_cream', { repeat: [5, 1.3] }));
  slab.rotation.x = -Math.PI / 2;
  slab.position.set(0, -0.02, hd + 0.9);
  root.add(slab);
  const rail = new Mesh(new PlaneGeometry(layout.width + 0.4, 1.0), new MeshStandardMaterial({ color: '#bcd6e2', transparent: true, opacity: 0.35, roughness: 0.05 }));
  rail.position.set(0, 0.5, hd + 1.7);
  root.add(rail);
  // The tower's own facade below and around the flat.
  const facade = new Mesh(new BoxGeometry(layout.width + 8, 40, layout.depth + 4), pbr('plaster', { tint: '#d8d2c4', repeat: [6, 20] }));
  facade.position.set(0, -20.2, -1);
  root.add(facade);
  // City below: ground, roads and a skyline of towers at different heights.
  const ground = new Mesh(new PlaneGeometry(400, 400), pbr('asphalt', { repeat: [80, 80], tint: '#8d8a86' }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -40;
  root.add(ground);
  const colors = ['#c9c3b6', '#9fb3c4', '#d8cdb8', '#a9b2a0', '#e1dbd0'];
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2 + Math.sin(k) * 0.2;
    const r = 45 + (k % 5) * 18;
    const h = 20 + ((k * 37) % 60);
    const tower = new Mesh(new BoxGeometry(10 + (k % 3) * 4, h, 10 + (k % 4) * 3), pbr('plaster', { tint: colors[k % colors.length], repeat: [2, 6] }));
    tower.position.set(Math.cos(a) * r, -40 + h / 2, Math.sin(a) * r);
    root.add(tower);
  }
  mergeStatic(root);
  return { update: () => undefined, dispose: () => root.removeFromParent() };
}
