import { WebGLRenderer, PCFShadowMap, SRGBColorSpace } from 'three';
import { getQuality, pixelRatioFor } from './graphics';

/** Phones get a capped pixel ratio (performance budget in CLAUDE.md). */
export function maxPixelRatio(isTouch: boolean, devicePixelRatio: number): number {
  return Math.min(devicePixelRatio, isTouch ? 1.5 : 2);
}

export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const q = getQuality();
  const renderer = new WebGLRenderer({ canvas, antialias: q !== 'low', powerPreference: 'high-performance' });
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(maxPixelRatio(isTouch, window.devicePixelRatio), pixelRatioFor(q, isTouch, window.devicePixelRatio)));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = q !== 'low';
  renderer.shadowMap.type = PCFShadowMap;
  return renderer;
}
