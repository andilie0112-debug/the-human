import { BoxGeometry, CanvasTexture, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Scene, type Material } from 'three';
import { pbr } from '../../engine/pbr';
import { mergeStatic } from '../../home/mergeStatic';
import { HAIRSTYLES, HUMAN_SKIN_TONES, HumanModel, type HumanClip, type HumanLook } from '../../characters/humanModel';
import { randomLook } from '../pedestrians';
import type { InteriorSpace, Zone } from '../interior';
import { addStationDetail, type StationDetail } from './station';
import { addAirportDetail, type AirportDetail } from './airport';
import { addCafe, type Seat } from './cafe';
import { addWorship, worshipLayout } from './worship';
import { Congregation, type CongregationState } from './congregation';
import { IncenseSmoke, TapWater } from './particles';
import { addWalkin, type Pose, type Station, type WalkinLayout } from './walkin';
import type { Box2 } from '../neighborhood';

// Public buildings you walk through: the hospital (registration, waiting room, doctor's room,
// pharmacy), the train station (ticket office, gates, platform with a train) and the airport
// (check-in, X-ray security, departure gate with a plane outside), a café (order at the
// counter, sit at a table) and the houses of worship (pray at the focal point). Entrance at +z.

export type FacilityKind = 'hospital' | 'station' | 'airport' | 'cafe' | 'worship' | 'walkin';

export interface FacilityOptions {
  /** Station: train destinations; airport: flight destinations. */
  destinations?: string[];
  /** House of worship: the religion it belongs to. */
  religion?: string;
  /** Café: lines on the chalk menu. */
  menu?: string[];
  /** Walk-in place: which one (warung, market, gym, mall, police, clinic). */
  variant?: string;
  /** House of worship: whether a service is gathering or on now (and how far along). */
  congregation?: () => CongregationState;
}

export interface FacilitySpace extends InteriorSpace {
  /** Brings in the train (station) or shows the plane boarding (airport). */
  arrive: (dest?: string) => void;
  /** Station details (train timetable, announcements); null elsewhere. */
  station: () => StationDetail | null;
  /** Where to place the player for an activity (café seat, prayer spot). */
  spot: (id: 'seat' | 'prayer' | 'wudhu') => { x: number; z: number; heading: number } | null;
  /** Hospital: shows a queue number on the waiting-room screen. */
  callNumber: (text: string) => void;
  /** Hospital: the screen calls the next number (chime). */
  onChime: (() => void) | null;
  /** House of worship: the people at the service, the ablution taps. */
  worship: () => { congregation: Congregation | null; water: TapWater | null; join: { x: number; z: number; heading: number; sit?: boolean } } | null;
  /** Walk-in places: the activity spot behind a zone. */
  activity: (zoneId: string) => (Station & { pose: Pose }) | null;
}

/** The hospital's queue screen. */
function queueTexture(number: string, counter: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0e2a22';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#9be7c4';
  g.font = 'bold 30px sans-serif';
  g.fillText('NOMOR ANTREAN', 24, 48);
  g.fillStyle = '#ffffff';
  g.font = 'bold 110px sans-serif';
  g.fillText(number, 24, 170);
  g.fillStyle = '#ffd36b';
  g.font = '28px sans-serif';
  g.fillText(counter, 24, 226);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

interface Counter {
  x: number;
  z: number;
  w: number;
  staff: Partial<HumanLook>;
  heading?: number;
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

export function buildFacility(kind: FacilityKind, zoneLabels: Record<string, string>, opts: FacilityOptions = {}): FacilitySpace {
  const stationDestinations = opts.destinations ?? ['Bogor', 'Bekasi', 'Tangerang', 'Rangkasbitung'];
  const religion = opts.religion ?? 'islam';
  const holy = kind === 'worship' ? worshipLayout(religion) : null;
  const scene = new Scene();
  scene.background = new Color(kind === 'airport' ? '#bfe0f5' : kind === 'worship' && religion === 'hindu' ? '#a9cde6' : '#2b2f35');
  scene.add(new HemisphereLight('#ffffff', '#b8b2a6', 1.6));
  const sun = new DirectionalLight('#ffffff', 1.1);
  sun.position.set(3, 8, 5);
  scene.add(sun);
  const g = new Group();
  scene.add(g);
  const colliders: Box2[] = [];
  const solid = (x0: number, z0: number, x1: number, z1: number): void => {
    colliders.push({ x0, z0, x1, z1 });
  };
  const walk: WalkinLayout | null = kind === 'walkin' ? addWalkin(opts.variant ?? 'warung', g, solid) : null;
  const W = walk ? walk.W : kind === 'airport' ? 20 : kind === 'station' ? 18 : kind === 'cafe' ? 12 : kind === 'worship' ? 14 : 16;
  const D = walk ? walk.D : kind === 'station' ? 15 : kind === 'cafe' ? 10 : kind === 'worship' ? 13 : 12;
  // The station's floor stops at the platform edge (the tracks lie lower).
  const floorDepth = kind === 'station' ? D / 2 + 3.5 : D;
  const floorMat =
    walk ? pbr(walk.floor.texture, { repeat: [W / 1.5, D / 1.5], tint: walk.floor.tint, roughness: 0.4 })
    : kind === 'cafe' ? pbr('wood_light', { repeat: [W / 2, D / 2], tint: '#c9a27a' })
    : holy ? pbr(religion === 'hindu' ? 'paving' : 'tiles_cream', { repeat: [W / 1.5, D / 1.5], tint: holy.floorTint, roughness: 0.4 })
    : pbr(kind === 'hospital' ? 'floor_tile' : 'tiles_cream', { repeat: [W / 1.5, D / 1.5], tint: kind === 'hospital' ? '#f4f7f6' : '#ffffff', roughness: 0.3 });
  const floor = new Mesh(new PlaneGeometry(W, floorDepth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = D / 2 - floorDepth / 2;
  g.add(floor);
  const wall = pbr('plaster', { tint: walk ? walk.wallTint : holy ? holy.wallTint : kind === 'cafe' ? '#e9dfcf' : kind === 'hospital' ? '#eef5f1' : '#f1ede6', repeat: [5, 2], normalScale: 0.2 });
  const ACCENT: Record<FacilityKind, string> = { walkin: walk?.accent ?? '#555555', hospital: '#1e8449', station: '#7b241c', airport: '#1f3a68', cafe: '#3e2a18', worship: religion === 'islam' ? '#1e6b4f' : religion === 'konghucu' ? '#b0281f' : religion === 'hindu' ? '#5d4a36' : religion === 'buddha' ? '#c9a227' : '#6b4a2e' };
  const accent = new MeshStandardMaterial({ color: ACCENT[kind], roughness: 0.5 });
  if (kind === 'airport') {
    // A glass wall onto the apron: low sill, header and mullions.
    box(g, W, 0.3, 0.2, wall, 0, 0.15, -D / 2);
    box(g, W, 0.5, 0.2, wall, 0, 3.15, -D / 2);
    const mullion = new MeshStandardMaterial({ color: '#5d6d7e', roughness: 0.4, metalness: 0.5 });
    for (let x = -W / 2; x <= W / 2; x += 2.5) box(g, 0.08, 2.6, 0.1, mullion, x, 1.6, -D / 2 + 0.2);
  } else {
    box(g, W, 3.4, 0.2, wall, 0, 1.7, -D / 2);
  }
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

  let station: StationDetail | null = null;
  let holy2: { congregation: Congregation | null; water: TapWater | null; join: { x: number; z: number; heading: number; sit?: boolean } } | null = null;
  let smoke: IncenseSmoke | null = null;
  let airport: AirportDetail | null = null;
  let seats: Seat[] = [];
  const spots: Partial<Record<'seat' | 'prayer' | 'wudhu', { x: number; z: number; heading: number }>> = {};
  let queueScreen: MeshStandardMaterial | null = null;
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
    // Queue screen above the waiting room.
    queueScreen = new MeshStandardMaterial({ map: queueTexture('A-012', 'Loket Poli Umum'), emissive: '#ffffff', emissiveIntensity: 0.3 });
    queueScreen.emissiveMap = queueScreen.map;
    const screen = new Mesh(new PlaneGeometry(1.9, 0.95), queueScreen);
    screen.position.set(-4.2, 2.3, -2.42);
    g.add(screen);
    box(g, 2.0, 1.05, 0.06, new MeshStandardMaterial({ color: '#1c1c1c' }), -4.2, 2.3, -2.47);
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
  } else if (walk) {
    for (const st of walk.stations) zones.push({ id: st.id, label: zoneLabels[st.actionId] ?? st.id, x: st.x, z: st.z, r: 1.1 });
    for (const st of walk.staff) counters.push({ x: st.x, z: st.z, w: 0, staff: st.look, heading: st.heading });
  } else if (kind === 'cafe') {
    seats = addCafe(g, W, D, solid, opts.menu ?? []);
    counters.push({ x: -2.6, z: -D / 2 + 0.85, w: 0, staff: { shirtColor: '#3e2a18', topStyle: 'polo', pantsColor: '#1c1a18' } });
    zone('kasir', -2, -D / 2 + 2.7, 1.2);
    spots.seat = seats[0];
    zone('meja', seats[0].x, seats[0].z, 1.0);
  } else if (kind === 'worship') {
    const lay = addWorship(g, W, D, religion, solid);
    holy2 = { congregation: opts.congregation ? new Congregation(scene, lay, religion, opts.congregation) : null, water: lay.taps.length ? new TapWater(scene, lay.taps) : null, join: lay.join };
    smoke = lay.incense.length ? new IncenseSmoke(scene, lay.incense) : null;
    if (religion === 'buddha' || religion === 'konghucu') zone('dupa', lay.incense[0].x + 0.9, lay.incense[0].z + 0.6, 0.9);
    spots.prayer = lay.prayer;
    zone('ibadah', lay.prayer.x, lay.prayer.z, 1.3);
    if (lay.wudhu) {
      spots.wudhu = { ...lay.wudhu, heading: Math.PI / 2 };
      zone('wudhu', lay.wudhu.x, lay.wudhu.z, 1.0);
    }
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
    const detailRoot = new Group();
    scene.add(detailRoot);
    airport = addAirportDetail(scene, detailRoot, W, D, stationDestinations);
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
      m.root.rotation.y = c.heading ?? 0;
      m.play('Idle_Loop', 0);
      scene.add(m.root);
      staff.push(m);
    });
  }

  // Other visitors waiting: on the platform, at the gate, in the waiting room.
  const WAITING: Record<FacilityKind, [number, number, number, HumanClip][]> = {
    station: [[-6, -2.1, Math.PI, 'Idle_FoldArms_Loop'], [-3.4, -2.4, Math.PI * 0.9, 'Idle_TalkingPhone_Loop'], [4.2, -2.2, Math.PI, 'Idle_Loop'], [6.6, -2.0, Math.PI * 1.1, 'Idle_FoldArms_Loop']],
    airport: [[3.2, -4.6, Math.PI, 'Idle_FoldArms_Loop'], [4.4, -4.9, Math.PI * 1.1, 'Idle_Loop'], [-1.5, -1.4, Math.PI * 0.6, 'Idle_TalkingPhone_Loop']],
    hospital: [[3.2, 0.6, -Math.PI / 2, 'Idle_TalkingPhone_Loop'], [-4.4, 0, Math.PI, 'Idle_FoldArms_Loop']],
    cafe: [],
    walkin: (walk?.visitors ?? []).filter((v) => !v.sit).map((v) => [v.x, v.z, v.heading, v.clip ?? 'Idle_Loop'] as [number, number, number, HumanClip]),
    // Outside service times a visitor or two looks around quietly.
    worship: spots.prayer && !holy2?.congregation ? [[spots.prayer.x - 2.2, spots.prayer.z + 2.4, Math.PI, 'Idle_Loop']] : [],
  };
  // People sitting: waiting patients and passengers, café guests.
  const SITTING: Record<FacilityKind, [number, number, number, HumanClip][]> = {
    hospital: [[-1.5, 1.47, 0, 'Sitting_Idle_Loop'], [0.9, 0.07, 0, 'Sitting_Talking_Loop']],
    airport: [[-5.4, -1.93, 0, 'Sitting_Idle_Loop'], [-3.0, -2.93, 0, 'Sitting_Idle_Loop']],
    cafe: seats.slice(2, 7).filter((_, i) => i !== 1).map((st, i) => [st.x, st.z, st.heading, i % 2 ? 'Sitting_Talking_Loop' : 'Sitting_Idle_Loop']),
    station: [],
    worship: [],
    walkin: (walk?.visitors ?? []).filter((v) => v.sit).map((v) => [v.x, v.z, v.heading, 'Sitting_Idle_Loop'] as [number, number, number, HumanClip]),
  };
  for (const [x, z, heading, clip] of SITTING[kind]) {
    void HumanModel.load(randomLook()).then((m) => {
      m.root.position.set(x, 0, z);
      m.root.rotation.y = heading;
      m.play(clip, 0, 0.9 + Math.random() * 0.2);
      if (opts.variant === 'work_office') m.setGesture('type');
      scene.add(m.root);
      staff.push(m);
    });
  }
  // A nurse walking between the counters.
  let nurse: HumanModel | null = null;
  let nurseDir = 1;
  if (kind === 'hospital') {
    void HumanModel.load({ ...randomLook(), body: 'female', hair: HAIRSTYLES.female[0], ...UNIFORM.nurse, hijab: true, hijabColor: '#e8f4f8' }).then((m) => {
      m.root.position.set(-4, 0, 1.0);
      m.root.rotation.y = Math.PI / 2;
      m.play('Walk_Loop', 0, 0.95);
      scene.add(m.root);
      nurse = m;
    });
  }
  // Hospital screen: the next number every so often.
  let queueNo = 12;
  let queueTimer = 14;
  const showNumber = (text: string): void => {
    if (!queueScreen) return;
    queueScreen.map?.dispose();
    const tex = queueTexture(text, 'Loket Poli Umum');
    queueScreen.map = tex;
    queueScreen.emissiveMap = tex;
    queueScreen.needsUpdate = true;
  };
  for (const [x, z, heading, clip] of WAITING[kind]) {
    void HumanModel.load(randomLook()).then((m) => {
      m.root.position.set(x, 0, z);
      m.root.rotation.y = heading;
      m.play(clip, 0, 0.85 + Math.random() * 0.3);
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
    // Big halls (mall, market, airport, station): a higher camera so signs and shops show.
    cam: W >= 16 ? { dist: 5.2, height: 4.2 } : undefined,
    arrive: (dest) => {
      station?.callTrain();
      if (dest) airport?.boarding(dest);
    },
    station: () => station,
    spot: (id) => spots[id] ?? null,
    callNumber: (text) => {
      queueTimer = 30;
      showNumber(text);
    },
    onChime: null,
    activity: (zoneId) => walk?.stations.find((st) => st.id === zoneId) ?? null,
    worship: () => holy2,
    update: (dt) => {
      for (const m of staff) m.update(dt);
      station?.update(dt);
      airport?.update(dt);
      holy2?.congregation?.update(dt);
      holy2?.water?.update(dt);
      smoke?.update(dt);
      if (nurse) {
        const n: HumanModel = nurse;
        n.root.position.x += nurseDir * 0.95 * dt;
        if (Math.abs(n.root.position.x) > 4.2) {
          nurseDir = -nurseDir;
          n.root.position.x = Math.sign(n.root.position.x) * 4.2;
          n.root.rotation.y = nurseDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        n.update(dt);
      }
      if (queueScreen) {
        queueTimer -= dt;
        if (queueTimer <= 0) {
          queueTimer = 16 + Math.random() * 8;
          queueNo++;
          showNumber(`A-${String(queueNo).padStart(3, '0')}`);
          space.onChime?.();
        }
      }
    },
    dispose: () => {
      for (const m of staff) m.dispose();
      (nurse as HumanModel | null)?.dispose();
      holy2?.congregation?.dispose();
      holy2?.water?.dispose();
      smoke?.dispose();
      scene.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    },
  };
  return space;
}
