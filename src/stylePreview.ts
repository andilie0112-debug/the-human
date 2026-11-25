import { ACESFilmicToneMapping, PerspectiveCamera, Timer } from 'three';
import { createRenderer } from './engine/renderer';
import { createOrbitRig } from './engine/cameraRig';
import { createPreviewRoom } from './home/stylePreviewRoom';
import { createFigure, poseFigure } from './characters/placeholderFigure';
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
const rig = createFigure({ skin: '#c98e62', hair: '#1f1712', shirt: '#f2c14e', pants: '#3b4a63', shoes: '#f5f5f5' });
room.scene.add(rig.root);

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
controlsEl.append(back, toggle);

// Wander between spots in the room, pausing to look around.
const spots: ReadonlyArray<readonly [number, number]> = [
  [-1.0, 0.6], [1.3, -0.5], [-0.3, -1.0], [1.8, 0.9], [0.2, 1.2],
];
let spot = 0;
let waitLeft = 1.5;
let walkBlend = 0;
let phase = 0;
let elapsed = 0;
const SPEED = 1.1; // m/s
rig.root.position.set(0.2, 0, 1.2);

function angleLerp(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function update(dt: number): void {
  elapsed += dt;
  const [tx, tz] = spots[spot];
  const dx = tx - rig.root.position.x;
  const dz = tz - rig.root.position.z;
  const dist = Math.hypot(dx, dz);
  let moving = false;

  if (waitLeft > 0) {
    waitLeft -= dt;
  } else if (dist > 0.05) {
    moving = true;
    const heading = Math.atan2(dx, dz);
    rig.root.rotation.y = angleLerp(rig.root.rotation.y, heading, Math.min(1, dt * 6));
    // Ease in/out: speed follows the walk blend, and slows near the target.
    const step = Math.min(dist, SPEED * walkBlend * Math.min(1, dist / 0.4 + 0.3) * dt);
    rig.root.position.x += (dx / dist) * step;
    rig.root.position.z += (dz / dist) * step;
    phase += step * 5.2;
  } else {
    spot = (spot + 1) % spots.length;
    waitLeft = 1.8 + Math.random() * 2;
  }

  walkBlend += ((moving ? 1 : 0) - walkBlend) * Math.min(1, dt * 4);
  poseFigure(rig, elapsed, phase, walkBlend);
  room.fanBlades.rotation.z -= dt * 14;
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
