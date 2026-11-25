import { ACESFilmicToneMapping, PerspectiveCamera, Timer } from 'three';
import { createRenderer } from './engine/renderer';
import { createOrbitRig } from './engine/cameraRig';
import { createPreviewRoom } from './home/stylePreviewRoom';
import { CHARACTER_MODELS, CharacterModel, SKIN_TONES, type CharacterLook } from './characters/characterModel';
import { t } from './data/strings';

// Art-direction preview: a cosy kos room and a character that moves naturally.

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const hud = document.querySelector<HTMLDivElement>('#hud');
const controlsEl = document.querySelector<HTMLDivElement>('#controls');
if (!canvas || !hud || !controlsEl) throw new Error('Missing page elements');

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
controls.maxDistance = 16;
controls.update();

const room = createPreviewRoom();
// One look per model so every tap shows a different person.
const LOOKS: CharacterLook[] = [
  { skin: SKIN_TONES[2], hair: '#1c1410', shirt: '#f2c14e', pants: '#34405a', belt: '#3a2a1e' },
  { skin: SKIN_TONES[1], hair: '#241a14', shirt: '#e8747c', pants: '#f4efe6', belt: '#8a5a3a' },
  { skin: SKIN_TONES[3], hair: '#16110d', shirt: '#4f9a8a', pants: '#2d2d33', belt: '#2a2018' },
  { skin: SKIN_TONES[0], hair: '#2b1d16', shirt: '#9cc5e8', pants: '#5a4a7a', belt: '#3a2a1e' },
  { skin: SKIN_TONES[4], hair: '#0f0c0a', shirt: '#ffffff', pants: '#6b7d5a', belt: '#3a2a1e' },
  { skin: SKIN_TONES[2], hair: '#3a2418', shirt: '#c86b3c', pants: '#2e3a52', belt: '#5a3a24' },
];

let character: CharacterModel | null = null;
let modelIndex = 0;
let loading = false;

async function loadCharacter(index: number): Promise<void> {
  loading = true;
  const next = await CharacterModel.load(CHARACTER_MODELS[index], LOOKS[index]);
  if (character) {
    next.root.position.copy(character.root.position);
    next.root.rotation.y = character.root.rotation.y;
    character.dispose();
  } else {
    next.root.position.set(0.2, 0, 1.2);
  }
  room.scene.add(next.root);
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
  modelIndex = (modelIndex + 1) % CHARACTER_MODELS.length;
  void loadCharacter(modelIndex);
});
controlsEl.append(back, swap, toggle);

// Wander between spots in the room, pausing to look around.
const spots: ReadonlyArray<readonly [number, number]> = [
  [-1.0, 0.6], [1.3, -0.5], [-0.3, -1.0], [1.8, 0.9], [0.2, 1.2],
];
let spot = 0;
let waitLeft = 1.5;
const SPEED = 0.9; // m/s, matches the walk clip's stride

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
    character.play('Idle');
  } else if (dist > 0.05) {
    character.play('Walk');
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

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const timer = new Timer();
timer.connect(document);
function frame(time: number): void {
  timer.update(time);
  update(Math.min(timer.getDelta(), 0.1));
  controls.update();
  renderer.render(room.scene, camera);
}
renderer.setAnimationLoop(frame);
document.addEventListener('visibilitychange', () => {
  renderer.setAnimationLoop(document.hidden ? null : frame);
});
