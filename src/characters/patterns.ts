import { CanvasTexture, Color, RepeatWrapping, SRGBColorSpace } from 'three';

// Fabric patterns drawn on a canvas (our own designs): batik parang and kawung, flannel plaid,
// denim twill, sarung checks, a jacket with a zip, a polo placket. `base` is the chosen colour.

export type Pattern = 'plain' | 'batik' | 'kawung' | 'plaid' | 'denim' | 'sarung' | 'zip' | 'placket';

const cache = new Map<string, CanvasTexture>();

function shade(hex: string, k: number): string {
  const c = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + k)));
  return `#${c.getHexString()}`;
}

/** A tileable fabric texture (white base colour on the material; the texture carries the colour). */
export function fabric(pattern: Pattern, base: string): CanvasTexture | null {
  if (pattern === 'plain') return null;
  const key = `${pattern}|${base}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const n = 256;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, n, n);
  const dark = shade(base, -0.28);
  const light = shade(base, 0.25);
  switch (pattern) {
    case 'batik': {
      // Parang: diagonal bands of S-shaped blades with a dotted border.
      g.fillStyle = '#f3e4c4';
      g.fillRect(0, 0, n, n);
      g.save();
      g.translate(n / 2, n / 2);
      g.rotate(-Math.PI / 4);
      for (let b = -4; b <= 4; b++) {
        const y = b * 46;
        g.fillStyle = base;
        g.fillRect(-n, y - 14, n * 2, 28);
        g.fillStyle = dark;
        for (let x = -n; x < n; x += 30) {
          g.beginPath();
          g.ellipse(x, y, 11, 7, 0.6, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#3a2416';
        for (let x = -n; x < n; x += 9) g.fillRect(x, y + 17, 3, 3);
      }
      g.restore();
      break;
    }
    case 'kawung': {
      // Four ovals around a dot, repeated (a classic Javanese motif, drawn freely).
      g.fillStyle = dark;
      for (let y = 0; y < n; y += 64) {
        for (let x = 0; x < n; x += 64) {
          for (const [dx, dy, r] of [[0, -16, 0], [16, 0, Math.PI / 2], [0, 16, 0], [-16, 0, Math.PI / 2]] as const) {
            g.beginPath();
            g.ellipse(x + 32 + dx, y + 32 + dy, 9, 15, r, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = light;
          g.beginPath();
          g.arc(x + 32, y + 32, 4, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = dark;
        }
      }
      break;
    }
    case 'plaid':
    case 'sarung': {
      const step = pattern === 'plaid' ? 64 : 48;
      const stripe = pattern === 'plaid' ? 22 : 16;
      g.globalAlpha = 0.45;
      g.fillStyle = dark;
      for (let x = 0; x < n; x += step) g.fillRect(x, 0, stripe, n);
      for (let y = 0; y < n; y += step) g.fillRect(0, y, n, stripe);
      g.globalAlpha = 0.6;
      g.fillStyle = pattern === 'plaid' ? '#ffffff' : '#e9c86a';
      for (let x = 0; x < n; x += step) g.fillRect(x + stripe + 6, 0, 2, n);
      for (let y = 0; y < n; y += step) g.fillRect(0, y + stripe + 6, n, 2);
      g.globalAlpha = 1;
      break;
    }
    case 'denim': {
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = Math.random() < 0.5 ? dark : light;
        g.globalAlpha = 0.25;
        const x = Math.random() * n;
        const y = Math.random() * n;
        g.fillRect(x, y, 3, 1);
      }
      g.globalAlpha = 0.18;
      g.strokeStyle = light;
      for (let k = -n; k < n; k += 4) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k + n, n);
        g.stroke();
      }
      g.globalAlpha = 1;
      break;
    }
    case 'zip':
    case 'placket': {
      // Texture repeats once around the body: the front centre is at u = 0.5.
      g.fillStyle = dark;
      g.fillRect(n / 2 - 2, 0, 4, n);
      if (pattern === 'zip') {
        g.fillStyle = '#c9ced3';
        for (let y = 0; y < n; y += 6) g.fillRect(n / 2 - 3, y, 6, 2);
      } else {
        g.fillStyle = light;
        for (let y = 20; y < n; y += 52) {
          g.beginPath();
          g.arc(n / 2, y, 4, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    }
  }
  // Fine weave noise so every fabric reads as cloth.
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)';
    g.fillRect(Math.random() * n, Math.random() * n, 2, 1);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  cache.set(key, tex);
  return tex;
}
