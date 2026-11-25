import { BufferAttribute, BufferGeometry, MeshStandardMaterial, SkinnedMesh, Vector3 } from 'three';

/**
 * Procedural clothing: a thin shell copied from the body mesh, keeping only the triangles
 * driven by the given bones and pushed out along the normals. It reuses the body's skin
 * weights, so it follows every animation without extra rigging.
 */
export interface GarmentSpec {
  name: string;
  bones: readonly string[];
  /** Share of skin weight on `bones` where the hem is cut (0..1). Lower = the garment reaches further. */
  threshold: number;
  /** Distance from the skin in metres (world space). Outer layers need a larger value. */
  offset: number;
  color: string;
  roughness?: number;
  /** Smoothing passes so fabric skims over muscle detail instead of hugging it. */
  smooth?: number;
  /** Returns > 0 for points (mesh space) inside an opening that must stay uncovered. */
  opening?: (x: number, y: number, z: number) => number;
  /** true: volume-preserving Taubin smoothing (tight garments like pants, no holes);
   *  false: plain Laplacian, stronger but shrinks, so pair it with a larger offset (loose tops). */
  keepVolume?: boolean;
}

/** Smooths positions over the mesh topology and returns smoothed positions and normals. */
function smoothSurface(pos: BufferAttribute, index: ArrayLike<number>, passes: number, keepVolume: boolean): { p: Float32Array; n: Float32Array } {
  const count = pos.count;
  const p = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) {
    p[v * 3] = pos.getX(v);
    p[v * 3 + 1] = pos.getY(v);
    p[v * 3 + 2] = pos.getZ(v);
  }
  // UV seams split vertices; map every vertex to one canonical vertex at the same position
  // so the surface is smoothed (and normals averaged) across seams without tearing.
  const canon = new Int32Array(count);
  const seen = new Map<string, number>();
  for (let v = 0; v < count; v++) {
    const key = `${Math.round(p[v * 3] * 1e5)},${Math.round(p[v * 3 + 1] * 1e5)},${Math.round(p[v * 3 + 2] * 1e5)}`;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, v);
    canon[v] = first ?? v;
  }
  // Vertex adjacency from triangle edges (on canonical vertices).
  const neighbours: number[][] = Array.from({ length: count }, () => []);
  for (let t = 0; t < index.length; t += 3) {
    const a = canon[index[t]], b = canon[index[t + 1]], c = canon[index[t + 2]];
    neighbours[a].push(b, c);
    neighbours[b].push(a, c);
    neighbours[c].push(a, b);
  }
  const next = new Float32Array(p.length);
  for (let pass = 0; pass < passes; pass++) {
    for (let v = 0; v < count; v++) {
      const nb = neighbours[v];
      if (nb.length === 0) {
        next.set(p.subarray(v * 3, v * 3 + 3), v * 3);
        continue;
      }
      let x = 0, y = 0, z = 0;
      for (const u of nb) {
        x += p[u * 3];
        y += p[u * 3 + 1];
        z += p[u * 3 + 2];
      }
      // Taubin: alternate a shrinking and an inflating step so volume is kept.
      const f = !keepVolume || pass % 2 === 0 ? 0.5 : -0.53;
      const k = f / nb.length;
      next[v * 3] = p[v * 3] * (1 - f) + x * k;
      next[v * 3 + 1] = p[v * 3 + 1] * (1 - f) + y * k;
      next[v * 3 + 2] = p[v * 3 + 2] * (1 - f) + z * k;
    }
    p.set(next);
    for (let v = 0; v < count; v++) {
      const c = canon[v];
      if (c !== v) p.set(p.subarray(c * 3, c * 3 + 3), v * 3);
    }
  }
  // Area-weighted vertex normals of the smoothed surface.
  const n = new Float32Array(p.length);
  const e1 = new Vector3(), e2 = new Vector3(), fn = new Vector3();
  for (let t = 0; t < index.length; t += 3) {
    const a = canon[index[t]], b = canon[index[t + 1]], c = canon[index[t + 2]];
    e1.set(p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]);
    e2.set(p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]);
    fn.crossVectors(e1, e2);
    for (const v of [a, b, c]) {
      n[v * 3] += fn.x;
      n[v * 3 + 1] += fn.y;
      n[v * 3 + 2] += fn.z;
    }
  }
  for (let v = 0; v < count; v++) {
    const c = canon[v];
    if (c !== v) n.set(n.subarray(c * 3, c * 3 + 3), v * 3);
  }
  for (let v = 0; v < count; v++) {
    const l = Math.hypot(n[v * 3], n[v * 3 + 1], n[v * 3 + 2]) || 1;
    n[v * 3] /= l;
    n[v * 3 + 1] /= l;
    n[v * 3 + 2] /= l;
  }
  return { p, n };
}

export const SHIRT_SHORT_SLEEVE: readonly string[] = ['spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r'];
export const SHIRT_LONG_SLEEVE: readonly string[] = [...SHIRT_SHORT_SLEEVE, 'lowerarm_l', 'lowerarm_r'];
export const PANTS_LONG: readonly string[] = ['pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r'];
export const PANTS_SHORT: readonly string[] = ['pelvis', 'thigh_l', 'thigh_r'];
export const SHOES: readonly string[] = ['foot_l', 'foot_r', 'ball_l', 'ball_r'];
export const HIJAB: readonly string[] = ['Head', 'neck_01', 'clavicle_l', 'clavicle_r'];

/** Face opening for a hijab, from the bounds of the head-weighted vertices (mesh space, +z forward). */
export function faceOpening(body: SkinnedMesh): (x: number, y: number, z: number) => number {
  const pos = body.geometry.getAttribute('position') as BufferAttribute;
  const si = body.geometry.getAttribute('skinIndex') as BufferAttribute;
  const sw = body.geometry.getAttribute('skinWeight') as BufferAttribute;
  const head = new Set([body.skeleton.bones.findIndex((b) => b.name === 'Head')]);
  let minY = Infinity;
  let maxZ = -Infinity;
  for (let v = 0; v < pos.count; v++) {
    if (weightOn(head, si, sw, v) < 0.5) continue;
    minY = Math.min(minY, pos.getY(v));
    maxZ = Math.max(maxZ, pos.getZ(v));
  }
  const cy = minY + 0.085;
  return (x, y, z) => {
    if (z < maxZ - 0.09) return 0;
    const e = (x / 0.07) ** 2 + ((y - cy) / 0.085) ** 2;
    return e < 1 ? 1 - e + 0.05 : 0;
  };
}

const tmp = new Vector3();

/** Share of a vertex's skin weight that goes to the wanted bones (0..1). */
function weightOn(wanted: Set<number>, skinIndex: BufferAttribute, skinWeight: BufferAttribute, v: number): number {
  let sum = 0;
  let total = 0;
  for (let k = 0; k < 4; k++) {
    const w = skinWeight.getComponent(v, k);
    total += w;
    if (wanted.has(skinIndex.getComponent(v, k))) sum += w;
  }
  return total > 0 ? sum / total : 0;
}

/** `morphs`: optional per-body-vertex morph deltas (see bodyShape.ts); the garment gets the same shapes. */
export function createGarment(body: SkinnedMesh, spec: GarmentSpec, morphs: Float32Array[] = []): SkinnedMesh {
  const g = body.geometry;
  const pos = g.getAttribute('position') as BufferAttribute;
  const skinIndex = g.getAttribute('skinIndex') as BufferAttribute;
  const skinWeight = g.getAttribute('skinWeight') as BufferAttribute;
  const index = g.getIndex();
  if (!index) throw new Error('createGarment expects an indexed body mesh');

  const wanted = new Set<number>();
  body.skeleton.bones.forEach((b, i) => {
    if (spec.bones.includes(b.name)) wanted.add(i);
  });
  // Signed distance to the garment edge, in "weight" units: >= 0 means inside.
  const f = new Float32Array(pos.count);
  for (let v = 0; v < pos.count; v++) f[v] = weightOn(wanted, skinIndex, skinWeight, v) - spec.threshold;
  // Smooth the field over the mesh so hems follow a soft curve instead of zig-zagging.
  {
    const idx = index.array;
    const nb: number[][] = Array.from({ length: pos.count }, () => []);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      nb[a].push(b, c);
      nb[b].push(a, c);
      nb[c].push(a, b);
    }
    const tmpF = new Float32Array(pos.count);
    for (let pass = 0; pass < 4; pass++) {
      for (let v = 0; v < pos.count; v++) {
        let sum = f[v];
        for (const u of nb[v]) sum += f[u];
        tmpF[v] = sum / (nb[v].length + 1);
      }
      f.set(tmpF);
    }
  }
  // Openings (e.g. the face in a hijab): a smooth negative field so the edge is cut cleanly.
  if (spec.opening) {
    for (let v = 0; v < pos.count; v++) {
      const inside = spec.opening(pos.getX(v), pos.getY(v), pos.getZ(v));
      if (inside > 0) f[v] = Math.min(f[v], -inside);
    }
  }

  // Offset is given in world metres; convert to the mesh's local units.
  body.updateWorldMatrix(true, false);
  const localOffset = spec.offset / body.getWorldScale(tmp).x;

  // Base surface for the garment: optionally smoothed, so cloth does not show every muscle.
  const surf = smoothSurface(pos, index.array, spec.smooth ?? 0, spec.keepVolume ?? false);
  const P = surf.p;
  const N = surf.n;

  const outPos: number[] = [];
  const outNor: number[] = [];
  const outIdx: number[] = [];
  const outW: number[] = [];
  const outMorph: number[][] = morphs.map(() => []);
  const n = new Vector3();

  /** Emits a vertex interpolated between a (inside) and b at parameter t; skin data comes from a. */
  const emit = (a: number, b: number, t: number): void => {
    n.set(
      N[a * 3] + (N[b * 3] - N[a * 3]) * t,
      N[a * 3 + 1] + (N[b * 3 + 1] - N[a * 3 + 1]) * t,
      N[a * 3 + 2] + (N[b * 3 + 2] - N[a * 3 + 2]) * t,
    ).normalize();
    outPos.push(
      P[a * 3] + (P[b * 3] - P[a * 3]) * t + n.x * localOffset,
      P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t + n.y * localOffset,
      P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t + n.z * localOffset,
    );
    outNor.push(n.x, n.y, n.z);
    morphs.forEach((m, i) => {
      for (let c = 0; c < 3; c++) outMorph[i].push(m[a * 3 + c] + (m[b * 3 + c] - m[a * 3 + c]) * t);
    });
    for (let k = 0; k < 4; k++) {
      outIdx.push(skinIndex.getComponent(a, k));
      outW.push(skinWeight.getComponent(a, k));
    }
  };
  const vert = (a: number): void => emit(a, a, 0);
  const cut = (inside: number, outside: number): void => emit(inside, outside, f[inside] / (f[inside] - f[outside]));

  // Marching triangles: keep inside parts and clip triangles that cross the edge, so hems are smooth.
  for (let t = 0; t < index.count; t += 3) {
    const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    const ins = tri.map((v) => f[v] >= 0);
    const count = ins.filter(Boolean).length;
    if (count === 0) continue;
    if (count === 3) {
      tri.forEach(vert);
      continue;
    }
    // Rotate so the pattern starts at a consistent vertex while keeping the winding order.
    for (let r = 0; r < 3; r++) {
      const [a, b, c] = [tri[r], tri[(r + 1) % 3], tri[(r + 2) % 3]];
      const [ia, ib, ic] = [ins[r], ins[(r + 1) % 3], ins[(r + 2) % 3]];
      if (count === 1 && ia) {
        vert(a); cut(a, b); cut(a, c);
        break;
      }
      if (count === 2 && ia && ib && !ic) {
        vert(a); vert(b); cut(b, c);
        vert(a); cut(b, c); cut(a, c);
        break;
      }
    }
  }

  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(new Float32Array(outPos), 3));
  geom.setAttribute('normal', new BufferAttribute(new Float32Array(outNor), 3));
  geom.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(outIdx), 4));
  geom.setAttribute('skinWeight', new BufferAttribute(new Float32Array(outW), 4));
  if (morphs.length > 0) {
    geom.morphAttributes.position = outMorph.map((m) => new BufferAttribute(new Float32Array(m), 3));
    geom.morphTargetsRelative = true;
  }

  const mat = new MeshStandardMaterial({ color: spec.color, roughness: spec.roughness ?? 0.85 });
  const mesh = new SkinnedMesh(geom, mat);
  mesh.name = spec.name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.position.copy(body.position);
  mesh.quaternion.copy(body.quaternion);
  mesh.scale.copy(body.scale);
  body.parent?.add(mesh);
  mesh.bind(body.skeleton, body.bindMatrix);
  if (morphs.length > 0) mesh.updateMorphTargets();
  return mesh;
}
