import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  SkinnedMesh,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Bone,
  type Material,
  type Object3D,
} from 'three';

// Faces that move: the characters blink, close their eyes to sleep, and show how they feel with
// their eyebrows and eyelids (happy, sad, angry, surprised, sleepy). The models have no facial
// shapes of their own, so they are made here when a character loads: skin-coloured eyelids that
// slide down over each eye, and eyebrows with three shapes (raised, frowning, worried). Both are
// fixed to the head bone, so they move with the head.

export type Expression = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'sleepy';

/** Target weights per expression: [lids, brows up, brows frown, brows worried]. */
const SHAPES: Record<Expression, [number, number, number, number]> = {
  neutral: [0, 0, 0, 0],
  happy: [0.2, 0.45, 0, 0],
  sad: [0.32, 0, 0, 1],
  angry: [0.35, 0, 1, 0],
  surprised: [0, 1, 0, 0],
  sleepy: [0.6, 0, 0, 0.25],
};

/** Where a vertex is now, in world space (the model stands in its rest pose when this runs). */
function worldPoints(mesh: SkinnedMesh): Vector3[] {
  const pos = mesh.geometry.getAttribute('position');
  const out: Vector3[] = [];
  for (let i = 0; i < pos.count; i++) out.push(mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld));
  return out;
}

/**
 * The skin's real colour where the eyelid sits: the skin texture read at the face just above the
 * eye (texture coordinates of the nearest body vertices), times the tint. Falls back to the
 * texture's middle brightness, then to the tint.
 */
function lidColour(m: MeshStandardMaterial, uvs: [number, number][]): Color {
  const c = m.color.clone();
  const img = m.map?.image as CanvasImageSource | undefined;
  if (!img) return c;
  try {
    const N = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return c;
    ctx.drawImage(img, 0, 0, N, N);
    const d = ctx.getImageData(0, 0, N, N).data;
    const px: [number, number, number][] = [];
    const flip = m.map?.flipY ?? false;
    if (uvs.length) {
      for (const [u, v] of uvs) {
        const x = Math.min(N - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * N)));
        const yv = (((v % 1) + 1) % 1);
        const y = Math.min(N - 1, Math.max(0, Math.floor((flip ? 1 - yv : yv) * N)));
        const i = (y * N + x) * 4;
        if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
      }
    }
    if (!px.length) {
      // No face sample: the median pixel by brightness (dark details don't pull it down).
      for (let i = 0; i < d.length; i += 64) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
      px.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
      const mid = px[Math.floor(px.length / 2)];
      px.length = 0;
      if (mid) px.push(mid);
    }
    if (px.length) {
      const avg = px.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((v) => v / px.length / 255);
      c.multiply(new Color().setRGB(avg[0], avg[1], avg[2], SRGBColorSpace));
    }
  } catch {
    // Texture not readable: keep the tint.
  }
  return c.multiplyScalar(0.95);
}

/** Texture coordinates of the skin just above and beside the eyes (where the eyelids are). */
function faceUvs(body: SkinnedMesh, eyePts: Vector3[], mid: Vector3): [number, number][] {
  const uv = body.geometry.getAttribute('uv');
  if (!uv) return [];
  const top = Math.max(...eyePts.map((p) => p.y));
  const front = Math.max(...eyePts.map((p) => p.z));
  const halfW = Math.max(...eyePts.map((p) => Math.abs(p.x - mid.x)));
  const pos = body.geometry.getAttribute('position');
  const out: [number, number][] = [];
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    body.getVertexPosition(i, v).applyMatrix4(body.matrixWorld);
    // A band of skin just above the eyes, under the brows, in front.
    if (v.y > top + 0.004 && v.y < top + 0.018 && Math.abs(v.x - mid.x) < halfW * 1.1 && Math.abs(v.x - mid.x) > halfW * 0.25 && v.z > front - 0.025) out.push([uv.getX(i), uv.getY(i)]);
    if (out.length > 80) break;
  }
  return out;
}

export class Face {
  private readonly lids: Mesh[] = [];
  private brows: Mesh | null = null;
  private readonly materials: Material[] = [];
  private expression: Expression = 'neutral';
  private readonly now = [0, 0, 0, 0];
  private blinkIn = 1 + Math.random() * 3;
  private blinkT = 0;
  private closed = false;

  /** `skin`: the body's skin material (its texture's average colour gives the eyelid colour). */
  constructor(root: Object3D, skinMaterial: MeshStandardMaterial) {
    let skinMesh: SkinnedMesh | null = null;
    let eyes: SkinnedMesh | null = null;
    let brows: SkinnedMesh | null = null;
    root.traverse((o) => {
      if (!(o instanceof SkinnedMesh)) return;
      const m = o.material as MeshStandardMaterial;
      if (m?.name?.startsWith('MI_Eyes')) eyes = o;
      else if (o.name === 'Eyebrows') brows = o;
      else if (o.material === skinMaterial && !skinMesh) skinMesh = o;
    });
    if (!eyes) return;
    const eyeMesh: SkinnedMesh = eyes;
    const head = eyeMesh.skeleton.bones.find((b) => b.name === 'Head');
    if (!head) return;
    root.updateMatrixWorld(true);
    // The character faces +z at load: up, forward and right in world space.
    const up = new Vector3(0, 1, 0);
    const fwd = new Vector3(0, 0, 1);
    const right = new Vector3(1, 0, 0);

    // The two eyeballs (left and right of the middle).
    const pts = worldPoints(eyeMesh);
    const mid = pts.reduce((a, p) => a.add(p), new Vector3()).divideScalar(pts.length);
    const skin = lidColour(skinMaterial, skinMesh ? faceUvs(skinMesh, pts, mid) : []);
    let eyeR = 0.012;
    for (const side of [-1, 1]) {
      const mine = pts.filter((p) => Math.sign(p.x - mid.x) === side);
      if (!mine.length) continue;
      const c = mine.reduce((a, p) => a.add(p), new Vector3()).divideScalar(mine.length);
      // The eye's size: half its height (the visible opening).
      const ys = mine.map((p) => p.y);
      const zs = mine.map((p) => p.z);
      eyeR = Math.max((Math.max(...ys) - Math.min(...ys)) / 2, (Math.max(...zs) - Math.min(...zs)) / 2);
      c.z = Math.max(...zs) - eyeR; // centre of a sphere whose front is the eye's front
      this.lids.push(this.makeLid(head, c, eyeR * 1.04, up, fwd, right, skin));
    }
    if (brows) this.brows = this.makeBrows(brows, head, up, right, eyeR);
  }

  /**
   * An eyelid: the front of a sphere just outside the eyeball, skin-coloured. Its resting shape
   * is folded away at the top of the eye; its one shape ("closed") covers the eye. Part-way
   * shows a heavy, sleepy or angry lid.
   */
  private makeLid(head: Bone, c: Vector3, R: number, up: Vector3, fwd: Vector3, right: Vector3, skin: Color): Mesh {
    const g = new SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const p = g.getAttribute('position');
    const open: number[] = [];
    const delta: number[] = [];
    const at = (x: number, f: number, u: number): Vector3 =>
      right.clone().multiplyScalar(x).add(fwd.clone().multiplyScalar(f)).add(up.clone().multiplyScalar(u)).multiplyScalar(R).add(c);
    for (let i = 0; i < p.count; i++) {
      // The sphere's pole (+y) looks forward out of the eye; its x/z spread across the eye.
      const x = p.getX(i);
      const f = p.getY(i);
      const u = p.getZ(i);
      // Closed: a little flatter than a sphere, so it lies close over the eye.
      const shut = head.worldToLocal(at(x * 1.12, f * 0.8 + 0.26, -u * 1.18));
      // Folded: a thin band hugging the top of the eye.
      const top = 0.93;
      const w = Math.sqrt(1 - top * top);
      const fold = head.worldToLocal(at(x * w * 1.6, Math.max(0, f) * w + 0.05, top));
      open.push(fold.x, fold.y, fold.z);
      delta.push(shut.x - fold.x, shut.y - fold.y, shut.z - fold.z);
    }
    // Normals for both shapes: the closed lid must shade like skin facing forward, not like the
    // folded band (that made closed eyes look dark).
    g.setAttribute('position', new Float32BufferAttribute(open.map((v, i) => v + delta[i]), 3));
    g.computeVertexNormals();
    const shutN = Array.from(g.getAttribute('normal').array as Float32Array);
    g.setAttribute('position', new Float32BufferAttribute(open, 3));
    g.computeVertexNormals();
    const openN = g.getAttribute('normal').array as Float32Array;
    g.morphAttributes.position = [new Float32BufferAttribute(delta, 3)];
    g.morphAttributes.normal = [new Float32BufferAttribute(shutN.map((v, i) => v - openN[i]), 3)];
    g.morphTargetsRelative = true;
    const mat = new MeshStandardMaterial({ color: skin, roughness: 0.8, envMapIntensity: 0.4 });
    this.materials.push(mat);
    const lid = new Mesh(g, mat);
    lid.name = 'Eyelid';
    lid.updateMorphTargets();
    lid.morphTargetInfluences = [0];
    lid.castShadow = false;
    head.add(lid);
    return lid;
  }

  /**
   * Eyebrows fixed to the head with three shapes: raised, frowning (inner ends down and together)
   * and worried (inner ends up). They replace the model's own eyebrows.
   */
  private makeBrows(src: SkinnedMesh, head: Bone, up: Vector3, right: Vector3, unit: number): Mesh {
    const pts = worldPoints(src);
    const mid = pts.reduce((a, p) => a.add(p), new Vector3()).divideScalar(pts.length);
    const half = Math.max(...pts.map((p) => Math.abs(p.x - mid.x))) || 1;
    const base: number[] = [];
    const shapes: number[][] = [[], [], []];
    for (const p of pts) {
      const across = p.x - mid.x;
      const t = Math.min(1, Math.abs(across) / half); // 0 at the nose .. 1 at the temple
      const inner = 1 - t;
      const local = head.worldToLocal(p.clone());
      base.push(local.x, local.y, local.z);
      const moves = [
        up.clone().multiplyScalar(unit * 0.6),
        up.clone().multiplyScalar(unit * (-0.42 * inner + 0.15 * t)).add(right.clone().multiplyScalar(-Math.sign(across) * unit * 0.12 * inner)),
        up.clone().multiplyScalar(unit * (0.55 * inner - 0.18 * t)),
      ];
      moves.forEach((m, k) => {
        const d = head.worldToLocal(p.clone().add(m)).sub(local);
        shapes[k].push(d.x, d.y, d.z);
      });
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(base, 3));
    const uv = src.geometry.getAttribute('uv');
    if (uv) g.setAttribute('uv', uv.clone());
    if (src.geometry.index) g.setIndex(src.geometry.index.clone());
    g.morphAttributes.position = shapes.map((s) => new Float32BufferAttribute(s, 3));
    g.morphTargetsRelative = true;
    g.computeVertexNormals();
    const mat = (src.material as Material).clone();
    this.materials.push(mat);
    const brows = new Mesh(g, mat);
    brows.name = 'FaceBrows';
    brows.updateMorphTargets();
    brows.morphTargetInfluences = [0, 0, 0];
    brows.castShadow = false;
    head.add(brows);
    src.visible = false;
    return brows;
  }

  set(e: Expression): void {
    this.expression = e;
  }

  get current(): Expression {
    return this.expression;
  }

  /** Eyes shut (sleeping); blinking stops. */
  setClosed(closed: boolean): void {
    this.closed = closed;
  }

  update(dt: number): void {
    if (!this.lids.length) return;
    const target = SHAPES[this.expression];
    const k = Math.min(1, dt * 6);
    for (let i = 0; i < 4; i++) this.now[i] += (target[i] - this.now[i]) * k;
    // Blink every few seconds (down and up in about a sixth of a second).
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0.16;
      this.blinkIn = 2 + Math.random() * 4.5;
    }
    let blink = 0;
    if (this.blinkT > 0) {
      this.blinkT -= dt;
      blink = Math.sin((1 - Math.max(0, this.blinkT) / 0.16) * Math.PI);
    }
    const lid = this.closed ? 1 : Math.max(this.now[0], blink);
    for (const l of this.lids) l.morphTargetInfluences![0] = lid;
    const b = this.brows?.morphTargetInfluences;
    if (b) {
      b[0] = this.now[1];
      b[1] = this.now[2];
      b[2] = this.now[3];
    }
  }

  dispose(): void {
    for (const m of [...this.lids, ...(this.brows ? [this.brows] : [])]) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    for (const m of this.materials) m.dispose();
  }
}
