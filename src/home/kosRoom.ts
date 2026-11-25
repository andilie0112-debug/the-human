import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Scene,
  type Material,
  type Object3D,
} from 'three';
import { objectById, resolveObjectId, type ObjectDef, type RoomLayout } from '../data/objectCatalog';
import { buildObjectModel } from './objectModels';
import { NavGrid } from './navGrid';
import { at, cyl, mat, plankTexture, rbox, sphere, tileTexture } from './primitives';

// The kos room: built from data (src/data/rooms/kos.json + objects.json), with life-sim wall
// cutaway, smart-object instances, a navigation grid and day/night lighting.

export interface ObjectInstance {
  id: string;
  def: ObjectDef;
  group: Group;
  x: number;
  z: number;
  /** Rotation around Y in radians. */
  rot: number;
}

export interface KosRoom {
  scene: Scene;
  floor: Mesh;
  nav: NavGrid;
  instances: Map<string, ObjectInstance>;
  /** Meshes that can be tapped (object parts and the floor). */
  pickables: Object3D[];
  updateCutaway: (dirX: number, dirZ: number) => void;
  setNight: (night: boolean) => void;
  fanBlades: Group;
  dispose: () => void;
}

interface WallSpec {
  /** Segment start/end on the floor. */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Direction the wall faces towards the camera side; it is cut away when the camera looks from there. */
  nx: number;
  nz: number;
  thickness: number;
  material: Material;
  /** Door openings as [from, to] distances along the segment. */
  doors?: [number, number][];
}

const WALL_H = 2.6;
const DOOR_H = 2.1;
const STUB_H = 0.25;
const AGENT_RADIUS = 0.22;

export function createKosRoom(layout: RoomLayout, religionId: string): KosRoom {
  const scene = new Scene();
  const W = layout.width;
  const D = layout.depth;
  const pickables: Object3D[] = [];

  // Lights
  const hemi = new HemisphereLight('#fff6e8', '#8a6a4a', 1.1);
  scene.add(hemi);
  const sun = new DirectionalLight('#ffe2b8', 2.6);
  sun.position.set(6, 9, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  const sc = sun.shadow.camera;
  sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 1; sc.far = 30;
  scene.add(sun);
  const lamp = new PointLight('#ffc27a', 0, 12, 1.4);
  lamp.position.set(0, 2.4, -0.3);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  scene.add(lamp);
  const bathLamp = new PointLight('#e8f2ff', 0, 5, 1.6);
  bathLamp.position.set(2.3, 2.3, -1.7);
  scene.add(bathLamp);

  const ground = new Mesh(new PlaneGeometry(80, 80), mat('#8fae6e', 1));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  scene.add(ground);

  // Floors: wood in the room, tiles in the bathroom.
  const floorTex = plankTexture(3, 3);
  const floor = rbox(W + 0.28, 0.12, D + 0.28, 0.04, new MeshStandardMaterial({ map: floorTex, roughness: 0.65 }));
  floor.userData.floor = true;
  at(floor, 0, -0.06, 0, scene);
  pickables.push(floor);
  const b = layout.bathroom;
  const tileTex = tileTexture(3);
  const bathFloor = rbox(b.x1 - b.x0, 0.01, b.z1 - b.z0, 0.002, new MeshStandardMaterial({ map: tileTex, roughness: 0.35 }));
  bathFloor.userData.floor = true;
  at(bathFloor, (b.x0 + b.x1) / 2, 0.006, (b.z0 + b.z1) / 2, scene);
  pickables.push(bathFloor);

  // Walls
  const outer = mat('#f1e4cf', 0.9);
  const accent = mat('#9cc5b4', 0.9);
  const bathWall = mat('#e4eef0', 0.6);
  const hw = W / 2;
  const hd = D / 2;
  const specs: WallSpec[] = [
    { ax: -hw, az: -hd, bx: hw, bz: -hd, nx: 0, nz: -1, thickness: 0.14, material: outer },
    { ax: -hw, az: -hd, bx: -hw, bz: hd, nx: -1, nz: 0, thickness: 0.14, material: accent },
    { ax: hw, az: -hd, bx: hw, bz: hd, nx: 1, nz: 0, thickness: 0.14, material: accent },
    { ax: -hw, az: hd, bx: hw, bz: hd, nx: 0, nz: 1, thickness: 0.14, material: outer, doors: [[layout.frontDoorX[0] + hw, layout.frontDoorX[1] + hw]] },
    { ax: b.x0, az: b.z1, bx: b.x1, bz: b.z1, nx: 0, nz: 1, thickness: 0.1, material: bathWall, doors: [[b.doorX0 - b.x0, b.doorX1 - b.x0]] },
    { ax: b.x0, az: b.z0, bx: b.x0, bz: b.z1, nx: -1, nz: 0, thickness: 0.1, material: bathWall },
  ];

  const nav = new NavGrid(W, D, 0.1);
  nav.blockBorder(AGENT_RADIUS);

  interface BuiltWall {
    full: Group;
    stub: Group;
    nx: number;
    nz: number;
  }
  const walls: BuiltWall[] = [];
  for (const s of specs) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const ux = (s.bx - s.ax) / len;
    const uz = (s.bz - s.az) / len;
    // Exterior walls sit just outside the floor edge; interior walls are centred on their line.
    const isExterior = s.thickness > 0.12;
    const off = isExterior ? s.thickness / 2 : 0;
    const full = new Group();
    const stub = new Group();
    stub.visible = false;
    const pieces: [number, number, number, number][] = []; // [from, to, y0, y1]
    let cursor = 0;
    for (const [d0, d1] of s.doors ?? []) {
      pieces.push([cursor, d0, 0, WALL_H]);
      pieces.push([d0, d1, DOOR_H, WALL_H]); // lintel
      cursor = d1;
    }
    pieces.push([cursor, len, 0, WALL_H]);
    for (const [d0, d1, y0, y1] of pieces) {
      const l = d1 - d0;
      if (l <= 0.001) continue;
      // Exterior pieces touching a corner are extended by the wall thickness to close the corner.
      const extA = isExterior && d0 === 0 ? s.thickness : 0;
      const extB = isExterior && d1 === len ? s.thickness : 0;
      const mid = (d0 + d1) / 2 + (extB - extA) / 2;
      const cx = s.ax + ux * mid + s.nx * off;
      const cz = s.az + uz * mid + s.nz * off;
      const along = l + extA + extB;
      const w = Math.abs(ux) > 0.5 ? along : s.thickness;
      const dd = Math.abs(ux) > 0.5 ? s.thickness : along;
      at(rbox(w, y1 - y0, dd, 0.02, s.material), cx, (y0 + y1) / 2, cz, full);
      if (y0 === 0) at(rbox(w, STUB_H, dd, 0.02, s.material), cx, STUB_H / 2, cz, stub);
      if (y0 === 0 && !isExterior) nav.blockRect(cx, cz, w, dd, 0, AGENT_RADIUS);
    }
    scene.add(full, stub);
    walls.push({ full, stub, nx: s.nx, nz: s.nz });
  }

  // Window above the desk on the back wall, and a door leaf in the front doorway.
  const back = walls[0].full;
  const windowMat = new MeshStandardMaterial({ color: '#cfe8ff', emissive: '#bfe0ff', emissiveIntensity: 0.9 });
  at(new Mesh(new PlaneGeometry(1.3, 1.0), windowMat), -0.3, 1.6, -hd + 0.005, back);
  const frameMat = mat('#ffffff', 0.5);
  for (const [w, h, x, y] of [[1.45, 0.07, -0.3, 2.13], [1.45, 0.09, -0.3, 1.07], [0.07, 1.1, -1.0, 1.6], [0.07, 1.1, 0.4, 1.6], [0.04, 1.0, -0.3, 1.6]] as const) {
    at(rbox(w, h, 0.06, 0.02, frameMat), x, y, -hd + 0.03, back);
  }
  const curtain = mat('#e58b5a', 0.95);
  at(rbox(0.3, 1.25, 0.06, 0.03, curtain), -1.15, 1.55, -hd + 0.08, back);
  at(rbox(0.3, 1.25, 0.06, 0.03, curtain), 0.55, 1.55, -hd + 0.08, back);
  const doorLeaf = rbox(0.06, DOOR_H - 0.02, layout.frontDoorX[1] - layout.frontDoorX[0] - 0.04, 0.02, mat('#8a5a3a', 0.6));
  doorLeaf.rotation.y = Math.PI / 2;
  at(doorLeaf, (layout.frontDoorX[0] + layout.frontDoorX[1]) / 2, DOOR_H / 2, hd + 0.07, walls[3].full);
  const bathDoor = rbox(0.04, DOOR_H - 0.05, b.doorX1 - b.doorX0 - 0.04, 0.02, mat('#d8cfc0', 0.6));
  bathDoor.rotation.y = Math.PI / 2 - 1.2; // left ajar
  at(bathDoor, b.doorX0 + 0.05, DOOR_H / 2, b.z1 + 0.32, scene);

  // Ceiling lamp shade (decorative).
  const shadeMat = new MeshStandardMaterial({ color: '#fff1d6', emissive: '#ffcf8a', emissiveIntensity: 0.1 });
  const shade = cyl(0.18, 0.26, 0.16, shadeMat);
  at(shade, 0, 2.5, -0.3, scene);

  // Decorations: standing fan by the bed and a plant in the corner.
  const fan = new Group();
  const fanMat = mat('#e9edf0', 0.4, 0.1);
  at(cyl(0.18, 0.2, 0.04, fanMat, 20), 0, 0.02, 0, fan);
  at(cyl(0.02, 0.02, 1.0, fanMat, 10), 0, 0.52, 0, fan);
  const fanHead = at(new Group(), 0, 1.08, 0, fan);
  at(sphere(0.07, fanMat), 0, 0, -0.05, fanHead);
  const fanBlades = at(new Group(), 0, 0, 0.03, fanHead);
  for (let i = 0; i < 3; i++) {
    const holder = new Group();
    holder.rotation.z = (i / 3) * Math.PI * 2;
    at(rbox(0.08, 0.2, 0.01, 0.004, mat('#7fb6d6', 0.4)), 0, 0.11, 0, holder);
    fanBlades.add(holder);
  }
  fan.rotation.y = 0.9;
  at(fan, -1.55, 0, -2.2, scene);
  nav.blockRect(-1.55, -2.2, 0.4, 0.4, 0, AGENT_RADIUS * 0.5);
  const plant = new Group();
  at(cyl(0.16, 0.12, 0.3, mat('#c96f4a', 0.8)), 0, 0.15, 0, plant);
  for (const [x, y, z, r] of [[0, 0.5, 0, 0.2], [0.1, 0.65, 0.05, 0.14], [-0.1, 0.62, -0.04, 0.15], [0.02, 0.8, -0.02, 0.11]]) at(sphere(r, mat('#4f9a52', 0.8)), x, y, z, plant);
  at(plant, -2.65, 0, 2.15, scene);
  nav.blockRect(-2.65, 2.15, 0.4, 0.4, 0, AGENT_RADIUS);

  // Smart objects
  const instances = new Map<string, ObjectInstance>();
  for (const p of layout.objects) {
    const def = objectById(resolveObjectId(p.objectId, religionId));
    if (!def) continue;
    const group = buildObjectModel(def.model);
    const rot = (p.rot * Math.PI) / 180;
    const z = def.againstWall ? -hd + def.footprint[1] / 2 + 0.02 : p.z;
    group.position.set(p.x, 0, z);
    group.rotation.y = rot;
    group.userData.instanceId = p.id;
    group.traverse((o) => {
      if (o instanceof Mesh) {
        o.userData.instanceId = p.id;
        pickables.push(o);
      }
    });
    scene.add(group);
    instances.set(p.id, { id: p.id, def, group, x: p.x, z, rot });
    if (!def.walkOn) nav.blockRect(p.x, z, def.footprint[0], def.footprint[1], p.rot, AGENT_RADIUS * 0.7);
  }

  const daySky = new Color('#bfe0f5');
  const nightSky = new Color('#1b2540');
  const setNight = (night: boolean): void => {
    scene.background = night ? nightSky : daySky;
    sun.intensity = night ? 0.25 : 2.6;
    sun.color.set(night ? '#8fa8ff' : '#ffe2b8');
    hemi.intensity = night ? 0.35 : 1.1;
    lamp.intensity = night ? 9 : 0;
    bathLamp.intensity = night ? 3 : 0;
    windowMat.color.set(night ? '#1d2b4f' : '#cfe8ff');
    windowMat.emissive.set(night ? '#0d1530' : '#bfe0ff');
    shadeMat.emissiveIntensity = night ? 1.6 : 0.1;
    (ground.material as MeshStandardMaterial).color.set(night ? '#3a4a3a' : '#8fae6e');
  };
  setNight(false);

  const updateCutaway = (dirX: number, dirZ: number): void => {
    const len = Math.hypot(dirX, dirZ) || 1;
    for (const w of walls) {
      const cut = (dirX * w.nx + dirZ * w.nz) / len > 0.3;
      w.full.visible = !cut;
      w.stub.visible = cut;
    }
  };

  const dispose = (): void => {
    scene.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        const mats: Material[] = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
    floorTex.dispose();
    tileTex.dispose();
  };

  return { scene, floor, nav, instances, pickables, updateCutaway, setNight, fanBlades, dispose };
}
