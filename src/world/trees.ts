import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TubeGeometry,
  Vector3,
  type Material,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getQuality, quality } from '../engine/graphics';
import { pbr } from '../engine/pbr';

// Trees of an Indonesian street: mango trees, ketapang (with its layered crown) and coconut
// palms. Trunks and branches carry a photographed bark texture; the crowns are made of many
// cards showing photographed twigs full of leaves (scripts/build-foliage.mjs), whose lighting
// treats the crown as one rounded mass so it shades like a real tree. Every tree of a kind is
// one instance of the same shape (a couple of draw calls for the whole street), turned and
// sized a little differently.

export type TreeKind = 'mango' | 'ketapang' | 'palm';

export interface TreeSpot {
  x: number;
  z: number;
  kind: TreeKind;
  /** Size factor (1 = normal). */
  scale?: number;
  /** Ground height. */
  y?: number;
}

const loader = new TextureLoader();
const leafTextures = new Map<string, Texture>();

function leafTexture(name: TreeKind): Texture {
  let t = leafTextures.get(name);
  if (!t) {
    const hd = getQuality() === 'low' ? '' : 'hd/';
    t = loader.load(`${import.meta.env.BASE_URL}assets/textures/foliage/${hd}${name}.webp`);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    leafTextures.set(name, t);
  }
  return t;
}

let seed = 11;
const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** Normals pointing out from `centre`, blended with the face normals: a crown that shades as a whole. */
function crownNormals(geo: BufferGeometry, centre: Vector3, blend = 0.75): void {
  geo.computeVertexNormals();
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const v = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(centre).normalize();
    n.fromBufferAttribute(nor, i);
    // Double-sided cards: use the face normal on the side facing outwards.
    if (n.dot(v) < 0) n.negate();
    n.lerp(v, blend).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
}

/** A tapered branch from `a` to `b`. */
function limb(a: Vector3, b: Vector3, r0: number, r1: number, segs = 6): BufferGeometry {
  const len = a.distanceTo(b);
  const g = new CylinderGeometry(r1, r0, len, segs, 1, true);
  g.translate(0, len / 2, 0);
  const dir = b.clone().sub(a).normalize();
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Leaf cards: each one sits with its stem end inside the crown and reaches outwards. */
function cards(points: { p: Vector3; out: Vector3 }[], size: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const q = new Quaternion();
  const spin = new Quaternion();
  for (const { p, out } of points) {
    const s = size * (0.75 + rnd() * 0.5);
    const g = new PlaneGeometry(s, s);
    g.translate(0, s / 2, 0); // stem end at the origin
    // Lean the card's "up" towards the outward direction, turned randomly around it.
    spin.setFromAxisAngle(new Vector3(0, 1, 0), rnd() * Math.PI * 2);
    g.applyQuaternion(spin);
    q.setFromUnitVectors(new Vector3(0, 1, 0), out);
    g.applyQuaternion(q);
    g.translate(p.x, p.y, p.z);
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

interface Shape {
  wood: BufferGeometry;
  leaves: BufferGeometry;
  /** Coconuts (palms only). */
  fruit?: BufferGeometry;
}

/** A broad tree: a trunk splitting into branches, a round crown (mango) or tiers (ketapang). */
function broadTree(kind: 'mango' | 'ketapang', lite: boolean): Shape {
  const H = kind === 'mango' ? 3.2 : 3.5;
  const wood: BufferGeometry[] = [];
  const top = new Vector3(0.08, H, 0.04);
  wood.push(limb(new Vector3(0, 0, 0), top, 0.24, 0.15, 8));
  const pts: { p: Vector3; out: Vector3 }[] = [];
  const centre = new Vector3(0, H + (kind === 'mango' ? 1.5 : 1.3), 0);
  const branches = kind === 'mango' ? 5 : 6;
  for (let i = 0; i < branches; i++) {
    const a = (i / branches) * Math.PI * 2 + rnd() * 0.5;
    const tier = kind === 'ketapang' ? i % 3 : 0;
    const up = kind === 'mango' ? 1.4 + rnd() * 0.6 : 0.5 + tier * 0.9;
    const reach = kind === 'mango' ? 1.4 + rnd() * 0.5 : 2.2 - tier * 0.5;
    const from = new Vector3(top.x, (kind === 'mango' ? H - 0.1 : H - 0.6 + tier * 0.9) , top.z);
    const to = new Vector3(Math.cos(a) * reach, from.y + up, Math.sin(a) * reach);
    wood.push(limb(from, to, 0.11, 0.04));
  }
  const n = lite ? 70 : 120;
  for (let i = 0; i < n; i++) {
    // Points on a rounded shell (mango) or in three flat tiers (ketapang).
    const a = rnd() * Math.PI * 2;
    let p: Vector3;
    if (kind === 'mango') {
      const u = rnd() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      const shell = 0.55 + rnd() * 0.45;
      p = new Vector3(Math.cos(a) * r * 2.1 * shell, u * 1.35 * shell + 0.1, Math.sin(a) * r * 2.1 * shell).add(centre);
    } else {
      const tier = i % 3;
      const rad = (2.6 - tier * 0.7) * Math.sqrt(0.2 + rnd() * 0.8);
      p = new Vector3(Math.cos(a) * rad, -0.9 + tier * 0.95 + (rnd() - 0.5) * 0.35, Math.sin(a) * rad).add(centre);
    }
    const out = p.clone().sub(centre);
    if (kind === 'ketapang') out.y *= 0.35; // tiers spread sideways
    out.normalize();
    // Mostly outwards and a little upwards, with some jitter.
    out.add(new Vector3((rnd() - 0.5) * 0.6, 0.25 + rnd() * 0.3, (rnd() - 0.5) * 0.6)).normalize();
    pts.push({ p: p.sub(out.clone().multiplyScalar(0.35)), out });
  }
  const leaves = cards(pts, kind === 'mango' ? 1.7 : 1.8);
  crownNormals(leaves, centre);
  return { wood: mergeGeometries(wood.map((g) => g.toNonIndexed()))!, leaves };
}

/** A coconut palm: a tall, slightly curved trunk and a crown of drooping fronds. */
function palm(lite: boolean): Shape {
  const H = 6.5;
  const lean = new Vector3(0.6, 0, 0.2);
  const curve = new CatmullRomCurve3([
    new Vector3(0, 0, 0),
    new Vector3(lean.x * 0.15, H * 0.35, lean.z * 0.15),
    new Vector3(lean.x * 0.5, H * 0.7, lean.z * 0.5),
    new Vector3(lean.x, H, lean.z),
  ]);
  const wood = new TubeGeometry(curve, 12, 0.15, 8, false);
  const crown = new Vector3(lean.x, H, lean.z);
  const fronds: BufferGeometry[] = [];
  const count = lite ? 10 : 14;
  const segs = 8;
  for (let f = 0; f < count; f++) {
    const yaw = (f / count) * Math.PI * 2 + rnd() * 0.3;
    const L = 3.0 + rnd() * 0.7;
    const W = 1.1;
    const startUp = 0.75 - (f % 3) * 0.35; // some upright, some level, some hanging
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i <= segs; i++) {
      const s = i / segs;
      const ang = startUp - s * (1.3 + rnd() * 0.1);
      if (i > 0) {
        x += Math.cos(ang) * (L / segs);
        y += Math.sin(ang) * (L / segs);
      }
      const w = (W / 2) * (1 - s * 0.6);
      // Three points across: the leaflets fold up a little from the midrib (a shallow V).
      for (const [side, lift] of [[-1, 0.18], [0, 0], [1, 0.18]] as const) {
        pos.push(x, y + lift * w, side * w);
        uv.push((side + 1) / 2, s);
      }
      if (i < segs) {
        const b = i * 3;
        idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    g.rotateY(yaw);
    g.translate(crown.x, crown.y, crown.z);
    fronds.push(g);
  }
  const leaves = mergeGeometries(fronds)!;
  crownNormals(leaves, crown.clone().add(new Vector3(0, -0.6, 0)), 0.5);
  // A bunch of coconuts under the crown.
  const nuts: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const g = new SphereGeometry(0.15, 8, 6);
    g.translate(crown.x + Math.cos(a) * 0.22, crown.y - 0.25 - (i % 2) * 0.12, crown.z + Math.sin(a) * 0.22);
    nuts.push(g);
  }
  return { wood, leaves, fruit: mergeGeometries(nuts)! };
}

/**
 * Leaves right in front of the camera dissolve (a fine dither, no sorting needed), so a crown the
 * camera passes through never hides the view.
 */
function fadeNearCamera(mat: MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphatest_fragment>',
      `#include <alphatest_fragment>
      {
        float camDist = length(vViewPosition);
        float keep = clamp((camDist - 1.2) / 2.3, 0.0, 1.0);
        float dither = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
        if (dither > keep) discard;
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'leaf-fade';
}

/** All the trees of a scene: one instanced trunk, crown (and fruit) mesh per kind. */
export class Trees {
  readonly group = new Group();
  private readonly materials: Material[] = [];

  constructor(spots: readonly TreeSpot[]) {
    const lite = getQuality() === 'low';
    const kinds: TreeKind[] = ['mango', 'ketapang', 'palm'];
    const dummy = new Object3D();
    const m = new Matrix4();
    for (const kind of kinds) {
      const list = spots.filter((s) => s.kind === kind);
      if (!list.length) continue;
      const shape = kind === 'palm' ? palm(lite) : broadTree(kind, lite);
      const bark = pbr('bark', { repeat: kind === 'palm' ? [1, 6] : [1, 2], tint: kind === 'palm' ? '#b9ab98' : '#d8c8b8' });
      const leafMat = new MeshStandardMaterial({ map: leafTexture(kind), alphaTest: 0.45, side: DoubleSide, roughness: 0.75 });
      fadeNearCamera(leafMat);
      this.materials.push(leafMat);
      const parts: [BufferGeometry, Material][] = [[shape.wood, bark], [shape.leaves, leafMat]];
      const nutMat = new MeshStandardMaterial({ color: '#6b7a2a', roughness: 0.6 });
      if (shape.fruit) {
        parts.push([shape.fruit, nutMat]);
        this.materials.push(nutMat);
      }
      const tint = new Color();
      for (const [geo, mat] of parts) {
        const mesh = new InstancedMesh(geo, mat, list.length);
        mesh.castShadow = quality.extraShadows || mat === leafMat;
        mesh.receiveShadow = mat !== leafMat;
        if (mat === leafMat) mesh.userData.noAO = true;
        list.forEach((s, i) => {
          dummy.position.set(s.x, s.y ?? 0, s.z);
          // Each tree turned and sized a little differently (the same i gives the same tree).
          dummy.rotation.set(0, (s.x * 12.9898 + s.z * 78.233) % (Math.PI * 2), 0);
          dummy.scale.setScalar((s.scale ?? 1) * (0.88 + (((s.x * 7.13 + s.z * 3.7) % 1) + 1) % 1 * 0.25));
          dummy.updateMatrix();
          m.copy(dummy.matrix);
          mesh.setMatrixAt(i, m);
          if (mat === leafMat) {
            // Slightly different greens from tree to tree.
            const k = (((s.x * 3.1 + s.z * 5.7) % 1) + 1) % 1;
            mesh.setColorAt(i, tint.setRGB(0.88 + k * 0.14, 0.92 + k * 0.08, 0.85 + k * 0.1));
          }
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        this.group.add(mesh);
      }
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof InstancedMesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}

/** Ground footprint to collide with (the trunk). */
export function treeCollider(s: TreeSpot): { x0: number; z0: number; x1: number; z1: number } {
  return { x0: s.x - 0.35, z0: s.z - 0.35, x1: s.x + 0.35, z1: s.z + 0.35 };
}
