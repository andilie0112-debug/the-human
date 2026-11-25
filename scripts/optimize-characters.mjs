// Converts raw Quaternius character .gltf files into optimized .glb files for the game.
// Usage: node scripts/optimize-characters.mjs
// Input:  assets-src/quaternius-ultimate-animated-characters/*.gltf
// Output: public/assets/characters/<name>.glb
import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const SRC = 'assets-src/quaternius-ultimate-animated-characters';
const OUT = 'public/assets/characters';
// Violent or off-theme clips are dropped (GDD: no violence in the open world).
const KEEP = new Set(['Idle', 'Walk', 'Run', 'SitDown', 'StandUp', 'PickUp', 'Victory', 'Defeat', 'Jump', 'Walk_Carry', 'Run_Carry']);

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

for (const file of readdirSync(SRC).filter((f) => f.endsWith('.gltf'))) {
  const doc = await io.read(join(SRC, file));
  for (const anim of doc.getRoot().listAnimations()) {
    if (!KEEP.has(anim.getName())) anim.dispose();
  }
  await doc.transform(prune(), dedup(), resample(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = join(OUT, basename(file, '.gltf') + '.glb');
  await io.write(out, doc);
  console.log('wrote', out);
}
