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

/** The skin's real colour: the average of the skin texture times the tint, slightly darker. */
function lidColour(m: MeshStandardMaterial): Color {
  const c = m.color.clone();
  const img = m.map?.image as CanvasImageSource | undefined;
  if (img) {
    try {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 8;
      const ctx = cv.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 8, 8).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 200) continue;
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
          n++;
        }
        if (n) c.multiply(new Color().setRGB(r / n / 255, g / n / 255, b / n / 255, SRGBColorSpace));
      }
    } catch {
      // Texture not readable: keep the tint.
    }
  }
  return c.multiplyScalar(0.92);
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
    const skin = lidColour(skinMaterial);
    let eyes: SkinnedMesh | null = null;
    let brows: SkinnedMesh | null = null;
    root.traverse((o) => {
      if (!(o instanceof SkinnedMesh)) return;
      const m = o.material as MeshStandardMaterial;
      if (m?.name?.startsWith('MI_Eyes')) eyes = o;
      else if (o.name === 'Eyebrows') brows = o;
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
      const shut = head.worldToLocal(at(x, f * 0.8 + 0.26, -u));
      // Folded: a thin band hugging the top of the eye.
      const top = 0.93;
      const w = Math.sqrt(1 - top * top);
      const fold = head.worldToLocal(at(x * w * 1.6, Math.max(0, f) * w + 0.05, top));
      open.push(fold.x, fold.y, fold.z);
      delta.push(shut.x - fold.x, shut.y - fold.y, shut.z - fold.z);
    }
    g.setAttribute('position', new Float32BufferAttribute(open, 3));
    g.morphAttributes.position = [new Float32BufferAttribute(delta, 3)];
    g.morphTargetsRelative = true;
    g.computeVertexNormals();
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
