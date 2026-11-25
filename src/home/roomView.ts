import { ACESFilmicToneMapping, PerspectiveCamera, Timer, type Group, type Scene, type WebGLRenderer } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createRenderer } from '../engine/renderer';
import { createOrbitRig } from '../engine/cameraRig';

/**
 * Renderer, life-sim camera and the kos room, with a render loop that pauses while the tab is
 * hidden. `onUpdate` runs every frame with the frame delta in seconds: `dt` is capped for smooth
 * animation, `realDt` is the true elapsed time (capped at 1 s) so the game clock keeps real pace
 * even on slow devices.
 */
/** What a room must provide to be shown by a RoomView. */
export interface ViewableRoom {
  scene: Scene;
  updateCutaway: (dirX: number, dirZ: number) => void;
  fanBlades?: Group;
}

export interface RoomView<R extends ViewableRoom> {
  room: R;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  renderer: WebGLRenderer;
  start: (onUpdate: (dt: number, realDt: number) => void) => void;
}

export function createRoomView<R extends ViewableRoom>(canvas: HTMLCanvasElement, room: R, fitRadius = 3.6): RoomView<R> {
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

  let userMovedCamera = false;
  controls.addEventListener('start', () => {
    userMovedCamera = true;
  });

  /** Pulls the camera back until the whole room fits, in portrait and landscape. */
  const fitRoom = (): void => {
    const radius = fitRadius; // roughly half the room diagonal plus margin
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const dist = radius / Math.sin(Math.min(vFov, hFov) / 2);
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, Math.min(dist, controls.maxDistance));
  };

  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!userMovedCamera) fitRoom();
  };
  window.addEventListener('resize', resize);
  resize();

  const start = (onUpdate: (dt: number, realDt: number) => void): void => {
    const timer = new Timer();
    timer.connect(document);
    const frame = (time: number): void => {
      timer.update(time);
      const raw = timer.getDelta();
      const dt = Math.min(raw, 0.1);
      if (room.fanBlades) room.fanBlades.rotation.z -= dt * 14;
      onUpdate(dt, Math.min(raw, 1));
      controls.update();
      room.updateCutaway(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
      renderer.render(room.scene, camera);
    };
    renderer.setAnimationLoop(frame);
    document.addEventListener('visibilitychange', () => {
      renderer.setAnimationLoop(document.hidden ? null : frame);
    });
  };

  return { room, camera, controls, renderer, start };
}
