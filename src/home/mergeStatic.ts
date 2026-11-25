import { BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, SkinnedMesh, type BufferGeometry, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Draw-call saver for furniture: the parts of an object model that never move (no name on the
// part or any of its parents) are merged into one mesh per look (colour, roughness, texture).
// Named parts (doors, lids, blankets, food, water...) stay separate so they can animate.

function lookKey(m: Material): string | null {
  if (!(m instanceof MeshStandardMaterial)) return null;
  if (m.transparent || m.side !== 0) return null;
  return [m.color.getHexString(), m.roughness, m.metalness, m.map?.uuid ?? '', m.emissive.getHexString(), m.emissiveIntensity].join('|');
}

function isStatic(o: Object3D, root: Object3D): boolean {
  for (let p: Object3D | null = o; p && p !== root; p = p.parent) {
    if (p.name || !p.visible) return false;
  }
  return true;
}

/** Keeps only position, normal and uv, always indexed, so geometries can be merged. */
function normalized(g: BufferGeometry, m: Matrix4): BufferGeometry | null {
  if (!g.attributes.position || !g.attributes.normal) return null;
  const c = g.clone();
  for (const name of Object.keys(c.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') c.deleteAttribute(name);
  if (!c.attributes.uv) c.setAttribute('uv', new BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
  if (!c.index) {
    const n = c.attributes.position.count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    c.setIndex(new BufferAttribute(idx, 1));
  }
  c.morphAttributes = {};
  c.clearGroups();
  c.applyMatrix4(m);
  return c;
}

/** Merges the static parts of an object model (call before placing it). Returns meshes saved. */
export function mergeStatic(root: Object3D): number {
  root.updateMatrixWorld(true);
  const inv = new Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, Mesh[]>();
  root.traverse((o) => {
    if (!(o instanceof Mesh) || o instanceof SkinnedMesh || Array.isArray(o.material)) return;
    if (!isStatic(o, root)) return;
    const key = lookKey(o.material as Material);
    if (key === null) return;
    const list = groups.get(key) ?? [];
    list.push(o);
    groups.set(key, list);
  });
  let saved = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const parts: BufferGeometry[] = [];
    for (const mesh of list) {
      const g = normalized(mesh.geometry, new Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
      if (g) parts.push(g);
    }
    if (parts.length !== list.length) {
      for (const g of parts) g.dispose();
      continue;
    }
    // Index types must match: promote to 32-bit when any part needs it.
    if (parts.some((g) => g.index!.array instanceof Uint32Array)) {
      for (const g of parts) if (!(g.index!.array instanceof Uint32Array)) g.setIndex(new BufferAttribute(Uint32Array.from(g.index!.array), 1));
    }
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    if (!merged) continue;
    const mesh = new Mesh(merged, list[0].material);
    mesh.castShadow = list.some((m) => m.castShadow);
    mesh.receiveShadow = list.some((m) => m.receiveShadow);
    for (const m of list) {
      m.removeFromParent();
      m.geometry.dispose();
      if (m.material !== list[0].material) (m.material as Material).dispose();
    }
    root.add(mesh);
    saved += list.length - 1;
  }
  return saved;
}
