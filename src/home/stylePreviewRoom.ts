import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  type Material,
  type Object3D,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Room interior bounds (metres) where the character may walk. */
export const ROOM = { width: 5, depth: 4 } as const;

interface CutawayWall {
  full: Group;
  stub: Mesh;
  nx: number;
  nz: number;
}

export interface PreviewRoom {
  scene: Scene;
  /** Lowers the walls that stand between the camera and the room. */
  updateCutaway: (dirX: number, dirZ: number) => void;
  fanBlades: Group;
  setNight: (night: boolean) => void;
  dispose: () => void;
}

function mat(color: string, roughness = 0.75, metalness = 0): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness, metalness });
}

function rbox(w: number, h: number, d: number, r: number, m: Material): Mesh {
  const mesh = new Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function at<T extends Object3D>(o: T, x: number, y: number, z: number, parent: Object3D): T {
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

/** Warm wooden plank texture drawn on a canvas, so no external image is needed. */
function plankTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const tones = ['#b98a5e', '#c4956a', '#ad7f55', '#bf8f62'];
  for (let i = 0; i < 8; i++) {
    g.fillStyle = tones[i % tones.length];
    g.fillRect(0, i * 32, 256, 32);
    g.fillStyle = 'rgba(70,40,20,0.35)';
    g.fillRect(0, i * 32, 256, 2);
    const seam = (i * 97) % 256;
    g.fillRect(seam, i * 32, 2, 32);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    for (let k = 0; k < 6; k++) g.fillRect(0, i * 32 + 6 + k * 4, 256, 1);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

/** A cosy kos room built from rounded primitives to preview lighting, colour and mood. */
export function createPreviewRoom(): PreviewRoom {
  const scene = new Scene();
  const W = ROOM.width;
  const D = ROOM.depth;
  const room = new Group();
  scene.add(room);

  // Lights
  const hemi = new HemisphereLight('#fff6e8', '#8a6a4a', 1.1);
  scene.add(hemi);
  const sun = new DirectionalLight('#ffe2b8', 2.6);
  sun.position.set(5, 7, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0005;
  const sc = sun.shadow.camera;
  sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 1; sc.far = 25;
  scene.add(sun);
  const lamp = new PointLight('#ffb86b', 0, 9, 1.6);
  lamp.position.set(1.6, 2.2, -1.2);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  scene.add(lamp);

  // Ground outside the room so the cut-away view never looks into a void.
  const ground = new Mesh(new PlaneGeometry(60, 60), mat('#8fae6e', 1));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  scene.add(ground);

  // Floor
  const floorTex = plankTexture();
  const floor = rbox(W + 0.2, 0.12, D + 0.2, 0.04, new MeshStandardMaterial({ map: floorTex, roughness: 0.65 }));
  at(floor, 0, -0.06, 0, room);

  // Four walls. Walls between the camera and the room drop to a short stub (life-sim cutaway).
  const wallMat = mat('#f1e4cf', 0.9);
  const accentMat = mat('#9cc5b4', 0.9);
  const walls: CutawayWall[] = [];
  const addWall = (nx: number, nz: number, offset: number, material: Material): Group => {
    const full = new Group();
    room.add(full);
    const along = nx === 0 ? W + 0.2 : D + 0.2;
    const stub = rbox(nx === 0 ? along : 0.14, 0.25, nx === 0 ? 0.14 : along, 0.03, material);
    stub.position.set(nx * (offset + 0.07), 0.125, nz * (offset + 0.07));
    stub.visible = false;
    room.add(stub);
    walls.push({ full, stub, nx, nz });
    return full;
  };
  const back = addWall(0, -1, D / 2, wallMat);
  const left = addWall(-1, 0, W / 2, accentMat);
  const front = addWall(0, 1, D / 2, wallMat);
  const right = addWall(1, 0, W / 2, accentMat);
  at(rbox(W + 0.2, 2.6, 0.14, 0.03, wallMat), 0, 1.3, D / 2 + 0.07, front);
  at(rbox(0.14, 2.6, D + 0.2, 0.03, accentMat), W / 2 + 0.07, 1.3, 0, right);
  at(rbox(W + 0.2, 2.6, 0.14, 0.03, wallMat), 0, 1.3, -D / 2 - 0.07, back);
  at(rbox(0.14, 2.6, D + 0.2, 0.03, accentMat), -W / 2 - 0.07, 1.3, 0, left);
  const trim = mat('#7a5638', 0.6);
  at(rbox(W, 0.1, 0.03, 0.01, trim), 0, 0.05, -D / 2 + 0.01, back);
  at(rbox(0.03, 0.1, D, 0.01, trim), -W / 2 + 0.01, 0.05, 0, left);

  // Window on the back wall
  const windowMat = new MeshStandardMaterial({ color: '#cfe8ff', emissive: '#bfe0ff', emissiveIntensity: 0.9 });
  const win = new Mesh(new PlaneGeometry(1.3, 1.0), windowMat);
  at(win, 0.9, 1.55, -D / 2 + 0.005, back);
  const frameMat = mat('#ffffff', 0.5);
  for (const [w, h, x, y] of [[1.45, 0.07, 0.9, 2.08], [1.45, 0.09, 0.9, 1.02], [0.07, 1.1, 0.2, 1.55], [0.07, 1.1, 1.6, 1.55], [0.04, 1.0, 0.9, 1.55]] as const) {
    at(rbox(w, h, 0.06, 0.02, frameMat), x, y, -D / 2 + 0.03, back);
  }
  const curtainMat = mat('#e58b5a', 0.95);
  at(rbox(0.3, 1.25, 0.06, 0.03, curtainMat), 0.0, 1.5, -D / 2 + 0.08, back);
  at(rbox(0.3, 1.25, 0.06, 0.03, curtainMat), 1.8, 1.5, -D / 2 + 0.08, back);

  // Bed with batik-coloured blanket
  const bed = new Group();
  at(rbox(1.1, 0.3, 2.0, 0.06, mat('#8a5a3a', 0.6)), 0, 0.15, 0, bed);
  at(rbox(1.0, 0.18, 1.9, 0.08, mat('#fbf7ef', 0.9)), 0, 0.39, 0, bed);
  at(rbox(1.04, 0.08, 1.25, 0.04, mat('#3f6fa8', 0.9)), 0, 0.5, 0.32, bed);
  at(rbox(1.06, 0.03, 0.12, 0.015, mat('#e7c65a', 0.9)), 0, 0.54, -0.2, bed);
  at(rbox(0.7, 0.14, 0.34, 0.07, mat('#ffffff', 0.95)), 0, 0.55, -0.72, bed);
  at(rbox(1.1, 0.75, 0.08, 0.04, mat('#8a5a3a', 0.6)), 0, 0.37, -1.0, bed);
  at(bed, -1.85, 0, -0.85, room);

  // Desk, chair, laptop and desk lamp
  const desk = new Group();
  const wood = mat('#c8a27a', 0.55);
  at(rbox(1.2, 0.05, 0.6, 0.02, wood), 0, 0.74, 0, desk);
  for (const [x, z] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]]) at(rbox(0.05, 0.72, 0.05, 0.02, wood), x, 0.36, z, desk);
  at(rbox(0.36, 0.02, 0.25, 0.01, mat('#5a6270', 0.4, 0.3)), -0.1, 0.775, 0.05, desk);
  const screen = rbox(0.36, 0.24, 0.015, 0.01, new MeshStandardMaterial({ color: '#2b3442', emissive: '#6fa8ff', emissiveIntensity: 0.4 }));
  screen.rotation.x = -0.25;
  at(screen, -0.1, 0.9, -0.08, desk);
  at(rbox(0.12, 0.14, 0.12, 0.05, mat('#e2725b', 0.5)), 0.42, 0.84, -0.1, desk);
  at(desk, 1.6, 0, -1.6, room);
  const chair = new Group();
  const chairMat = mat('#4e7d6b', 0.7);
  at(rbox(0.45, 0.06, 0.45, 0.03, chairMat), 0, 0.46, 0, chair);
  at(rbox(0.45, 0.45, 0.05, 0.03, chairMat), 0, 0.72, 0.21, chair);
  for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) at(rbox(0.04, 0.45, 0.04, 0.015, mat('#333333', 0.5)), x, 0.22, z, chair);
  chair.rotation.y = 0.3;
  at(chair, 1.45, 0, -1.0, room);

  // Rug
  at(rbox(1.8, 0.02, 1.3, 0.01, mat('#d9a75f', 1)), 0.2, 0.012, 0.3, room);
  at(rbox(1.5, 0.022, 1.0, 0.01, mat('#b5523b', 1)), 0.2, 0.013, 0.3, room);

  // Standing fan (blades spin)
  const fan = new Group();
  const fanMat = mat('#e9edf0', 0.4, 0.1);
  at(new Mesh(new CylinderGeometry(0.18, 0.2, 0.04, 20), fanMat), 0, 0.02, 0, fan);
  at(new Mesh(new CylinderGeometry(0.02, 0.02, 1.0, 10), fanMat), 0, 0.52, 0, fan);
  const head = at(new Group(), 0, 1.08, 0, fan);
  at(new Mesh(new SphereGeometry(0.07, 14, 10), fanMat), 0, 0, -0.05, head);
  const fanBlades = at(new Group(), 0, 0, 0.03, head);
  const bladeMat = mat('#7fb6d6', 0.4);
  for (let i = 0; i < 3; i++) {
    const b = rbox(0.08, 0.2, 0.01, 0.004, bladeMat);
    b.position.y = 0.11;
    const holder = new Group();
    holder.rotation.z = (i / 3) * Math.PI * 2;
    holder.add(b);
    fanBlades.add(holder);
  }
  fan.traverse((o) => { if (o instanceof Mesh) o.castShadow = true; });
  fan.rotation.y = -0.6;
  at(fan, -0.6, 0, -1.55, room);

  // Plant in the corner
  const plant = new Group();
  at(new Mesh(new CylinderGeometry(0.16, 0.12, 0.3, 16), mat('#c96f4a', 0.8)), 0, 0.15, 0, plant);
  const leafMat = mat('#4f9a52', 0.8);
  for (const [x, y, z, r] of [[0, 0.5, 0, 0.2], [0.1, 0.65, 0.05, 0.14], [-0.1, 0.62, -0.04, 0.15], [0.02, 0.8, -0.02, 0.11]]) {
    at(new Mesh(new SphereGeometry(r, 14, 10), leafMat), x, y, z, plant);
  }
  plant.traverse((o) => { if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  at(plant, 2.2, 0, 1.6, room);

  // Wall shelf with books
  at(rbox(0.9, 0.04, 0.22, 0.015, wood), -W / 2 + 0.13, 1.5, 0.9, left).rotation.y = Math.PI / 2;
  const bookColors = ['#d9534f', '#f0ad4e', '#5bc0de', '#5cb85c', '#8e6cc0'];
  bookColors.forEach((col, i) => at(rbox(0.16, 0.22 + (i % 2) * 0.04, 0.05, 0.01, mat(col, 0.8)), -W / 2 + 0.12, 1.64 + (i % 2) * 0.02, 0.6 + i * 0.09, left));

  // Wall lamp
  const shade = new Mesh(new CylinderGeometry(0.1, 0.16, 0.16, 16, 1, true), new MeshStandardMaterial({ color: '#fff1d6', emissive: '#ffcf8a', emissiveIntensity: 0.2, side: 2 }));
  at(shade, 1.6, 2.2, -D / 2 + 0.2, back);

  const daySky = new Color('#bfe0f5');
  const nightSky = new Color('#1b2540');

  const setNight = (night: boolean): void => {
    scene.background = night ? nightSky : daySky;
    sun.intensity = night ? 0.25 : 2.6;
    sun.color.set(night ? '#8fa8ff' : '#ffe2b8');
    hemi.intensity = night ? 0.35 : 1.1;
    lamp.intensity = night ? 6 : 0;
    windowMat.color.set(night ? '#1d2b4f' : '#cfe8ff');
    windowMat.emissive.set(night ? '#0d1530' : '#bfe0ff');
    (shade.material as MeshStandardMaterial).emissiveIntensity = night ? 1.6 : 0.2;
    ground.material.color.set(night ? '#3a4a3a' : '#8fae6e');
  };
  setNight(false);

  const dispose = (): void => {
    scene.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.geometry.dispose();
        const mats: Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose());
      }
    });
    floorTex.dispose();
  };

  /** dirX/dirZ: horizontal direction from the room centre towards the camera. */
  const updateCutaway = (dirX: number, dirZ: number): void => {
    const len = Math.hypot(dirX, dirZ) || 1;
    for (const w of walls) {
      const outside = (dirX * w.nx + dirZ * w.nz) / len > 0.3;
      w.full.visible = !outside;
      w.stub.visible = outside;
    }
  };

  return { scene, updateCutaway, fanBlades, setNight, dispose };
}
