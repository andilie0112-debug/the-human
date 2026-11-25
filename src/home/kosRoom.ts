import { quality } from '../engine/graphics';
import { mergeStatic } from './mergeStatic';
import { contactShadow } from './contactShadow';
import {
  Color,
  MeshBasicMaterial,
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
import type { Placement } from '../sim/home';
import { buildObjectModel } from './objectModels';
import { NavGrid } from './navGrid';
import { at, cyl, mat, rbox, sphere } from './primitives';
import { pbr } from '../engine/pbr';
import { whenPropsReady } from '../engine/props';

const metal = (): MeshStandardMaterial => mat('#9aa3ab', 0.35, 0.6);

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
  /** Turns an object's visual state on (fridge "open", stove "cooking"/"warm", "water", "screen", "plate"...) or off (null). `foodColor` tints food props. */
  setProp: (instanceId: string, prop: string | null, foodColor?: string) => void;
  /** Rebuilds the fridge shelves from the inventory: [color, shape] per item unit. */
  setFridgeContents: (items: { color: string; shape: string }[]) => void;
  /** Animates doors and effects; `character` is the character's floor position for automatic doors. */
  update: (dt: number, character: { x: number; z: number } | null, forceFrontDoorOpen: boolean) => void;
  /** Point just outside the front door (for leaving the house). */
  outside: { x: number; z: number };
  /** Called when a door starts opening (true) or closing (false). */
  onDoor: ((opening: boolean) => void) | null;
  floor: Mesh;
  nav: NavGrid;
  instances: Map<string, ObjectInstance>;
  /** Meshes that can be tapped (object parts and the floor). */
  pickables: Object3D[];
  updateCutaway: (dirX: number, dirZ: number) => void;
  setNight: (night: boolean) => void;
  dispose: () => void;
  /** Rebuilds the furniture (build mode, moving house). */
  setPlacements: (placements: Placement[]) => void;
  layout: RoomLayout;
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

/** Flat or wall-mounted objects get no contact shadow. */
const NO_CONTACT_SHADOW = new Set(['rug', 'mat', 'sajadah', 'doorway', 'cross_shelf', 'rosary_shelf', 'shower']);

const WALL_H = 2.6;
const DOOR_H = 2.1;
const STUB_H = 0.25;
const AGENT_RADIUS = 0.22;

export function createKosRoom(layout: RoomLayout, initialPlacements: Placement[], religionId: string): KosRoom {
  const scene = new Scene();
  const W = layout.width;
  const D = layout.depth;
  const pickables: Object3D[] = [];

  // Lights
  const hemi = new HemisphereLight('#fff6e8', '#8a6a4a', 0.6);
  scene.add(hemi);
  const sun = new DirectionalLight('#ffe2b8', 3.0);
  sun.position.set(6, 9, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(quality.extraShadows ? 2048 : 1024);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4; // soft shadow edges
  const sc = sun.shadow.camera;
  sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 1; sc.far = 30;
  scene.add(sun);
  const lamp = new PointLight('#ffc27a', 0, 12, 1.4);
  lamp.position.set(0, 2.4, -0.3);
  // A point-light shadow renders the room six more times: only on High, and only at night.
  lamp.castShadow = false;
  lamp.shadow.mapSize.set(512, 512);
  scene.add(lamp);
  const bathLamp = new PointLight('#e8f2ff', 0, 5, 1.6);
  bathLamp.position.set((layout.bathroom.x0 + layout.bathroom.x1) / 2, 2.3, (layout.bathroom.z0 + layout.bathroom.z1) / 2);
  scene.add(bathLamp);

  // The ground, street and neighbours around the home come from surroundings.ts.

  // Floors: wood in the room, tiles in the bathroom.
  // Ceramic floor tiles (40 cm), plastered and painted walls, tiled bathroom: scanned CC0 textures.
  const floorKind = layout.floor ?? 'tile';
  const floorMat =
    floorKind === 'wood'
      ? pbr('wood_light', { repeat: [(W + 0.28) / 1.2, (D + 0.28) / 2.4], tint: '#e8cfae' })
      : floorKind === 'concrete'
        ? pbr('concrete', { repeat: [(W + 0.28) / 2, (D + 0.28) / 2], tint: '#b9b4ab' })
        : pbr('floor_tile', { repeat: [(W + 0.28) / 1.6, (D + 0.28) / 1.6], tint: '#f3ece0', roughness: 0.55 });
  const floor = rbox(W + 0.28, 0.12, D + 0.28, 0.04, floorMat);
  floor.userData.floor = true;
  at(floor, 0, -0.06, 0, scene);
  pickables.push(floor);
  const b = layout.bathroom;
  const bathFloor = rbox(b.x1 - b.x0, 0.01, b.z1 - b.z0, 0.002, pbr('bath_floor', { repeat: [(b.x1 - b.x0) / 1.2, (b.z1 - b.z0) / 1.2], roughness: 0.4 }));
  bathFloor.userData.floor = true;
  at(bathFloor, (b.x0 + b.x1) / 2, 0.006, (b.z0 + b.z1) / 2, scene);
  pickables.push(bathFloor);

  // Walls
  // Plywood (triplek) walls for the bedeng on the family land; plaster everywhere else.
  const plywood = layout.walls === 'plywood';
  const outer = plywood ? pbr('wood_light', { tint: '#d9b98f', repeat: [3, 1] }) : pbr('plaster', { tint: '#f6ead6', repeat: [5, 3], normalScale: 0.35 });
  const accent = plywood ? pbr('wood_light', { tint: '#c9a87c', repeat: [3, 1] }) : pbr('plaster', { tint: '#a9cfbf', repeat: [5, 3], normalScale: 0.35 });
  const bathWall = pbr('bath_wall', { repeat: [3, 4], roughness: 0.35 });
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
  const curtain = pbr('fabric_linen', { tint: '#f0a57a' });
  at(rbox(0.3, 1.25, 0.06, 0.03, curtain), -1.15, 1.55, -hd + 0.08, back);
  at(rbox(0.3, 1.25, 0.06, 0.03, curtain), 0.55, 1.55, -hd + 0.08, back);
  // Hinged doors: the pivot sits at the hinge, the leaf extends along +x.
  const frontW = layout.frontDoorX[1] - layout.frontDoorX[0];
  const frontPivot = new Group();
  frontPivot.position.set(layout.frontDoorX[0], 0, hd + 0.02);
  at(rbox(frontW - 0.03, DOOR_H - 0.02, 0.05, 0.02, pbr('wood_dark', { tint: '#c89a70' })), frontW / 2, DOOR_H / 2, 0, frontPivot);
  at(sphere(0.03, mat('#c9a227', 0.3, 0.6)), frontW - 0.1, 1.0, -0.05, frontPivot);
  scene.add(frontPivot);
  const bathW = b.doorX1 - b.doorX0;
  const bathPivot = new Group();
  bathPivot.position.set(b.doorX0, 0, b.z1);
  at(rbox(bathW - 0.03, DOOR_H - 0.05, 0.04, 0.02, mat('#d8cfc0', 0.6)), bathW / 2, DOOR_H / 2, 0, bathPivot);
  at(sphere(0.025, metal()), bathW - 0.08, 1.0, 0.04, bathPivot);
  scene.add(bathPivot);
  const doors = [
    { pivot: frontPivot, x: (layout.frontDoorX[0] + layout.frontDoorX[1]) / 2, z: hd, angle: 0, open: -1.6, wall: walls[3], target: 0 },
    { pivot: bathPivot, x: (b.doorX0 + b.doorX1) / 2, z: b.z1, angle: 0, open: 1.5, wall: walls[4], target: 0 },
  ];

  // Ceiling lamp shade (decorative).
  const shadeMat = new MeshStandardMaterial({ color: '#fff1d6', emissive: '#ffcf8a', emissiveIntensity: 0.1 });
  const shade = cyl(0.18, 0.26, 0.16, shadeMat);
  at(shade, 0, 2.5, -0.3, scene);

  // Smart objects: rebuilt whenever the furniture changes (build mode, moving house).
  const instances = new Map<string, ObjectInstance>();
  const floorPickables = [...pickables];
  const staticNav = nav.snapshot();
  const setPlacements = (placements: Placement[]): void => {
    for (const inst of instances.values()) {
      scene.remove(inst.group);
      inst.group.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
    }
    instances.clear();
    pickables.length = 0;
    pickables.push(...floorPickables);
    nav.restore(staticNav);
    for (const p of placements) {
      const def = objectById(resolveObjectId(p.objectId, religionId));
      if (!def) continue;
      const group = buildObjectModel(def.model);
      mergeStatic(group);
      if (!NO_CONTACT_SHADOW.has(def.model)) group.add(contactShadow(def.footprint[0], def.footprint[1], def.model === 'plant' || def.model === 'fan' ? 0.35 : 0.5));
      group.traverse((o) => {
        if (o.name === 'inside') mergeStatic(o);
      });
      const rot = (p.rot * Math.PI) / 180;
      const z = def.againstWall ? -hd + def.footprint[1] / 2 + 0.02 : p.z;
      group.position.set(p.x, 0, z);
      group.rotation.y = rot;
      group.userData.instanceId = p.id;
      group.traverse((o) => {
        if (o instanceof Mesh && !o.userData.noPick) {
          o.userData.instanceId = p.id;
          pickables.push(o);
          // Small parts do not cast shadows (each caster is another draw call).
          if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
          if ((o.geometry.boundingSphere?.radius ?? 1) * Math.max(o.scale.x, o.scale.y, o.scale.z) < 0.15) o.castShadow = false;
        }
      });
      scene.add(group);
      instances.set(p.id, { id: p.id, def, group, x: p.x, z, rot });
      // Realistic models arrive a moment later: make them tappable too.
      whenPropsReady(group, (holder) => {
        if (instances.get(p.id)?.group !== group) return;
        holder.traverse((o) => {
          if (o instanceof Mesh) {
            o.userData.instanceId = p.id;
            pickables.push(o);
          }
        });
      });
      if (!def.walkOn) nav.blockRect(p.x, z, def.footprint[0], def.footprint[1], p.rot, AGENT_RADIUS * 0.7);
    }
    result.setFridgeContents(lastFridge);
  };

  const daySky = new Color('#bfe0f5');
  const nightSky = new Color('#1b2540');
  const setNight = (night: boolean): void => {
    scene.background = night ? nightSky : daySky;
    sun.intensity = night ? 0.25 : 3.0;
    sun.color.set(night ? '#8fa8ff' : '#ffe2b8');
    hemi.intensity = night ? 0.25 : 0.6;
    scene.environmentIntensity = night ? 0.1 : 0.3;
    lamp.intensity = night ? 9 : 0;
    lamp.castShadow = night && quality.extraShadows;
    bathLamp.intensity = night ? 3 : 0;
    windowMat.color.set(night ? '#1d2b4f' : '#cfe8ff');
    windowMat.emissive.set(night ? '#0d1530' : '#bfe0ff');
    shadeMat.emissiveIntensity = night ? 1.6 : 0.1;
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

  // --- Object visual states -------------------------------------------------------------
  const activeProps = new Map<string, string>();
  const findNamed = (inst: ObjectInstance, name: string): Object3D | undefined => inst.group.getObjectByName(name);
  const tint = (obj: Object3D | undefined, color?: string): void => {
    if (!obj || !color) return;
    obj.traverse((o) => {
      if (o instanceof Mesh && o.name === 'food') (o.material as MeshStandardMaterial).color.set(color);
    });
    if (obj instanceof Mesh && obj.name === 'food') (obj.material as MeshStandardMaterial).color.set(color);
  };
  const setProp = (instanceId: string, prop: string | null, foodColor?: string): void => {
    const inst = instances.get(instanceId);
    if (!inst) return;
    if (prop) activeProps.set(instanceId, prop);
    else activeProps.delete(instanceId);
    const on = (name: string): boolean => prop === name;
    const flame = findNamed(inst, 'flame');
    if (flame) flame.visible = on('cooking') || on('warm');
    const food = findNamed(inst, 'food');
    if (food && inst.def.model === 'stove') {
      food.visible = on('cooking') || on('warm');
      tint(food, foodColor);
    }
    const steam = findNamed(inst, 'steam');
    if (steam) steam.visible = on('cooking') || on('warm');
    const water = findNamed(inst, 'water');
    if (water) water.visible = on('water');
    const plate = findNamed(inst, 'plate');
    if (plate) {
      plate.visible = on('plate');
      tint(plate, foodColor);
    }
    const screen = findNamed(inst, 'screen');
    if (screen instanceof Mesh) (screen.material as MeshStandardMaterial).emissiveIntensity = on('screen') ? 0.9 : 0.05;
    const light = findNamed(inst, 'light');
    if (light instanceof Mesh) (light.material as MeshStandardMaterial).emissiveIntensity = on('open') ? 0.8 : 0;
    const board = findNamed(inst, 'board');
    if (board) board.visible = on('chop');
    const serve = findNamed(inst, 'serve');
    if (serve) {
      serve.visible = on('serve');
      tint(serve, foodColor);
    }
    const cover = findNamed(inst, 'cover');
    const blanket = findNamed(inst, 'blanket');
    if (cover && blanket) {
      cover.visible = on('sleep');
      blanket.visible = !on('sleep');
    }
  };

  /** Doors, lids and fridge doors open for these props. */
  const OPENS = new Set(['open', 'lid', 'flush']);
  const doorCache = new WeakMap<ObjectInstance, { doors: Object3D[]; inside: Object3D | undefined }>();
  const partsOf = (inst: ObjectInstance): { doors: Object3D[]; inside: Object3D | undefined } => {
    let c = doorCache.get(inst);
    if (!c) {
      const doors: Object3D[] = [];
      inst.group.traverse((o) => {
        if (o.name === 'door' && o.userData.openAngle !== undefined) doors.push(o);
      });
      c = { doors, inside: inst.group.getObjectByName('inside') };
      doorCache.set(inst, c);
    }
    return c;
  };
  const doorsOf = (inst: ObjectInstance): Object3D[] => partsOf(inst).doors;

  let lastFridge: { color: string; shape: string }[] = [];
  const setFridgeContents = (items: { color: string; shape: string }[]): void => {
    lastFridge = items;
    const fridgeInst = [...instances.values()].find((i) => i.def.model === 'fridge');
    const contents = fridgeInst ? findNamed(fridgeInst, 'contents') : undefined;
    if (!(contents instanceof Group)) return;
    contents.children.slice().forEach((c) => {
      contents.remove(c);
      if (c instanceof Mesh) c.geometry.dispose();
    });
    // Three shelves, up to 8 items each, front to back.
    const shelves = [0.46, 0.81, 1.16];
    items.slice(0, 24).forEach((it, i) => {
      const shelf = Math.floor(i / 8);
      const slot = i % 8;
      const x = -0.2 + (slot % 4) * 0.13;
      const z = slot < 4 ? 0.08 : -0.1;
      const m = mat(it.color, 0.6);
      let mesh: Mesh;
      switch (it.shape) {
        case 'bottle': mesh = cyl(0.03, 0.03, 0.2, m, 10); mesh.position.y = 0.1; break;
        case 'carton': mesh = rbox(0.07, 0.16, 0.05, 0.01, m); mesh.position.y = 0.08; break;
        case 'egg': mesh = sphere(0.025, m); mesh.scale.set(1, 1.3, 1); mesh.position.y = 0.035; break;
        case 'tray': mesh = rbox(0.11, 0.04, 0.09, 0.01, m); mesh.position.y = 0.02; break;
        case 'bag': mesh = rbox(0.1, 0.07, 0.08, 0.03, m); mesh.position.y = 0.035; break;
        default: mesh = rbox(0.1, 0.06, 0.08, 0.01, m); mesh.position.y = 0.03;
      }
      mesh.position.x += x;
      mesh.position.z += z;
      mesh.position.y += shelves[shelf];
      contents.add(mesh);
    });
    mergeStatic(contents);
  };

  const outside = { x: (layout.frontDoorX[0] + layout.frontDoorX[1]) / 2, z: hd + 0.9 };
  let time = 0;
  const update = (dt: number, character: { x: number; z: number } | null, forceFrontDoorOpen: boolean): void => {
    time += dt;
    for (const inst of instances.values()) {
      const blades = inst.def.model === 'fan' ? inst.group.getObjectByName('blades') : undefined;
      if (blades) blades.rotation.z -= dt * 14;
    }
    // Doors open when the character comes close (or is going out).
    doors.forEach((d, i) => {
      const near = character ? Math.hypot(character.x - d.x, character.z - d.z) < 0.9 : false;
      const target = near || (i === 0 && forceFrontDoorOpen) ? d.open : 0;
      if (target !== d.target) {
        d.target = target;
        result.onDoor?.(target !== 0);
      }
      d.angle += (target - d.angle) * Math.min(1, dt * 5);
      d.pivot.rotation.y = d.angle;
      d.pivot.visible = d.wall.full.visible;
    });
    // Object doors and lids swing at a calm, natural speed.
    for (const inst of instances.values()) {
      const open = OPENS.has(activeProps.get(inst.id) ?? '');
      for (const door of doorsOf(inst)) {
        const axis = door.userData.axis === 'x' ? 'x' : 'y';
        const target = open ? (door.userData.openAngle as number) : 0;
        const cur = door.rotation[axis];
        if (Math.abs(target - cur) > 0.001) door.rotation[axis] = cur + (target - cur) * Math.min(1, dt * 2.2);
      }
      const { inside, doors: ds } = partsOf(inst);
      if (inside) inside.visible = ds.some((d) => Math.abs(d.userData.axis === 'x' ? d.rotation.x : d.rotation.y) > 0.03);
    }
    for (const [id, prop] of activeProps) {
      const inst = instances.get(id);
      if (!inst) continue;
      if (prop === 'water') {
        const water = findNamed(inst, 'water');
        water?.children.forEach((d) => {
          d.position.y -= (d.userData.speed as number) * dt;
          if (d.position.y < 0.05) d.position.y = 1.9;
        });
      }
      if (prop === 'cooking' || prop === 'warm') {
        const flame = findNamed(inst, 'flame');
        flame?.children.forEach((c, k) => c.scale.setScalar(0.8 + 0.3 * Math.sin(time * 20 + k * 1.7)));
        const steam = findNamed(inst, 'steam');
        steam?.children.forEach((p) => {
          const ph = ((time * 0.35 + (p.userData.phase as number)) % 1 + 1) % 1;
          p.position.set(Math.sin(ph * 9 + (p.userData.phase as number) * 6) * 0.05, ph * 0.5, 0);
          p.scale.setScalar(0.6 + ph * 1.6);
          ((p as Mesh).material as MeshBasicMaterial).opacity = 0.3 * (1 - ph);
          p.lookAt(p.position.x, p.position.y, 10);
        });
      }
      if (prop === 'screen') {
        const screen = findNamed(inst, 'screen');
        if (screen instanceof Mesh) {
          const m = screen.material as MeshStandardMaterial;
          m.emissiveIntensity = 0.75 + 0.25 * Math.sin(time * 3.1) * Math.sin(time * 7.3);
        }
      }
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
  };

  const result: KosRoom = { scene, floor, nav, instances, pickables, updateCutaway, setNight, dispose, setProp, setFridgeContents, update, outside, onDoor: null, setPlacements, layout };
  setPlacements(initialPlacements);
  return result;
}
