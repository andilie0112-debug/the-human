import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SphereGeometry, type Material, type Scene } from 'three';
import { pbr } from '../../engine/pbr';
import { boardTexture } from './station';

// The airport in detail: a departures board in the hall, a jet bridge from the gate to a
// parked airliner (our own fictional livery), and another plane taxiing across the apron.

function box(g: Group, w: number, h: number, d: number, m: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

/** A twin-engine airliner pointing along +x (white with a teal and orange stripe). */
export function airliner(scale = 1): Group {
  const plane = new Group();
  const white = new MeshStandardMaterial({ color: '#f4f6f7', roughness: 0.35, metalness: 0.15 });
  const teal = new MeshStandardMaterial({ color: '#138d90', roughness: 0.4 });
  const orange = new MeshStandardMaterial({ color: '#e67e22', roughness: 0.4 });
  const glass = new MeshStandardMaterial({ color: '#1b2631', roughness: 0.15, metalness: 0.4 });
  const grey = new MeshStandardMaterial({ color: '#9aa3ab', roughness: 0.4, metalness: 0.5 });
  const R = 1.9;
  const body = new Mesh(new CylinderGeometry(R, R, 26, 24), white);
  body.rotation.z = Math.PI / 2;
  plane.add(body);
  const nose = new Mesh(new SphereGeometry(R, 24, 16), white);
  nose.scale.set(1.6, 1, 1);
  nose.position.x = 13;
  plane.add(nose);
  const tail = new Mesh(new CylinderGeometry(R, 0.35, 7, 24), white);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-16.5, 0.5, 0);
  plane.add(tail);
  // Livery stripe and a row of windows on both sides, cockpit glass.
  for (const s of [-1, 1]) {
    box(plane, 25, 0.35, 0.05, teal, 0, -0.35, s * (R - 0.02));
    box(plane, 25, 0.12, 0.05, orange, 0, -0.65, s * (R - 0.02));
    for (let x = -11; x < 11; x += 0.9) box(plane, 0.32, 0.42, 0.05, glass, x, 0.45, s * (R + 0.005));
    // Front door (where the jet bridge connects).
    box(plane, 0.9, 1.7, 0.05, grey, 9.5, 0.1, s * (R + 0.01));
  }
  const cockpit = new Mesh(new BoxGeometry(1.2, 0.5, 2.2), glass);
  cockpit.position.set(14.6, 0.55, 0);
  cockpit.rotation.z = -0.35;
  plane.add(cockpit);
  // Wings with engines, tailplane and the fin in the airline colour.
  const wing = box(plane, 5, 0.25, 30, white, -1, -1.1, 0);
  wing.rotation.y = 0.12;
  for (const s of [-1, 1]) {
    const eng = new Mesh(new CylinderGeometry(0.85, 0.75, 3.2, 18), grey);
    eng.rotation.z = Math.PI / 2;
    eng.position.set(0.8, -1.9, s * 6.5);
    plane.add(eng);
  }
  box(plane, 3, 0.18, 11, white, -17.5, 0.9, 0);
  const fin = box(plane, 4, 5.5, 0.3, teal, -17.8, 3.4, 0);
  fin.rotation.z = -0.35;
  box(plane, 1.2, 1.2, 0.32, orange, -17.2, 3.6, 0);
  // Landing gear.
  for (const [x, z] of [[11, 0], [-1.5, 2.2], [-1.5, -2.2]] as const) {
    box(plane, 0.18, 1.6, 0.18, grey, x, -2.6, z);
    const wheel = new Mesh(new CylinderGeometry(0.5, 0.5, 0.4, 14), new MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.9 }));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, -3.4, z);
    plane.add(wheel);
  }
  plane.position.y = 3.9 * scale;
  plane.scale.setScalar(scale);
  return plane;
}

export interface AirportDetail {
  /** Shows the flight as boarding on the board. */
  boarding: (dest: string) => void;
  update: (dt: number) => void;
}

/** Adds the board, jet bridge and planes to the airport hall (gate at x 6, window at -z). */
export function addAirportDetail(scene: Scene, root: Group, W: number, D: number, destinations: string[]): AirportDetail {
  const flights = destinations.slice(0, 4);
  const times = ['09:10', '10:25', '11:40', '13:05'];
  const lines = (boardingDest: string | null): string[] =>
    flights.map((d, i) => `${times[i]} ${d.padEnd(11).slice(0, 11)} G${i + 1} ${d === boardingDest ? 'BOARDING' : 'ON TIME'}`);
  const boardMat = new MeshStandardMaterial({ map: boardTexture(lines(null)), emissive: '#ffffff', emissiveIntensity: 0.3 });
  boardMat.emissiveMap = boardMat.map;
  const board = new Mesh(new PlaneGeometry(3.2, 1.6), boardMat);
  board.position.set(-W / 2 + 0.12, 2.3, -1.2);
  board.rotation.y = Math.PI / 2;
  root.add(board);

  // Apron outside the window, with the parked plane at the gate.
  const apron = new Mesh(new PlaneGeometry(220, 80), pbr('concrete', { repeat: [44, 16], tint: '#9a9590' }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, -0.05, -40);
  scene.add(apron);
  const yellow = new MeshStandardMaterial({ color: '#f1c40f', roughness: 0.6 });
  for (let x = -100; x < 100; x += 6) box(root, 3, 0.02, 0.2, yellow, x, -0.03, -46);
  const parked = airliner(0.8);
  parked.position.set(-2, parked.position.y, -21);
  scene.add(parked);

  // Jet bridge: a tunnel on legs from the gate window to the front door of the plane.
  const bridgeMat = new MeshStandardMaterial({ color: '#d5d8dc', roughness: 0.5, metalness: 0.3 });
  const bridgeGlass = new MeshStandardMaterial({ color: '#7fa7bd', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.6 });
  const doorX = -2 + 9.5 * 0.8;
  const z0 = -D / 2 - 0.2;
  const z1 = -21 + 1.9 * 0.8 + 0.2;
  const len = z0 - z1;
  box(root, 2.2, 2.4, len, bridgeMat, doorX, 2.2, (z0 + z1) / 2);
  for (const s of [-1, 1]) box(root, 0.05, 0.6, len - 1, bridgeGlass, doorX + s * 1.11, 2.5, (z0 + z1) / 2);
  for (const z of [z0 - len * 0.3, z0 - len * 0.75]) {
    box(root, 0.3, 1.0, 0.3, bridgeMat, doorX, 0.5, z);
    box(root, 1.6, 0.3, 0.5, new MeshStandardMaterial({ color: '#2d2d33' }), doorX, 0.15, z);
  }

  // Another plane taxiing slowly along the far taxiway, back and forth.
  const taxiing = airliner(0.55);
  taxiing.position.set(-90, taxiing.position.y, -50);
  scene.add(taxiing);
  let dir = 1;

  return {
    boarding: (dest) => {
      const tex = boardTexture(lines(dest));
      boardMat.map?.dispose();
      boardMat.map = tex;
      boardMat.emissiveMap = tex;
      boardMat.needsUpdate = true;
    },
    update: (dt) => {
      taxiing.position.x += dir * 6 * dt;
      if (Math.abs(taxiing.position.x) > 95) {
        dir = -dir;
        taxiing.rotation.y = dir > 0 ? 0 : Math.PI;
      }
    },
  };
}
