// Downloads realistic CC0 props from Poly Haven (https://polyhaven.com, CC0) and builds
// phone-friendly GLB files: WebP textures (512-1024 px), simplified meshes, meshopt compression.
//
// Usage: node scripts/build-props.mjs [id ...]   (or: npm run assets:props)
// Raw downloads are cached in assets-src/polyhaven/ (not committed); output goes to
// public/assets/props/<id>.glb. Every asset here must be listed in Design/ASSET_LICENSES.md.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

/** Poly Haven model ids used by the game, with texture size and triangle budget. */
export const PROPS = [
  { id: 'plastic_monobloc_chair_01', tex: 512, tris: 3000 },
  { id: 'potted_plant_02', tex: 512, tris: 6000 },
  { id: 'sofa_02', tex: 1024, tris: 6000 },
  { id: 'desk_lamp_arm_01', tex: 512, tris: 2000 },
  { id: 'old_bed_frame', tex: 1024, tris: 5000 },
  { id: 'vintage_electric_kettle', tex: 512, tris: 2000 },
  { id: 'CashRegister_01', tex: 512, tris: 3000 },
  { id: 'wooden_table_02', tex: 512, tris: 3000 },
  { id: 'wooden_display_shelves_01', tex: 1024, tris: 4000 },
  { id: 'vintage_wooden_drawer_01', tex: 512, tris: 2500 },
  { id: 'wall_clock', tex: 512, tris: 1200 },
  { id: 'throw_pillows_01', tex: 512, tris: 1500 },
  { id: 'exterior_aircon_unit', tex: 512, tris: 600, error: 0.05 },
];

const RAW = 'assets-src/polyhaven';
const OUT = 'public/assets/props';

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function fetchTo(url, path) {
  if (await exists(path)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

/** Downloads the 1k glTF and its files; returns the local .gltf path. */
async function download(id) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const g = files.gltf['1k'].gltf;
  const dir = join(RAW, id);
  const main = join(dir, `${id}.gltf`);
  await fetchTo(g.url, main);
  for (const [rel, f] of Object.entries(g.include)) await fetchTo(f.url, join(dir, rel));
  return main;
}

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

function triangles(doc) {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return Math.round(n);
}

const only = process.argv.slice(2);
await mkdir(OUT, { recursive: true });
for (const p of PROPS) {
  if (only.length && !only.includes(p.id)) continue;
  const src = await download(p.id);
  const doc = await io.read(src);
  const before = triangles(doc);
  await doc.transform(weld(), dedup());
  if (before > p.tris) {
    const ratio = Math.max(0.02, p.tris / before);
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: p.error ?? 0.004, lockBorder: false }));
  }
  await doc.transform(
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [p.tex, p.tex], quality: 80 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const out = join(OUT, `${p.id}.glb`);
  await io.write(out, doc);
  const size = (await readFile(out)).length;
  console.log(`${p.id}: ${before} -> ${triangles(doc)} tris, ${(size / 1024).toFixed(0)} KB`);
}
