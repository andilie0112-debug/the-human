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

/** Prayer rug pattern: deep red field, gold borders, an arch (mihrab) and small motifs. */
export function sajadahTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 432;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7d1f2c';
  g.fillRect(0, 0, 256, 432);
  g.strokeStyle = '#d6ad5c';
  g.lineWidth = 6;
  g.strokeRect(10, 10, 236, 412);
  g.lineWidth = 2;
  g.strokeRect(22, 22, 212, 388);
  // Arch at the top of the rug.
  g.fillStyle = '#5e1420';
  g.beginPath();
  g.moveTo(40, 400);
  g.lineTo(40, 140);
  g.quadraticCurveTo(40, 50, 128, 40);
  g.quadraticCurveTo(216, 50, 216, 140);
  g.lineTo(216, 400);
  g.closePath();
  g.fill();
  g.strokeStyle = '#d6ad5c';
  g.lineWidth = 3;
  g.stroke();
  // Hanging lamp motif and a row of small diamonds.
  g.fillStyle = '#d6ad5c';
  g.fillRect(126, 60, 4, 40);
  g.beginPath();
  g.ellipse(128, 112, 14, 10, 0, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 6; i++) {
    const x = 58 + i * 28;
    g.beginPath();
    g.moveTo(x, 360);
    g.lineTo(x + 8, 370);
    g.lineTo(x, 380);
    g.lineTo(x - 8, 370);
    g.closePath();
    g.fill();
  }
  // Fine weave noise.
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
    g.fillRect(Math.random() * 256, Math.random() * 432, 2, 1);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
