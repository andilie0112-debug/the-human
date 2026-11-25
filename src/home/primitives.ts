import {
  CanvasTexture,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  type Material,
  type Object3D,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Small helpers for greybox models built from rounded primitives.

export function mat(color: string, roughness = 0.75, metalness = 0): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness, metalness });
}

export function shadowed<T extends Mesh>(mesh: T): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Rounded box. */
export function rbox(w: number, h: number, d: number, r: number, m: Material): Mesh {
  return shadowed(new Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), m));
}

export function cyl(rTop: number, rBottom: number, h: number, m: Material, segments = 16): Mesh {
  return shadowed(new Mesh(new CylinderGeometry(rTop, rBottom, h, segments), m));
}

export function sphere(r: number, m: Material): Mesh {
  return shadowed(new Mesh(new SphereGeometry(r, 16, 12), m));
}

export function at<T extends Object3D>(o: T, x: number, y: number, z: number, parent: Object3D): T {
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

/** Warm wooden plank texture drawn on a canvas, so no external image is needed. */
export function plankTexture(repeatX = 2, repeatY = 2): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const tones = ['#b98a5e', '#c4956a', '#ad7f55', '#bf8f62'];
  for (let i = 0; i < 8; i++) {
    g.fillStyle = tones[i % tones.length];
    g.fillRect(0, i * 32, 256, 32);
    g.fillStyle = 'rgba(70,40,20,0.35)';
    g.fillRect(0, i * 32, 256, 2);
    const seam = (i * 97) % 256;
    g.fillRect(seam, i * 32, 2, 32);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    for (let k = 0; k < 6; k++) g.fillRect(0, i * 32 + 6 + k * 4, 256, 1);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

/** Simple square tile texture for wet areas. */
export function tileTexture(repeat = 4): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#dfe6e8';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#b9c4c8';
  for (let i = 0; i <= 4; i++) {
    g.fillRect(i * 32 - 1, 0, 2, 128);
    g.fillRect(0, i * 32 - 1, 128, 2);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  return tex;
}
