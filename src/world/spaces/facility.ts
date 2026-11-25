import { BoxGeometry, Color, CylinderGeometry, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PlaneGeometry, Scene, type Material } from 'three';
import { pbr } from '../../engine/pbr';
import { mergeStatic } from '../../home/mergeStatic';
import { HAIRSTYLES, HUMAN_SKIN_TONES, HumanModel, type HumanLook } from '../../characters/humanModel';
import type { InteriorSpace, Zone } from '../interior';
import { addStationDetail, type StationDetail } from './station';
import type { Box2 } from '../neighborhood';

// Public buildings you walk through: the hospital (registration, waiting room, doctor's room,
// pharmacy), the train station (ticket office, gates, platform with a train) and the airport
// (check-in, X-ray security, departure gate with a plane outside). Entrance at +z.

export type FacilityKind = 'hospital' | 'station' | 'airport';

export interface FacilitySpace extends InteriorSpace {
  /** Brings in the train (station) or shows the plane boarding (airport). */
  arrive: () => void;
  /** Station details (train timetable, announcements); null elsewhere. */
  station: () => StationDetail | null;
}

interface Counter {
  x: number;
  z: number;
  w: number;
  staff: Partial<HumanLook>;
}

function box(g: Group, w: number, h: number, d: number, m: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

const UNIFORM: Record<string, Partial<HumanLook>> = {
  nurse: { shirtColor: '#e8f4f8', topStyle: 'kemeja', pantsColor: '#e8f4f8', bottomStyle: 'chino', shoeStyle: 'sneakers' },
  doctor: { shirtColor: '#ffffff', topStyle: 'jaket', pantsColor: '#2f3a52', shoeStyle: 'pantofel', glasses: 'kotak' },
  pharmacist: { shirtColor: '#2e86c1', topStyle: 'polo', pantsColor: '#2d2d33' },
  rail: { shirtColor: '#1f3a68', topStyle: 'kemeja', pantsColor: '#1c1a18', shoeStyle: 'pantofel' },
  air: { shirtColor: '#7b241c', topStyle: 'kemeja', pantsColor: '#1c1a18', shoeStyle: 'pantofel' },
  security: { shirtColor: '#2d2d33', topStyle: 'kemeja', pantsColor: '#2d2d33', shoeStyle: 'pantofel' },
};

export function buildFacility(kind: FacilityKind, zoneLabels: Record<string, string>, stationDestinations: string[] = ['Bogor', 'Bekasi', 'Tangerang', 'Rangkasbitung']): FacilitySpace {
  const scene = new Scene();
  scene.background = new Color(kind === 'airport' ? '#bfe0f5' : '#2b2f35');
  scene.add(new HemisphereLight('#ffffff', '#b8b2a6', 1.6));
  const sun = new DirectionalLight('#ffffff', 1.1);
  sun.position.set(3, 8, 5);
  scene.add(sun);
  const W = kind === 'airport' ? 20 : kind === 'station' ? 18 : 16;
  const D = kind === 'station' ? 15 : 12;
  const g = new Group();
  scene.add(g);
  const colliders: Box2[] = [];
  const solid = (x0: number, z0: number, x1: number, z1: number): void => {
    colliders.push({ x0, z0, x1, z1 });
  };
  // The station's floor stops at the platform edge (the tracks lie lower).
  const floorDepth = kind === 'station' ? D / 2 + 3.5 : D;
  const floor = new Mesh(new PlaneGeometry(W, floorDepth), pbr(kind === 'hospital' ? 'floor_tile' : 'tiles_cream', { repeat: [W / 1.5, D / 1.5], tint: kind === 'hospital' ? '#f4f7f6' : '#ffffff', roughness: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = D / 2 - floorDepth / 2;
  g.add(floor);
  const wall = pbr('plaster', { tint: kind === 'hospital' ? '#eef5f1' : '#f1ede6', repeat: [5, 2], normalScale: 0.2 });
  const accent = new MeshStandardMaterial({ color: kind === 'hospital' ? '#1e8449' : kind === 'station' ? '#7b241c' : '#1f3a68', roughness: 0.5 });
  box(g, W, 3.4, 0.2, wall, 0, 1.7, -D / 2);
  box(g, 0.2, 3.4, D, wall, -W / 2, 1.7, 0);
  box(g, 0.2, 3.4, D, wall, W / 2, 1.7, 0);
  box(g, W, 0.3, 0.22, accent, 0, 3.0, -D / 2 + 0.02);
  for (const s of [-1, 1]) box(g, W / 2 - 1.2, 3.4, 0.2, wall, s * (W / 4 + 0.6), 1.7, D / 2);
  solid(-W / 2, -D / 2 - 0.3, W / 2, -D / 2 + 0.1);
  solid(-W / 2 - 0.3, -D / 2, -W / 2 + 0.1, D / 2);
  solid(W / 2 - 0.1, -D / 2, W / 2 + 0.3, D / 2);
  solid(-W / 2, D / 2 - 0.1, -1.2, D / 2 + 0.3);
  solid(1.2, D / 2 - 0.1, W / 2, D / 2 + 0.3);

  const counterMat = pbr('wood_light', { tint: '#f3efe8' });
  const top = new MeshStandardMaterial({ color: '#4a4d52', roughness: 0.3 });
  const counters: Counter[] = [];
  const counter = (x: number, z: number, w: number, staff: Partial<HumanLook>): void => {
    box(g, w, 1.05, 0.7, counterMat, x, 0.52, z);
    box(g, w + 0.1, 0.05, 0.8, top, x, 1.07, z);
    solid(x - w / 2, z - 0.4, x + w / 2, z + 0.4);
    counters.push({ x, z, w, staff });
  };
  const chairs = (x0: number, z: number, n: number): void => {
    const seat = new MeshStandardMaterial({ color: '#2e86c1', roughness: 0.5 });
    for (let i = 0; i < n; i++) {
      box(g, 0.5, 0.08, 0.5, seat, x0 + i * 0.6, 0.45, z);
      box(g, 0.5, 0.5, 0.06, seat, x0 + i * 0.6, 0.72, z - 0.25);
    }
    box(g, n * 0.6, 0.05, 0.4, new MeshStandardMaterial({ color: '#8a9399', metalness: 0.6, roughness: 0.4 }), x0 + (n - 1) * 0.3, 0.3, z);
    solid(x0 - 0.3, z - 0.35, x0 + n * 0.6 - 0.3, z + 0.3);
  };
  const zones: Zone[] = [];
  const zone = (id: string, x: number, z: number, r = 1.3): void => {
    zones.push({ id, label: zoneLabels[id] ?? id, x, z, r });
  };
  zone('exit', 0, D / 2 - 0.2, 0.9);

  let trainOrPlane: Group | null = null;
  let station: StationDetail | null = null;
  if (kind === 'hospital') {
    counter(-5, 2.2, 3, UNIFORM.nurse); // registration
    zone('loket', -5, 3.4, 1.9);
    counter(5, 2.2, 3, UNIFORM.pharmacist); // pharmacy
    zone('apotek', 5, 3.4, 1.9);
    for (const z of [-0.2, 1.2]) chairs(-2.1, z, 8);
    zone('tunggu', 0, 0.5, 2.2);
    // Doctor's room: a partition with a doorway, a desk and the doctor.
    box(g, W * 0.45, 3, 0.15, wall, -W * 0.275 - 1, 1.5, -2.6);
    box(g, W * 0.45, 3, 0.15, wall, W * 0.275 + 1, 1.5, -2.6);
    solid(-W / 2, -2.7, -1.2, -2.5);
    solid(1.2, -2.7, W / 2, -2.5);
    box(g, 1.6, 0.75, 0.8, counterMat, 0, 0.38, -4.6);
    solid(-0.8, -5.0, 0.8, -4.2);
    box(g, 0.9, 0.6, 1.9, new MeshStandardMaterial({ color: '#d6eaf8', roughness: 0.7 }), 4, 0.5, -4.6); // examination bed
    solid(3.5, -5.6, 4.5, -3.6);
    counters.push({ x: 0, z: -5.4, w: 0, staff: UNIFORM.doctor });
    zone('dokter', 0, -3.7, 1.2);
    box(g, 2.4, 0.5, 0.06, accent, 0, 2.6, -2.5); // "Poli Umum" sign
  } else if (kind === 'station') {
    counter(-6, 2.5, 4, UNIFORM.rail);
    zone('loket', -6, 3.6, 1.9);
    // Tap gates across the hall, with green lights on top.
    const gateMat = new MeshStandardMaterial({ color: '#b8c0c7', metalness: 0.6, roughness: 0.3 });
    const lamp = new MeshStandardMaterial({ color: '#2ecc71', emissive: '#2ecc71', emissiveIntensity: 0.8 });
    for (let x = -W / 2 + 1; x < W / 2 - 1; x += 1.4) {
      if (Math.abs(x - 0.4) < 0.6) continue;
      box(g, 0.25, 1.0, 1.2, gateMat, x, 0.5, 0);
      box(g, 0.2, 0.05, 0.2, lamp, x, 1.03, 0.4);
      solid(x - 0.15, -0.6, x + 0.15, 0.6);
    }
    solid(-W / 2, -0.6, -0.5, 0.6);
    solid(1.3, -0.6, W / 2, 0.6);
    zone('gerbang', 0.4, 1.2);
    zone('peron', 0, -2.6, 2.4);
    const detailRoot = new Group();
    scene.add(detailRoot);
    station = addStationDetail(scene, detailRoot, W, D, solid, stationDestinations);
  } else {
    counter(-6, 2.6, 5, UNIFORM.air);
    zone('checkin', -6, 3.7, 1.9);
    // X-ray security frame and belt.
    const frameMat = new MeshStandardMaterial({ color: '#d5d8dc', roughness: 0.4, metalness: 0.3 });
    box(g, 0.2, 2.3, 0.8, frameMat, -0.75, 1.15, 0);
    box(g, 0.2, 2.3, 0.8, frameMat, 0.75, 1.15, 0);
    box(g, 1.7, 0.2, 0.8, frameMat, 0, 2.3, 0);
    box(g, 3, 0.9, 0.8, new MeshStandardMaterial({ color: '#34495e', roughness: 0.5 }), 3, 0.45, 0);
    solid(-W / 2, -0.4, -0.85, 0.4);
    solid(0.85, -0.4, W / 2, 0.4);
    counters.push({ x: -1.6, z: 0.9, w: 0, staff: UNIFORM.security });
    zone('xray', 0, 1.0);
    // Departure gate: seats and a big window onto the apron with a plane.
    for (const z of [-2.2, -3.2]) chairs(-6, z, 9);
    box(g, W - 2, 2.6, 0.05, new MeshStandardMaterial({ color: '#bcd6e2', transparent: true, opacity: 0.3, roughness: 0.05 }), 0, 1.6, -D / 2 + 0.25);
    zone('gate', 6, -3.5, 1.6);
    counters.push({ x: 7.5, z: -4.4, w: 0, staff: UNIFORM.air });
    trainOrPlane = new Group();
    const white = new MeshStandardMaterial({ color: '#f4f6f7', roughness: 0.35, metalness: 0.2 });
    const fuselage = new Mesh(new CylinderGeometry(2, 2, 30, 20), white);
    fuselage.rotation.z = Math.PI / 2;
    fuselage.position.y = 3;
    trainOrPlane.add(fuselage);
    box(trainOrPlane, 6, 0.3, 26, white, 0, 2.4, 0);
    box(trainOrPlane, 3, 4, 0.3, new MeshStandardMaterial({ color: '#1f3a68', roughness: 0.4 }), -13, 5.5, 0);
    trainOrPlane.position.set(2, 0, -20);
    scene.add(trainOrPlane);
    const apron = new Mesh(new PlaneGeometry(200, 60), pbr('concrete', { repeat: [40, 12], tint: '#9a9590' }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, -0.05, -36);
    scene.add(apron);
  }
  mergeStatic(g);

  // Staff behind their counters, facing the hall.
  const staff: HumanModel[] = [];
  for (const c of counters) {
    const female = Math.random() < 0.55;
    void HumanModel.load({
      body: female ? 'female' : 'male',
      skinTone: HUMAN_SKIN_TONES[1 + Math.floor(Math.random() * 3)],
      hair: HAIRSTYLES[female ? 'female' : 'male'][0],
      hairColor: '#1a1310',
      hijab: female && Math.random() < 0.6,
      hijabColor: '#efe8dc',
      shirtColor: '#ffffff',
      pantsColor: '#2d2d33',
      shoesColor: '#222222',
      ...c.staff,
    }).then((m) => {
      m.root.position.set(c.x, 0, c.z - (c.w > 0 ? 0.75 : 0));
      m.play('Idle_Loop', 0);
      scene.add(m.root);
      staff.push(m);
    });
  }

  const space: FacilitySpace = {
    scene,
    colliders,
    bounds: { x0: -W / 2 + 0.3, z0: -D / 2 + 0.3, x1: W / 2 - 0.3, z1: D / 2 + 0.4 },
    zones,
    spawn: { x: 0, z: D / 2 - 1.2, heading: Math.PI },
    arrive: () => {
      station?.callTrain();
    },
    station: () => station,
    update: (dt) => {
      for (const m of staff) m.update(dt);
      station?.update(dt);
    },
    dispose: () => {
      for (const m of staff) m.dispose();
      scene.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    },
  };
  return space;
}
