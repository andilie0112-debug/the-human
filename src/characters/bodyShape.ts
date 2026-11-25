import { BufferAttribute, Matrix4, Vector3, type SkinnedMesh } from 'three';

/**
 * Body shape morphs generated in code from the skeleton, so one base body can look average,
 * athletic, thin or heavy. Each vertex moves away from (or towards) the bone it is skinned to,
 * scaled per bone. The result is stored as relative morph targets in geometry space.
 *
 * Morph 0 "lean": removes the source model's superhero muscle mass (influence = 1 - muscle).
 * Morph 1 "fat": adds belly, hips, thighs, arms and a softer neck (influence = fat).
 */
export const MORPH_LEAN = 0;
export const MORPH_FAT = 1;

/** Bones whose fat grows mostly forwards (a belly rather than a uniformly wider waist). */
const BELLY = new Set(['pelvis', 'spine_01', 'spine_02']);
/** Character forward axis in bind space (glTF characters face +Z). */
const FORWARD_Z = 1;

/** Radial gain per bone: fraction of the vertex's distance from the bone axis to add or remove. */
const LEAN_GAIN: Record<string, number> = {
  upperarm_l: -0.42, upperarm_r: -0.42,
  lowerarm_l: -0.28, lowerarm_r: -0.28,
  clavicle_l: -0.38, clavicle_r: -0.38,
  neck_01: -0.22,
  spine_03: -0.2, spine_02: -0.14, spine_01: -0.06,
  thigh_l: -0.18, thigh_r: -0.18,
  calf_l: -0.16, calf_r: -0.16,
};

const FAT_GAIN: Record<string, number> = {
  spine_01: 0.55, pelvis: 0.35, spine_02: 0.38, spine_03: 0.16,
  thigh_l: 0.22, thigh_r: 0.22,
  calf_l: 0.08, calf_r: 0.08,
  upperarm_l: 0.2, upperarm_r: 0.2,
  lowerarm_l: 0.08, lowerarm_r: 0.08,
  neck_01: 0.25, Head: 0.03,
};

interface Segment {
  a: Vector3;
  b: Vector3;
}

/** Closest point on segment ab to p, written into out. */
function closestOnSegment(p: Vector3, s: Segment, out: Vector3): Vector3 {
  const ab = tmpAB.subVectors(s.b, s.a);
  const lenSq = ab.lengthSq();
  const t = lenSq > 1e-12 ? Math.min(1, Math.max(0, tmpAP.subVectors(p, s.a).dot(ab) / lenSq)) : 0;
  return out.copy(s.a).addScaledVector(ab, t);
}

const tmpAB = new Vector3();
const tmpAP = new Vector3();
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpP = new Vector3();

/** Computes per-vertex morph deltas (geometry space) for the given skinned body. */
export function computeBodyMorphs(body: SkinnedMesh): Float32Array[] {
  const g = body.geometry;
  const pos = g.getAttribute('position') as BufferAttribute;
  const skinIndex = g.getAttribute('skinIndex') as BufferAttribute;
  const skinWeight = g.getAttribute('skinWeight') as BufferAttribute;
  const bones = body.skeleton.bones;

  // Bone axes in bind space (the space boneInverses expect: bindMatrix * position).
  const bindPos = body.skeleton.boneInverses.map((inv) => new Vector3().setFromMatrixPosition(new Matrix4().copy(inv).invert()));
  const segments: Segment[] = bones.map((bone, i) => {
    const child = bone.children.find((c) => bones.includes(c as never));
    const end = child ? bindPos[bones.indexOf(child as never)] : bindPos[i];
    return { a: bindPos[i], b: end };
  });
  const gains = [LEAN_GAIN, FAT_GAIN].map((table) => bones.map((b) => table[b.name] ?? 0));

  // Not body.bindMatrixInverse: in attached bind mode three.js overwrites it every frame with the
  // inverse world matrix, which differs from bindMatrix once the character is scaled.
  const toGeom = new Matrix4().copy(body.bindMatrix).invert();
  const morphs = gains.map(() => new Float32Array(pos.count * 3));

  for (let v = 0; v < pos.count; v++) {
    tmpP.set(pos.getX(v), pos.getY(v), pos.getZ(v)).applyMatrix4(body.bindMatrix);
    for (let m = 0; m < gains.length; m++) {
      let dx = 0, dy = 0, dz = 0;
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(v, k);
        if (w === 0) continue;
        const bi = skinIndex.getComponent(v, k);
        const gain = gains[m][bi];
        if (gain === 0) continue;
        closestOnSegment(tmpP, segments[bi], tmpB);
        let g = gain;
        if (m === MORPH_FAT && BELLY.has(bones[bi].name)) {
          // Front of the torso grows up to 2.5x more than the back.
          const rz = tmpP.z - tmpB.z;
          const len = Math.hypot(tmpP.x - tmpB.x, tmpP.y - tmpB.y, rz) || 1;
          g *= 0.6 + 1.9 * Math.max(0, (rz / len) * FORWARD_Z);
        }
        dx += (tmpP.x - tmpB.x) * g * w;
        dy += (tmpP.y - tmpB.y) * g * w;
        dz += (tmpP.z - tmpB.z) * g * w;
      }
      // Bring the displaced point back to geometry space and store the difference.
      tmpA.set(tmpP.x + dx, tmpP.y + dy, tmpP.z + dz).applyMatrix4(toGeom);
      morphs[m][v * 3] = tmpA.x - pos.getX(v);
      morphs[m][v * 3 + 1] = tmpA.y - pos.getY(v);
      morphs[m][v * 3 + 2] = tmpA.z - pos.getZ(v);
    }
  }
  return morphs;
}

/** Attaches morph deltas to a mesh's geometry as relative morph targets. */
export function applyMorphs(mesh: SkinnedMesh, morphs: Float32Array[]): void {
  mesh.geometry.morphAttributes.position = morphs.map((m) => new BufferAttribute(m, 3));
  mesh.geometry.morphTargetsRelative = true;
  mesh.updateMorphTargets();
}
