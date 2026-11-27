import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ACESFilmicToneMapping, PMREMGenerator, PerspectiveCamera, Timer, type Group, type Scene, type WebGLRenderer } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createRenderer } from '../engine/renderer';
import { createOrbitRig } from '../engine/cameraRig';
import { PostFX } from '../engine/post';
import { getQuality } from '../engine/graphics';

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
  /** Renders another scene (the neighborhood) instead of the room; null shows the room again. */
  setOverride: (o: { scene: Scene; camera: PerspectiveCamera } | null) => void;
}

export function createRoomView<R extends ViewableRoom>(canvas: HTMLCanvasElement, room: R, fitRadius = 3.6): RoomView<R> {
  const renderer = createRenderer(canvas);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  // Soft image-based light: a neutral room environment gives realistic reflections and bounce light.
  const pmrem = new PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const scene0 = (room as unknown as { scene?: Scene }).scene;
  if (scene0) {
    scene0.environment = envMap;
    scene0.environmentIntensity = 0.42;
  }

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
  // Ambient occlusion, glow and colour grade on Medium and High (plain rendering on Low).
  const q = getQuality();
  const post = q === 'low' ? null : new PostFX(renderer, room.scene, camera, q);
  window.addEventListener('resize', () => post?.setSize(window.innerWidth, window.innerHeight));

  let override: { scene: Scene; camera: PerspectiveCamera } | null = null;
  const setOverride = (o: { scene: Scene; camera: PerspectiveCamera } | null): void => {
    override = o;
    controls.enabled = o === null;
    if (o) {
      o.camera.aspect = window.innerWidth / window.innerHeight;
      o.camera.updateProjectionMatrix();
    }
  };
  window.addEventListener('resize', () => {
    if (!override) return;
    override.camera.aspect = window.innerWidth / window.innerHeight;
    override.camera.updateProjectionMatrix();
  });

  const start = (onUpdate: (dt: number, realDt: number) => void): void => {
    const timer = new Timer();
    timer.connect(document);
    const frame = (time: number): void => {
      timer.update(time);
      const raw = timer.getDelta();
      // Up to a quarter second per frame: slow phones still move in real time (walking splits
      // long frames into small steps, see PlayerController).
      const dt = Math.min(raw, 0.25);
      if (room.fanBlades) room.fanBlades.rotation.z -= dt * 14;
      onUpdate(dt, Math.min(raw, 1));
      if (override) {
        if (post) post.render(override.scene, override.camera, dt);
        else renderer.render(override.scene, override.camera);
        return;
      }
      controls.update();
      room.updateCutaway(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
      if (post) post.render(room.scene, camera, dt);
      else renderer.render(room.scene, camera);
    };
    renderer.setAnimationLoop(frame);
    document.addEventListener('visibilitychange', () => {
      renderer.setAnimationLoop(document.hidden ? null : frame);
    });
  };

  return { room, camera, controls, renderer, start, setOverride };
}
