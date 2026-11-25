// Builds phone-sized PBR textures (colour, normal, roughness as WebP) from ambientCG materials
// (https://ambientcg.com, CC0). Downloads are cached in assets-src/ambientcg/ (not committed).
//
// Usage: node scripts/build-textures.mjs   (or: npm run assets:textures)
// Output: public/assets/textures/<name>_c.webp, _n.webp, _r.webp
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

export const TEXTURES = [
  { name: 'floor_tile', id: 'Tiles002', size: 512 },
  { name: 'tiles_cream', id: 'Tiles141', size: 512 },
  { name: 'bath_floor', id: 'Tiles036', size: 512 },
  { name: 'bath_wall', id: 'Tiles133A', size: 512 },
  { name: 'plaster', id: 'PaintedPlaster017', size: 512 },
  { name: 'wood_light', id: 'Wood094', size: 512 },
  { name: 'wood_dark', id: 'Wood051', size: 512 },
  { name: 'fabric_blue', id: 'Fabric084', size: 256 },
  { name: 'fabric_linen', id: 'Fabric066', size: 256 },
  { name: 'fabric_weave', id: 'Fabric061', size: 256 },
  { name: 'fabric_white', id: 'Fabric081C', size: 256 },
];

const RAW = 'assets-src/ambientcg';
const OUT = 'public/assets/textures';

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

await mkdir(OUT, { recursive: true });
for (const t of TEXTURES) {
  const dir = join(RAW, t.id);
  if (!(await exists(dir))) {
    const res = await fetch(`https://ambientcg.com/get?file=${t.id}_1K-JPG.zip`);
    if (!res.ok) throw new Error(`${res.status} ${t.id}`);
    await mkdir(dir, { recursive: true });
    const zip = join(dir, 'src.zip');
    await writeFile(zip, Buffer.from(await res.arrayBuffer()));
    execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
  }
  const files = await readdir(dir);
  const pick = (part) => files.find((f) => f.includes(`_${part}.jpg`));
  for (const [part, suffix, q] of [['Color', 'c', 80], ['NormalGL', 'n', 85], ['Roughness', 'r', 75]]) {
    const f = pick(part);
    if (!f) continue;
    let img = sharp(join(dir, f)).resize(t.size, t.size);
    if (suffix === 'r') img = img.greyscale();
    await img.webp({ quality: q }).toFile(join(OUT, `${t.name}_${suffix}.webp`));
  }
  console.log(t.name, '<-', t.id);
}
