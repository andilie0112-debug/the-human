import { DataTexture, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, type Texture } from 'three';

// Soft dark patch under furniture ("contact shadow"), so objects sit on the floor instead of
// looking pasted on. Cheap: one shared texture, one transparent plane per object, no extra pass.

let tex: Texture | null = null;

function shadowTexture(): Texture {
  if (tex) return tex;
  // Soft rounded square computed directly (canvas blur filters are not available in every browser).
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  const half = 0.3; // half size of the dark core (texture units)
  const soft = 0.2; // fade distance
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = Math.abs((x + 0.5) / n - 0.5);
      const v = Math.abs((y + 0.5) / n - 0.5);
      const dx = Math.max(u - (half - 0.08), 0);
      const dy = Math.max(v - (half - 0.08), 0);
      const d = Math.hypot(dx, dy) - 0.08; // rounded corners
      const t = Math.min(1, Math.max(0, 1 - d / soft));
      const a = t * t * (3 - 2 * t);
      const i = (y * n + x) * 4;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const t = new DataTexture(data, n, n);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  tex = t;
  return t;
}

/** A soft shadow plane for a footprint (metres), lying on the floor at the model's origin. */
export function contactShadow(width: number, depth: number, strength = 0.5): Mesh {
  const mat = new MeshBasicMaterial({ map: shadowTexture(), color: '#000000', transparent: true, opacity: strength, depthWrite: false });
  // The dark core fills ~60% of the texture: enlarge so it matches the footprint.
  const m = new Mesh(new PlaneGeometry(width * 1.55 + 0.15, depth * 1.55 + 0.15), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.004;
  m.renderOrder = -1;
  m.castShadow = false;
  m.receiveShadow = false;
  m.userData.noPick = true;
  m.raycast = () => undefined;
  return m;
}
