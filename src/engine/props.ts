import { Box3, Group, InstancedMesh, Matrix4, Mesh, Vector3, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Realistic CC0 props (Poly Haven, built by scripts/build-props.mjs), loaded once and cloned.

const base = `${import.meta.env.BASE_URL}assets/props/`;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<Object3D>>();

function load(id: string): Promise<Object3D> {
  let p = cache.get(id);
  if (!p) {
    p = loader.loadAsync(`${base}${id}.glb`).then((g) => {
      g.scene.traverse((o) => {
        if (o instanceof Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      return g.scene;
    });
    cache.set(id, p);
  }
  return p;
}

export interface PropPlacement {
  x?: number;
  y?: number;
  z?: number;
  /** Rotation around Y in degrees. */
  rot?: number;
  /** Target size in metres along the model's own axes [x, y, z]. Missing axes keep proportions. */
  size?: [number | null, number | null, number | null];
  /** Stretch each axis independently to `size` (simple furniture); otherwise one uniform scale. */
  stretch?: boolean;
}

/**
 * Adds a realistic prop to a model group. The prop appears once loaded; until then nothing is
 * shown. `onReady` lets the room register the new meshes (tapping, shadows).
 */
export function addProp(parent: Group, id: string, p: PropPlacement = {}): Group {
  const holder = new Group();
  holder.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
  holder.rotation.y = ((p.rot ?? 0) * Math.PI) / 180;
  parent.add(holder);
  holder.userData.propReady = load(id).then((src) => {
    const model = src.clone(true);
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const want = p.size ?? [null, null, null];
    const ratios = [want[0] !== null ? want[0] / size.x : null, want[1] !== null ? want[1] / size.y : null, want[2] !== null ? want[2] / size.z : null];
    const given = ratios.filter((r): r is number => r !== null);
    const uniform = given.length ? Math.min(...given) : 1;
    if (p.stretch) model.scale.set(ratios[0] ?? uniform, ratios[1] ?? uniform, ratios[2] ?? uniform);
    else model.scale.setScalar(uniform);
    // Centre on x/z, stand on y = 0.
    const s = model.scale;
    model.position.set(-((box.min.x + box.max.x) / 2) * s.x, -box.min.y * s.y, -((box.min.z + box.max.z) / 2) * s.z);
    holder.add(model);
    return holder;
  });
  return holder;
}

/** Calls `fn` for every prop in a model once it has loaded. */
export function whenPropsReady(root: Object3D, fn: (holder: Group) => void): void {
  root.traverse((o) => {
    const ready = o.userData.propReady as Promise<Group> | undefined;
    if (ready) void ready.then(fn);
  });
}

/**
 * Many copies of one prop drawn together (one draw call per part): `places` are the world
 * transforms of each copy; the prop is scaled to `height` metres, centred, standing on y = 0.
 */
export function instanceProp(id: string, places: readonly Matrix4[], height: number): Group {
  const group = new Group();
  if (!places.length) return group;
  void load(id).then((src) => {
    src.updateMatrixWorld(true);
    const box = new Box3().setFromObject(src);
    const size = box.getSize(new Vector3());
    const k = height / size.y;
    const fit = new Matrix4().makeScale(k, k, k).multiply(new Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
    const m = new Matrix4();
    src.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const local = fit.clone().multiply(o.matrixWorld);
      const inst = new InstancedMesh(o.geometry, o.material, places.length);
      places.forEach((p, i) => inst.setMatrixAt(i, m.copy(p).multiply(local)));
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.castShadow = true;
      inst.receiveShadow = true;
      group.add(inst);
    });
  });
  return group;
}
