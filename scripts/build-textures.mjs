// Builds phone-sized PBR textures (colour, normal, roughness as WebP) from ambientCG materials
// (https://ambientcg.com, CC0). Downloads are cached in assets-src/ambientcg/ (not committed).
//
// Usage: node scripts/build-textures.mjs   (or: npm run assets:textures)
// Output: public/assets/textures/<name>_c.webp, _n.webp, _r.webp (phones, Low graphics) and
// public/assets/textures/hd/... (twice the size and more of the real detail, Medium and High).
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

export const TEXTURES = [
  { name: 'floor_tile', id: 'Tiles002', size: 512, contrast: 0.8, soften: 0.4 },
  { name: 'tiles_cream', id: 'Tiles141', size: 512 },
  { name: 'bath_floor', id: 'Tiles036', size: 512 },
  { name: 'bath_wall', id: 'Tiles133A', size: 512, contrast: 0.8, soften: 0.4 },
  { name: 'plaster', id: 'PaintedPlaster017', size: 512, contrast: 0.3, soften: 1.5 },
  { name: 'wood_light', id: 'Wood094', size: 512, contrast: 0.75, soften: 0.4 },
  { name: 'wood_dark', id: 'Wood051', size: 512, contrast: 0.75, soften: 0.4 },
  { name: 'fabric_blue', id: 'Fabric084', size: 256 },
  { name: 'fabric_linen', id: 'Fabric066', size: 256 },
  { name: 'fabric_weave', id: 'Fabric061', size: 256 },
  { name: 'fabric_white', id: 'Fabric081C', size: 256 },
  { name: 'roof_tiles', id: 'RoofingTiles013A', size: 512, contrast: 0.75, soften: 0.5 },
  { name: 'asphalt', id: 'Asphalt031', size: 512, contrast: 0.4, soften: 1.0 },
  { name: 'paving', id: 'PavingStones138', size: 512 },
  { name: 'grass', id: 'Grass004', size: 512, contrast: 0.35, soften: 1.2 },
  { name: 'concrete', id: 'Concrete034', size: 512 },
  { name: 'zinc', id: 'CorrugatedSteel005', size: 256 },
  { name: 'bark', id: 'Bark012', size: 512, contrast: 0.9, soften: 0.3 },
];

const RAW = 'assets-src/ambientcg';
const OUT = 'public/assets/textures';
const HD = 'public/assets/textures/hd';

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

await mkdir(HD, { recursive: true });
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
  for (const hd of [false, true])
  for (const [part, suffix, q] of [['Color', 'c', 80], ['NormalGL', 'n', 85], ['Roughness', 'r', 75]]) {
    const f = pick(part);
    if (!f) continue;
    const size = hd ? Math.min(1024, t.size * 2) : t.size;
    let img = sharp(join(dir, f)).resize(size, size);
    if (suffix === 'r') img = img.greyscale();
    if (suffix === 'c') {
      // "Clean" art direction: calmer colour maps (less grime and speckle, softer contrast,
      // a little less saturation); the pattern stays readable and the tint gives the colour.
      const stats = await sharp(join(dir, f)).stats();
      // HD keeps more of the photo's real variation (stains, wear, grain).
      const keep = Math.min(1, (t.contrast ?? 0.55) + (hd ? 0.25 : 0));
      const colour = stats.channels.slice(0, Math.min(3, stats.channels.length));
      const offsets = colour.map((c) => c.mean * (1 - keep));
      img = img.blur(Math.max(0.3, (t.soften ?? 0.8) * (hd ? 0.5 : 1))).removeAlpha().modulate({ saturation: hd ? 0.92 : 0.85 }).linear(offsets.map(() => keep), offsets);
    }
    if (suffix === 'n') {
      // Softer bumps too: blend the normal map towards flat.
      if (!hd) img = img.blur(0.6);
    }
    await img.webp({ quality: q }).toFile(join(hd ? HD : OUT, `${t.name}_${suffix}.webp`));
  }
  console.log(t.name, '<-', t.id);
}
