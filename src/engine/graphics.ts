// Graphics quality setting (Low / Medium / High), remembered on this device.
// Low: no shadows, lower resolution. Medium: sun shadows only. High: all shadows, full resolution.

export type Quality = 'low' | 'medium' | 'high';

const KEY = 'the-human.graphics';

function isTouch(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}

export function defaultQuality(touch: boolean): Quality {
  return touch ? 'medium' : 'high';
}

export function getQuality(): Quality {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'low' || v === 'medium' || v === 'high') return v;
  } catch {
    // Storage blocked: fall back to the default.
  }
  return defaultQuality(isTouch());
}

export function setQuality(q: Quality): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    // Not remembered; applies until the page reloads.
  }
}

/** Pixel ratio cap for a quality level (phones never above 1.5, per the performance budget). */
export function pixelRatioFor(q: Quality, touch: boolean, devicePixelRatio: number): number {
  const cap = q === 'low' ? (touch ? 0.85 : 1) : q === 'medium' ? (touch ? 1.25 : 1.5) : touch ? 1.5 : 2;
  return Math.min(devicePixelRatio, cap);
}

export const quality = {
  get current(): Quality {
    return getQuality();
  },
  get shadows(): boolean {
    return getQuality() !== 'low';
  },
  /** Extra shadows (lamps, small props) only on High. */
  get extraShadows(): boolean {
    return getQuality() === 'high';
  },
  get touch(): boolean {
    return isTouch();
  },
};
