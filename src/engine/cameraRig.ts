import { PerspectiveCamera, TOUCH, MOUSE } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Life-sim style orbit camera. Touch: one finger orbits, two fingers pinch-zoom and pan.
 * Mouse: left drag orbits, wheel zooms, right drag pans.
 */
export function createOrbitRig(camera: PerspectiveCamera, dom: HTMLElement): OrbitControls {
  const controls = new OrbitControls(camera, dom);
  controls.target.set(0, 0.8, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.minDistance = 3;
  controls.maxDistance = 25;
  controls.maxPolarAngle = Math.PI * 0.47; // never go below the floor
  controls.screenSpacePanning = false;
  controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
  controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
  controls.update();
  return controls;
}
