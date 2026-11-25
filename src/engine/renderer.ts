import { WebGLRenderer, PCFShadowMap, SRGBColorSpace } from 'three';

/** Phones get a capped pixel ratio (performance budget in CLAUDE.md). */
export function maxPixelRatio(isTouch: boolean, devicePixelRatio: number): number {
  return Math.min(devicePixelRatio, isTouch ? 1.5 : 2);
}

export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(maxPixelRatio(isTouch, window.devicePixelRatio));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  return renderer;
}
