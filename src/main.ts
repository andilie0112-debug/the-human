import { PerspectiveCamera, Timer } from 'three';
import { createRenderer } from './engine/renderer';
import { createOrbitRig } from './engine/cameraRig';
import { createTestScene } from './engine/testScene';
import { validateGameData } from './data';
import { t } from './data/strings';

const issues = validateGameData();
if (issues.length > 0) console.warn('Data validation issues:', issues);

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const hud = document.querySelector<HTMLDivElement>('#hud');
if (!canvas || !hud) throw new Error('Missing #game canvas or #hud');

hud.innerHTML = `<h1></h1><p></p>`;
hud.querySelector('h1')!.textContent = t('game.title');
hud.querySelector('p')!.textContent = t('m0.hint');

const styleLink = document.createElement('a');
styleLink.href = './style.html';
styleLink.textContent = t('m0.styleLink');
document.querySelector('#controls')?.append(styleLink);

const renderer = createRenderer(canvas);
const camera = new PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(6, 6, 8);
const controls = createOrbitRig(camera, canvas);
const { scene, character } = createTestScene();

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
timer.connect(document); // ignores the time spent while the tab is hidden
let elapsed = 0;

function frame(time: number): void {
  timer.update(time);
  elapsed += timer.getDelta();
  character.rotation.y = Math.sin(elapsed * 0.6) * 0.8; // gentle idle so the scene looks alive
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

// Pause rendering when the tab is hidden (performance budget).
document.addEventListener('visibilitychange', () => {
  renderer.setAnimationLoop(document.hidden ? null : frame);
});
