import { CatmullRomCurve3, PerspectiveCamera, Vector3, ACESFilmicToneMapping } from 'three';
import { t } from '../data/strings';
import { createRenderer } from '../engine/renderer';
import { getAudio } from '../engine/audio';
import { createNeighborhood } from '../world/neighborhood';
import { Pedestrians } from '../world/pedestrians';
import { Traffic } from '../world/traffic';
import { PLACES } from '../world/outdoor';

// Animated title: a slow camera flight through the neighbourhood (motorbikes passing,
// neighbours walking, warung and mosque), short captions and music, then the menu on top.
// The first tap ("Ketuk untuk mulai") is also what browsers require before sound can play.

export interface IntroHandle {
  /** Fades the scene out and frees it (call when the game starts). */
  stop: () => void;
}

const CAPTIONS = ['intro.c1', 'intro.c2', 'intro.c3'] as const;

export function showIntro(onMenu: () => void): IntroHandle {
  const root = document.createElement('div');
  root.className = 'intro';
  const canvas = document.createElement('canvas');
  canvas.className = 'intro-canvas';
  const caption = document.createElement('div');
  caption.className = 'intro-caption';
  const tap = document.createElement('button');
  tap.className = 'intro-tap';
  tap.textContent = t('intro.tap');
  const skip = document.createElement('button');
  skip.className = 'intro-skip';
  skip.textContent = t('intro.skip');
  skip.hidden = true;
  root.append(canvas, caption, tap, skip);
  document.body.append(root);

  const renderer = createRenderer(canvas);
  renderer.toneMapping = ACESFilmicToneMapping;
  const hood = createNeighborhood(PLACES);
  hood.setNight(false);
  const traffic = new Traffic(hood.scene, 10);
  const walkers = new Pedestrians(hood.scene, 6);
  walkers.groundY = 0.14;
  const camera = new PerspectiveCamera(50, 1, 0.1, 220);

  // Along the main road from the kos to the mosque, swinging gently between both sides.
  const path = new CatmullRomCurve3([
    new Vector3(-54, 6, 6),
    new Vector3(-38, 3.2, 3),
    new Vector3(-22, 3.4, -2.5),
    new Vector3(-4, 3.8, 2.5),
    new Vector3(14, 3.4, -2),
    new Vector3(32, 4.2, 3),
    new Vector3(48, 7, 4),
  ]);
  const look = new CatmullRomCurve3([
    new Vector3(-40, 2, -12),
    new Vector3(-26, 2, -11),
    new Vector3(-12, 2, -12),
    new Vector3(0, 2.2, 14),
    new Vector3(24, 2.5, -12),
    new Vector3(42, 4, -14),
    new Vector3(60, 5, -10),
  ]);
  const p = new Vector3();
  const q = new Vector3();

  const resize = (): void => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  let time = 0;
  let last = performance.now();
  let started = false;
  let menuShown = false;
  const FLIGHT = 46; // seconds for one pass; then it flies back
  const frame = (): void => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    const u = (time % (FLIGHT * 2)) / FLIGHT;
    const s = u <= 1 ? u : 2 - u; // ping-pong
    const e = s * s * (3 - 2 * s) * 0.2 + s * 0.8;
    path.getPoint(e, p);
    look.getPoint(Math.min(1, e + 0.03), q);
    camera.position.copy(p);
    camera.lookAt(q);
    traffic.update(dt, walkers.positions());
    walkers.update(dt);
    renderer.render(hood.scene, camera);
    if (started && !menuShown) {
      const k = Math.floor((time - startAt) / 3.2);
      if (k < CAPTIONS.length) {
        const text = t(CAPTIONS[k]);
        if (caption.textContent !== text) {
          caption.classList.remove('on');
          void caption.offsetWidth; // restart the fade
          caption.textContent = text;
          caption.classList.add('on');
        }
      } else showMenu();
    }
  };
  renderer.setAnimationLoop(frame);

  let startAt = 0;
  const showMenu = (): void => {
    if (menuShown) return;
    menuShown = true;
    caption.classList.remove('on');
    skip.hidden = true;
    root.classList.add('menu');
    onMenu();
  };
  tap.addEventListener('click', () => {
    tap.remove();
    started = true;
    startAt = time;
    skip.hidden = false;
    getAudio().playMusic('menu');
  });
  skip.addEventListener('click', showMenu);

  return {
    stop: () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', resize);
      walkers.dispose();
      hood.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      root.remove();
    },
  };
}
