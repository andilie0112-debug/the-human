import { ACESFilmicToneMapping, PerspectiveCamera, Timer } from 'three';
import { createRenderer } from './engine/renderer';
import { createOrbitRig } from './engine/cameraRig';
import { createPreviewRoom } from './home/stylePreviewRoom';
import { HUMAN_SKIN_TONES as TONE, HumanModel, type HumanLook } from './characters/humanModel';
import { t } from './data/strings';

// Art-direction preview: a cosy kos room and a character that moves naturally.

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const hud = document.querySelector<HTMLDivElement>('#hud');
const controlsEl = document.querySelector<HTMLDivElement>('#controls');
const slidersEl = document.querySelector<HTMLDivElement>('#sliders');
if (!canvas || !hud || !controlsEl || !slidersEl) throw new Error('Missing page elements');

hud.innerHTML = '<h1></h1><p></p>';
hud.querySelector('h1')!.textContent = t('style.title');
hud.querySelector('p')!.textContent = t('style.hint');

const renderer = createRenderer(canvas);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const camera = new PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(4.2, 4.6, 5.6);
const controls = createOrbitRig(camera, canvas);
controls.target.set(0, 0.7, -0.2);
controls.minDistance = 4;
controls.maxDistance = 22;
controls.update();

const room = createPreviewRoom();
// A few everyday Indonesian looks; each tap shows the next person.
const LOOKS: HumanLook[] = [
  { body: 'male', skinTone: TONE[2], hair: 'Hair_SimpleParted', hairColor: '#1a1310', shirtColor: '#f2c14e', pantsColor: '#2f3a52', shoesColor: '#f2f2f2' },
  { body: 'female', skinTone: TONE[1], hair: 'Hair_Long', hairColor: '#1c1411', shirtColor: '#e8747c', longSleeve: true, pantsColor: '#efe8dc', shoesColor: '#8a5a3a' },
  { body: 'male', skinTone: TONE[3], hair: 'Hair_Buzzed', hairColor: '#120e0c', beard: true, shirtColor: '#4f9a8a', pantsColor: '#3b3b40', shorts: true, shoesColor: '#222222' },
  { body: 'female', skinTone: TONE[0], hair: 'Hair_Buns', hairColor: '#2a1c15', shirtColor: '#9cc5e8', pantsColor: '#4a3d6b', shoesColor: '#ffffff' },
  { body: 'male', skinTone: TONE[4], hair: 'Hair_SimpleParted', hairColor: '#0f0c0a', shirtColor: '#ffffff', longSleeve: true, pantsColor: '#5d6b4c', shoesColor: '#3a2a1e' },
];

let character: HumanModel | null = null;
const shape = { muscle: 0.1, fat: 0.3 };

// Body shape sliders: preview of how exercise and diet will change the body.
function addSlider(label: string, key: keyof typeof shape): void {
  const row = document.createElement('label');
  const text = document.createElement('span');
  text.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.value = String(Math.round(shape[key] * 100));
  input.addEventListener('input', () => {
    shape[key] = Number(input.value) / 100;
    character?.setBodyShape(shape.muscle, shape.fat);
  });
  row.append(text, input);
  slidersEl!.append(row);
}
addSlider(t('style.muscle'), 'muscle');
addSlider(t('style.fat'), 'fat');
let modelIndex = 0;
let loading = false;

async function loadCharacter(index: number): Promise<void> {
  loading = true;
  const next = await HumanModel.load(LOOKS[index]);
  if (character) {
    next.root.position.copy(character.root.position);
    next.root.rotation.y = character.root.rotation.y;
    character.dispose();
  } else {
    next.root.position.set(0.2, 0, 1.2);
  }
  room.scene.add(next.root);
  next.setBodyShape(shape.muscle, shape.fat);
  character = next;
  loading = false;
}
void loadCharacter(modelIndex);

// Night/day toggle and back link
let night = false;
const toggle = document.createElement('button');
toggle.textContent = t('style.toNight');
toggle.addEventListener('click', () => {
  night = !night;
  room.setNight(night);
  toggle.textContent = night ? t('style.toDay') : t('style.toNight');
});
const back = document.createElement('a');
back.href = './';
back.textContent = t('style.back');
const swap = document.createElement('button');
swap.textContent = t('style.swap');
swap.addEventListener('click', () => {
  if (loading) return;
  modelIndex = (modelIndex + 1) % LOOKS.length;
  void loadCharacter(modelIndex);
});
controlsEl.append(back, swap, toggle);

// Wander between spots in the room, pausing to look around.
const spots: ReadonlyArray<readonly [number, number]> = [
  [-1.0, 0.6], [1.3, -0.5], [-0.3, -1.0], [1.8, 0.9], [0.2, 1.2],
];
let spot = 0;
let waitLeft = 1.5;
const SPEED = 1.0; // m/s, roughly matches the walk clip's stride

function angleLerp(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function update(dt: number): void {
  room.fanBlades.rotation.z -= dt * 14;
  if (!character) return;
  const body = character.root;
  const [tx, tz] = spots[spot];
  const dx = tx - body.position.x;
  const dz = tz - body.position.z;
  const dist = Math.hypot(dx, dz);

  if (waitLeft > 0) {
    waitLeft -= dt;
    character.play('Idle_Loop');
  } else if (dist > 0.05) {
    character.play('Walk_Loop');
    const heading = Math.atan2(dx, dz);
    body.rotation.y = angleLerp(body.rotation.y, heading, Math.min(1, dt * 6));
    const step = Math.min(dist, SPEED * dt);
    body.position.x += (dx / dist) * step;
    body.position.z += (dz / dist) * step;
  } else {
    spot = (spot + 1) % spots.length;
    waitLeft = 2 + Math.random() * 2.5;
  }
  character.update(dt);
}

let userMovedCamera = false;
controls.addEventListener('start', () => {
  userMovedCamera = true;
});

/** Pulls the camera back until the whole room fits, in portrait and landscape. */
function fitRoom(): void {
  const radius = 3.6; // roughly half the room diagonal plus margin
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const dist = radius / Math.sin(Math.min(vFov, hFov) / 2);
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, Math.min(dist, controls.maxDistance));
}

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (!userMovedCamera) fitRoom();
}
window.addEventListener('resize', resize);
resize();

const timer = new Timer();
timer.connect(document);
function frame(time: number): void {
  timer.update(time);
  update(Math.min(timer.getDelta(), 0.1));
  controls.update();
  room.updateCutaway(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  renderer.render(room.scene, camera);
}
renderer.setAnimationLoop(frame);
document.addEventListener('visibilitychange', () => {
  renderer.setAnimationLoop(document.hidden ? null : frame);
});
