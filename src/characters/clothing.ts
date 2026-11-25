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
}

export const SHIRT_SHORT_SLEEVE: readonly string[] = ['spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r'];
export const SHIRT_LONG_SLEEVE: readonly string[] = [...SHIRT_SHORT_SLEEVE, 'lowerarm_l', 'lowerarm_r'];
export const PANTS_LONG: readonly string[] = ['pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r'];
export const PANTS_SHORT: readonly string[] = ['pelvis', 'thigh_l', 'thigh_r'];
export const SHOES: readonly string[] = ['foot_l', 'foot_r', 'ball_l', 'ball_r'];

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

export function createGarment(body: SkinnedMesh, spec: GarmentSpec): SkinnedMesh {
  const g = body.geometry;
  const pos = g.getAttribute('position') as BufferAttribute;
  const nor = g.getAttribute('normal') as BufferAttribute;
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

  // Offset is given in world metres; convert to the mesh's local units.
  body.updateWorldMatrix(true, false);
  const localOffset = spec.offset / body.getWorldScale(tmp).x;

  const outPos: number[] = [];
  const outNor: number[] = [];
  const outIdx: number[] = [];
  const outW: number[] = [];
  const n = new Vector3();

  /** Emits a vertex interpolated between a (inside) and b at parameter t; skin data comes from a. */
  const emit = (a: number, b: number, t: number): void => {
    n.set(
      nor.getX(a) + (nor.getX(b) - nor.getX(a)) * t,
      nor.getY(a) + (nor.getY(b) - nor.getY(a)) * t,
      nor.getZ(a) + (nor.getZ(b) - nor.getZ(a)) * t,
    ).normalize();
    outPos.push(
      pos.getX(a) + (pos.getX(b) - pos.getX(a)) * t + n.x * localOffset,
      pos.getY(a) + (pos.getY(b) - pos.getY(a)) * t + n.y * localOffset,
      pos.getZ(a) + (pos.getZ(b) - pos.getZ(a)) * t + n.z * localOffset,
    );
    outNor.push(n.x, n.y, n.z);
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
  return mesh;
}
