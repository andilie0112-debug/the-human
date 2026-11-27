import { CanvasTexture, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, type Material } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Vehicles you see on Indonesian streets, our own designs: a 7-seat family MPV, a small city
// car, a pick-up, the angkot minibus, the (blue, gas-powered) bajaj, and matic scooters with
// helmeted riders. Front faces +x. Number plates in the Indonesian style (city letter code).

const mats = new Map<string, MeshStandardMaterial>();
function m(color: string, roughness = 0.4, metalness = 0.25, emissive?: string): MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}|${emissive ?? ''}`;
  let mat = mats.get(key);
  if (!mat) {
    mat = new MeshStandardMaterial({ color, roughness, metalness, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 0.6 : 0 });
    mats.set(key, mat);
  }
  return mat;
}
const glass = (): MeshStandardMaterial => m('#26303b', 0.08, 0.5);
const tyre = (): MeshStandardMaterial => m('#1b1b1d', 0.85, 0);
const rim = (): MeshStandardMaterial => m('#c3c8cc', 0.3, 0.8);
const chrome = (): MeshStandardMaterial => m('#d5d9dd', 0.2, 0.9);

function rb(g: Group, w: number, h: number, d: number, r: number, mat: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

function wheel(g: Group, x: number, z: number, r: number, width = 0.22): void {
  const t = new Mesh(new CylinderGeometry(r, r, width, 16), tyre());
  t.rotation.x = Math.PI / 2;
  t.position.set(x, r, z);
  g.add(t);
  const hub = new Mesh(new CylinderGeometry(r * 0.6, r * 0.6, width + 0.01, 12), rim());
  hub.rotation.x = Math.PI / 2;
  hub.position.set(x, r, z);
  g.add(hub);
}

let plateTex: CanvasTexture | null = null;
/** Black plate with white letters, like most private cars in Indonesia. */
function plate(g: Group, x: number, y: number, facing: 1 | -1): void {
  if (!plateTex) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 40;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 128, 40);
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, 122, 34);
    ctx.fillStyle = '#f2f2f2';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('B 2027 TH', 64, 28);
    plateTex = new CanvasTexture(c);
    plateTex.colorSpace = SRGBColorSpace;
  }
  const p = new Mesh(new PlaneGeometry(0.42, 0.12), new MeshStandardMaterial({ map: plateTex, roughness: 0.5 }));
  p.position.set(x, y, 0);
  p.rotation.y = (facing * Math.PI) / 2;
  g.add(p);
}

function lights(g: Group, front: number, back: number, y: number, half: number): void {
  for (const s of [-1, 1]) {
    rb(g, 0.06, 0.12, 0.3, 0.03, m('#fff6dc', 0.2, 0.1, '#ffe7a6'), front, y, s * (half - 0.22));
    rb(g, 0.06, 0.12, 0.26, 0.03, m('#c0392b', 0.3, 0.1, '#7a1010'), back, y, s * (half - 0.2));
  }
}

/** Side windows with body-coloured pillars between them. */
function sideWindows(g: Group, xs: number[], width: number, y: number, h: number, half: number): void {
  for (const x of xs) for (const sgn of [-1, 1]) rb(g, width, h, 0.03, 0.03, glass(), x, y, sgn * half);
}

/** 7-seat family MPV (the most common car in Indonesia): tall roof, short sloping bonnet. */
export function mpv(color: string): Group {
  const g = new Group();
  const body = m(color, 0.3, 0.4);
  rb(g, 4.3, 0.62, 1.72, 0.22, body, 0, 0.66, 0); // lower body
  const bonnet = rb(g, 1.05, 0.2, 1.64, 0.1, body, 1.62, 1.0, 0);
  bonnet.rotation.z = -0.14;
  rb(g, 3.05, 0.7, 1.6, 0.24, body, -0.55, 1.33, 0); // cabin
  sideWindows(g, [0.42, -0.42, -1.3], 0.74, 1.4, 0.42, 0.8);
  const wind = rb(g, 0.05, 0.78, 1.46, 0.04, glass(), 1.02, 1.3, 0);
  wind.rotation.z = 0.62;
  rb(g, 0.04, 0.42, 1.36, 0.03, glass(), -2.08, 1.4, 0); // rear window
  rb(g, 0.12, 0.22, 1.66, 0.06, m('#2a2c30', 0.5, 0.2), 2.13, 0.52, 0); // bumper
  rb(g, 0.04, 0.14, 0.9, 0.02, m('#1d1f22', 0.4, 0.3), 2.16, 0.78, 0); // grille
  rb(g, 0.12, 0.2, 1.66, 0.06, m('#2a2c30', 0.5, 0.2), -2.13, 0.5, 0);
  for (const sgn of [-1, 1]) rb(g, 0.14, 0.09, 0.16, 0.03, body, 0.95, 1.12, sgn * 0.9); // mirrors
  lights(g, 2.12, -2.13, 0.86, 0.86);
  plate(g, 2.2, 0.42, 1);
  plate(g, -2.2, 0.42, -1);
  for (const x of [-1.35, 1.35]) for (const z of [-0.78, 0.78]) wheel(g, x, z, 0.33);
  return g;
}

/** Small city car (low-cost hatchback). */
export function cityCar(color: string): Group {
  const g = new Group();
  const body = m(color, 0.3, 0.4);
  rb(g, 3.6, 0.6, 1.6, 0.22, body, 0, 0.62, 0);
  const bonnet = rb(g, 0.9, 0.18, 1.52, 0.1, body, 1.35, 0.95, 0);
  bonnet.rotation.z = -0.16;
  rb(g, 2.15, 0.62, 1.48, 0.24, body, -0.4, 1.22, 0);
  sideWindows(g, [0.2, -0.75], 0.78, 1.28, 0.4, 0.74);
  const wind = rb(g, 0.05, 0.7, 1.36, 0.04, glass(), 0.78, 1.2, 0);
  wind.rotation.z = 0.65;
  rb(g, 0.04, 0.38, 1.26, 0.03, glass(), -1.48, 1.28, 0);
  rb(g, 0.12, 0.2, 1.54, 0.06, m('#2a2c30', 0.5, 0.2), 1.78, 0.45, 0);
  rb(g, 0.12, 0.2, 1.54, 0.06, m('#2a2c30', 0.5, 0.2), -1.78, 0.45, 0);
  lights(g, 1.78, -1.78, 0.78, 0.8);
  plate(g, 1.85, 0.4, 1);
  plate(g, -1.85, 0.4, -1);
  for (const x of [-1.15, 1.15]) for (const z of [-0.72, 0.72]) wheel(g, x, z, 0.3);
  return g;
}

/** Pick-up with an open bed (for market goods). */
export function pickup(color: string): Group {
  const g = new Group();
  const body = m(color, 0.4, 0.25);
  rb(g, 1.7, 1.3, 1.65, 0.15, body, 1.1, 1.0, 0); // cab
  rb(g, 1.0, 0.5, 1.6, 0.1, glass(), 1.25, 1.35, 0);
  rb(g, 2.6, 0.5, 1.7, 0.06, m('#3a3d42', 0.6, 0.3), -0.95, 0.72, 0); // bed floor
  for (const s of [-1, 1]) rb(g, 2.6, 0.45, 0.06, 0.02, body, -0.95, 1.12, s * 0.83);
  rb(g, 0.06, 0.45, 1.66, 0.02, body, -2.24, 1.12, 0);
  // A few crates of vegetables in the back.
  for (const [x, c] of [[-0.4, '#4f9a52'], [-1.2, '#e2725b'], [-1.9, '#f2c14e']] as const) rb(g, 0.55, 0.4, 0.55, 0.05, m(c, 0.8, 0), x, 1.15, 0.3 - (x < -1 ? 0.5 : 0));
  lights(g, 1.97, -2.27, 0.85, 0.82);
  plate(g, 2.0, 0.5, 1);
  for (const x of [-1.4, 1.2]) for (const z of [-0.8, 0.8]) wheel(g, x, z, 0.34);
  return g;
}

/** Angkot: a small public minibus with an open side door, the route colour and a stripe. */
export function angkot(color: string): Group {
  const g = new Group();
  const body = m(color, 0.35, 0.3);
  rb(g, 3.8, 1.65, 1.62, 0.16, body, 0, 1.2, 0);
  rb(g, 3.82, 0.14, 1.64, 0.04, m('#f4f1e8', 0.5, 0.1), 0, 1.05, 0); // stripe
  for (const s of [-1, 1]) rb(g, 2.5, 0.5, 1.66, 0.08, glass(), -0.35, 1.6, 0).scale.z = s > 0 ? 1 : 1;
  const wind = rb(g, 0.06, 0.66, 1.42, 0.03, glass(), 1.84, 1.55, 0);
  wind.rotation.z = 0.25;
  rb(g, 1.0, 1.25, 0.05, 0.02, m('#1d2228', 0.6, 0.1), -0.3, 1.0, 0.82); // open side doorway
  rb(g, 1.6, 0.06, 0.4, 0.02, m('#2b3442', 0.6, 0.1), -0.8, 2.05, 0); // roof rack
  lights(g, 1.91, -1.91, 0.85, 0.8);
  plate(g, 1.94, 0.45, 1);
  for (const x of [-1.25, 1.25]) for (const z of [-0.75, 0.75]) wheel(g, x, z, 0.3);
  return g;
}

/** Bajaj: three-wheeled, blue (gas-powered) in Jakarta, with a canvas roof. */
export function bajaj(color = '#1f78b4'): Group {
  const g = new Group();
  const body = m(color, 0.35, 0.3);
  rb(g, 2.4, 0.9, 1.3, 0.25, body, 0, 0.75, 0);
  rb(g, 1.7, 0.9, 1.32, 0.3, m('#e9ecee', 0.7, 0), -0.25, 1.6, 0); // roof
  rb(g, 0.05, 0.55, 1.0, 0.03, glass(), 0.75, 1.45, 0);
  wheel(g, 1.0, 0, 0.26, 0.16);
  for (const z of [-0.55, 0.55]) wheel(g, -0.8, z, 0.26, 0.16);
  rb(g, 0.06, 0.12, 0.28, 0.03, m('#fff6dc', 0.2, 0.1, '#ffe7a6'), 1.21, 0.95, 0);
  return g;
}

/** Matic scooter with a rider (helmet, jacket), the everyday Indonesian motorbike. */
export function scooter(color: string, withRider: boolean): Group {
  const g = new Group();
  const body = m(color, 0.3, 0.35);
  rb(g, 1.5, 0.3, 0.32, 0.12, body, 0, 0.55, 0); // body and floorboard
  rb(g, 0.35, 0.75, 0.3, 0.1, body, 0.55, 0.78, 0); // front apron
  rb(g, 0.65, 0.14, 0.3, 0.06, m('#1d1d1f', 0.7, 0), -0.25, 0.83, 0); // seat
  const bar = new Mesh(new CylinderGeometry(0.018, 0.018, 0.62, 8), chrome());
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0.62, 1.18, 0);
  g.add(bar);
  rb(g, 0.06, 0.1, 0.16, 0.03, m('#fff6dc', 0.2, 0.1, '#ffe7a6'), 0.72, 1.06, 0);
  wheel(g, 0.62, 0, 0.24, 0.1);
  wheel(g, -0.55, 0, 0.24, 0.1);
  if (withRider) {
    const jackets = ['#2d2d33', '#3f6fa8', '#5d6b4c', '#8e2b2b', '#2e8b57'];
    const jacket = m(jackets[Math.floor(Math.random() * jackets.length)], 0.8, 0);
    rb(g, 0.34, 0.6, 0.42, 0.12, jacket, -0.2, 1.28, 0); // torso
    rb(g, 0.5, 0.16, 0.36, 0.06, m('#2f3a52', 0.8, 0), 0.05, 0.95, 0); // legs
    for (const s of [-1, 1]) {
      const arm = rb(g, 0.48, 0.12, 0.12, 0.05, jacket, 0.2, 1.3, s * 0.23);
      arm.rotation.z = -0.35;
    }
    const helmets = ['#e74c3c', '#f4f6f7', '#1d1d1f', '#2e86c1', '#f1c40f'];
    rb(g, 0.3, 0.28, 0.28, 0.13, m(helmets[Math.floor(Math.random() * helmets.length)], 0.25, 0.2), -0.15, 1.72, 0);
    rb(g, 0.04, 0.12, 0.2, 0.02, glass(), -0.01, 1.7, 0); // visor
  }
  return g;
}

let busTex: CanvasTexture | null = null;
/** The city bus's livery on its sides: our own made-up "TransKota" line, with a lane number. */
function busLivery(): CanvasTexture {
  if (busTex) return busTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4f6f7';
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = '#1f4e9c';
  ctx.beginPath();
  ctx.moveTo(0, 64);
  ctx.lineTo(300, 64);
  ctx.quadraticCurveTo(380, 30, 512, 20);
  ctx.lineTo(512, 64);
  ctx.fill();
  ctx.fillStyle = '#1f4e9c';
  ctx.font = 'italic bold 30px sans-serif';
  ctx.fillText('TransKota', 30, 42);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('LISTRIK', 400, 55);
  busTex = new CanvasTexture(c);
  busTex.colorSpace = SRGBColorSpace;
  return busTex;
}

/**
 * A 12 m electric city bus (our own "TransKota" line): white with a blue sweep, a long band of
 * dark windows, a glowing destination sign, high doors for the raised platforms.
 */
export function cityBus(): Group {
  const g = new Group();
  const white = m('#f4f6f7', 0.35, 0.2);
  rb(g, 12, 2.6, 2.5, 0.25, white, 0, 1.75, 0);
  rb(g, 11.9, 0.5, 2.52, 0.1, m('#1f4e9c', 0.4, 0.2), 0, 0.72, 0); // blue skirt
  rb(g, 10.4, 1.05, 2.54, 0.08, glass(), -0.4, 2.25, 0); // side windows
  rb(g, 0.08, 1.6, 2.2, 0.06, glass(), 6.0, 2.05, 0); // windscreen
  rb(g, 0.06, 0.28, 1.6, 0.03, m('#2a1a05', 0.4, 0.1, '#ff9b1a'), 6.02, 2.95, 0); // destination sign
  for (const s of [-1, 1]) {
    const side = new Mesh(new PlaneGeometry(6, 0.75), new MeshStandardMaterial({ map: busLivery(), roughness: 0.4 }));
    side.position.set(-0.5, 1.3, s * 1.265);
    if (s < 0) side.rotation.y = Math.PI;
    g.add(side);
  }
  for (const x of [2.2, -2.6]) rb(g, 1.2, 2.1, 0.04, 0.03, m('#9aa3ab', 0.3, 0.6), x, 1.55, 1.27); // doors
  rb(g, 3.5, 0.35, 1.6, 0.1, m('#d5d9dd', 0.4, 0.3), -1.5, 3.2, 0); // batteries on the roof
  lights(g, 6.02, -6.02, 0.85, 1.25);
  for (const x of [-3.8, 3.6]) for (const z of [-1.05, 1.05]) wheel(g, x, z, 0.5, 0.3);
  return g;
}
