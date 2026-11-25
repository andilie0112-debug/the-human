import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, type Material, type Scene } from 'three';
import { pbr } from '../../engine/pbr';
import { mergeStatic } from '../../home/mergeStatic';

// The commuter station in detail: a roofed platform with pillars, tactile yellow strip, rails on
// sleepers and overhead wires, a four-car commuter train that comes in, opens its doors, waits
// and leaves on a timetable; in the hall a departures board, ticket machines, tap gates with
// lights, benches and a bakery kiosk. Our own livery and designs.

function box(g: Group, w: number, h: number, d: number, m: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

function boardTexture(lines: string[]): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b1622';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#ffb000';
  g.font = 'bold 26px monospace';
  g.fillText('KEBERANGKATAN', 18, 38);
  g.font = '22px monospace';
  lines.forEach((l, i) => {
    g.fillStyle = i === 0 ? '#7CFC8A' : '#ffd36b';
    g.fillText(l, 18, 82 + i * 38);
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export interface StationDetail {
  /** Calls the train in now (boarding). */
  callTrain: () => void;
  update: (dt: number) => void;
  /** True while the train stands at the platform with its doors open. */
  doorsOpen: () => boolean;
  /** Announcement hook (text to speak and show). */
  onAnnounce: ((text: string) => void) | null;
  onChime: (() => void) | null;
}

/** Builds the platform, train and hall details into the station scene (hall W x D, platform at -z). */
export function addStationDetail(scene: Scene, root: Group, W: number, D: number, solid: (x0: number, z0: number, x1: number, z1: number) => void, destinations: string[]): StationDetail {
  const yellow = new MeshStandardMaterial({ color: '#f1c40f', roughness: 0.6 });
  const steel = new MeshStandardMaterial({ color: '#8a9399', roughness: 0.35, metalness: 0.7 });
  const dark = new MeshStandardMaterial({ color: '#3b3f44', roughness: 0.7 });
  // Platform: raised edge with the tactile strip, track bed, rails and sleepers.
  box(root, W, 0.06, 0.45, yellow, 0, 0.03, -3.3);
  box(root, W + 40, 0.3, 3.2, pbr('concrete', { tint: '#6e6a64', repeat: [30, 2] }), 0, -0.85, -5.1);
  for (const z of [-4.4, -5.8]) box(root, W + 40, 0.12, 0.08, steel, 0, -0.64, z);
  for (let x = -W / 2 - 18; x < W / 2 + 18; x += 0.7) box(root, 0.22, 0.08, 2.0, dark, x, -0.7, -5.1);
  solid(-W / 2, -7, W / 2, -3.55);
  // Roof over the platform on pillars, overhead wire posts.
  const roofMat = pbr('zinc', { repeat: [6, 2], tint: '#d0d4d8', roughness: 0.5, metalness: 0.5 });
  box(root, W, 0.12, 4.5, roofMat, 0, 4.2, -2.5);
  for (let x = -W / 2 + 1.5; x <= W / 2 - 1.5; x += 4) {
    box(root, 0.22, 4.2, 0.22, steel, x, 2.1, -2.2);
    solid(x - 0.15, -2.35, x + 0.15, -2.05);
    box(root, 0.12, 5.2, 0.12, steel, x, 2.0, -6.9); // catenary post
    box(root, 0.1, 0.1, 1.9, steel, x, 4.4, -5.95);
  }
  box(root, W + 40, 0.02, 0.02, dark, 0, 4.35, -5.1); // overhead wire
  // Hall: departures board, ticket machines, benches, kiosk.
  const times = ['08:12', '08:27', '08:41', '08:58'];
  const board = new Mesh(new PlaneGeometry(2.6, 1.3), new MeshStandardMaterial({ map: boardTexture(destinations.slice(0, 4).map((d, i) => `${times[i]}  ${d.padEnd(14).slice(0, 14)} J${(i % 2) + 1}`)), emissive: '#ffffff', emissiveIntensity: 0.35, emissiveMap: null }));
  board.position.set(0, 2.6, 0.75);
  root.add(board);
  const machine = new MeshStandardMaterial({ color: '#c0392b', roughness: 0.4 });
  const screen = new MeshStandardMaterial({ color: '#1b2a3a', emissive: '#4aa3ff', emissiveIntensity: 0.6 });
  for (const x of [-3.2, -2.3]) {
    box(root, 0.75, 1.7, 0.55, machine, x, 0.85, D / 2 - 0.6);
    box(root, 0.5, 0.35, 0.02, screen, x, 1.3, D / 2 - 0.88);
    solid(x - 0.4, D / 2 - 0.9, x + 0.4, D / 2 - 0.3);
  }
  const bench = pbr('wood_light', { tint: '#d9b98f' });
  for (const x of [-6, 4.5]) {
    box(root, 2.2, 0.08, 0.5, bench, x, 0.45, -1.4);
    box(root, 2.2, 0.45, 0.06, bench, x, 0.7, -1.62);
    solid(x - 1.1, -1.7, x + 1.1, -1.15);
  }
  // Bakery kiosk (our own "Roti Hangat" stand).
  box(root, 2.0, 1.0, 0.9, pbr('wood_light', { tint: '#f3e3c4' }), W / 2 - 1.6, 0.5, 3.6);
  box(root, 2.2, 0.5, 1.0, new MeshStandardMaterial({ color: '#d35400', roughness: 0.5 }), W / 2 - 1.6, 2.4, 3.6);
  solid(W / 2 - 2.7, 3.1, W / 2 - 0.5, 4.1);
  mergeStatic(root);

  // The train: four cars, white with red and yellow stripes, doors that slide open.
  const train = new Group();
  const body = new MeshStandardMaterial({ color: '#eef1f3', roughness: 0.35, metalness: 0.3 });
  const red = new MeshStandardMaterial({ color: '#c0392b', roughness: 0.4 });
  const gold = new MeshStandardMaterial({ color: '#f1c40f', roughness: 0.4 });
  const win = new MeshStandardMaterial({ color: '#25313d', roughness: 0.08, metalness: 0.5 });
  const doors: Mesh[] = [];
  const CAR = 20;
  for (let c = 0; c < 4; c++) {
    const cx = (c - 1.5) * (CAR + 0.6);
    box(train, CAR, 3.0, 2.9, body, cx, 1.0, 0);
    box(train, CAR, 0.25, 2.92, red, cx, 0.1, 0);
    box(train, CAR, 0.1, 2.92, gold, cx, 0.3, 0);
    for (let k = -4; k <= 4; k++) box(train, 1.6, 0.9, 2.94, win, cx + k * 2.2, 1.5, 0);
    for (const dx of [-6, 0, 6]) {
      const door = box(train, 1.3, 2.2, 0.06, new MeshStandardMaterial({ color: '#d5dbdf', roughness: 0.3, metalness: 0.4 }), cx + dx, 0.7, 1.47);
      door.userData.closedX = cx + dx;
      doors.push(door);
    }
    const pantograph = new Mesh(new CylinderGeometry(0.04, 0.04, 1.4, 6), new MeshStandardMaterial({ color: '#333' }));
    pantograph.rotation.z = 0.6;
    pantograph.position.set(cx, 3.05, 0);
    train.add(pantograph);
  }
  train.position.set(-120, 0, -5.1);
  scene.add(train);

  // Timetable: arrive (slow down), doors open, wait, close, leave, pause, again.
  type Phase = 'away' | 'arriving' | 'open' | 'leaving';
  let phase: Phase = 'away';
  let timer = 6;
  let speed = 0;
  let destIdx = 0;
  const detail: StationDetail = {
    onAnnounce: null,
    onChime: null,
    doorsOpen: () => phase === 'open',
    callTrain: () => {
      if (phase === 'away') timer = 0;
    },
    update: (dt) => {
      timer -= dt;
      if (phase === 'away' && timer <= 0) {
        phase = 'arriving';
        train.position.x = -120;
        speed = 22;
        const dest = destinations[destIdx++ % destinations.length];
        detail.onChime?.();
        detail.onAnnounce?.(`Perhatian, kereta commuter tujuan ${dest} akan masuk di jalur satu. Harap berdiri di belakang garis kuning.`);
      } else if (phase === 'arriving') {
        // Brake smoothly to a stop with the train centred on the platform.
        const left = -train.position.x;
        speed = Math.max(1.2, Math.min(speed, Math.sqrt(2 * 2.2 * Math.max(0, left))));
        train.position.x = Math.min(0, train.position.x + speed * dt);
        if (train.position.x >= -0.01) {
          phase = 'open';
          timer = 12;
        }
      } else if (phase === 'open') {
        if (timer <= 0) {
          phase = 'leaving';
          speed = 0;
        }
      } else if (phase === 'leaving') {
        speed = Math.min(25, speed + 2.5 * dt);
        train.position.x += speed * dt;
        if (train.position.x > 140) {
          phase = 'away';
          timer = 25;
        }
      }
      // Doors slide open while standing.
      const open = phase === 'open' && timer < 11.2 && timer > 0.8;
      for (const d of doors) {
        const target = (d.userData.closedX as number) + (open ? 0.7 : 0);
        d.position.x += (target - d.position.x) * Math.min(1, dt * 4);
      }
    },
  };
  return detail;
}
