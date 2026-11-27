// Builds the sky panoramas (equirectangular WebP) from Poly Haven "pure sky" HDRIs
// (https://polyhaven.com, CC0), using their tonemapped JPG versions. Downloads are cached in
// assets-src/polyhaven/ (not committed).
//
// Usage: node scripts/build-skies.mjs   (or: npm run assets:skies)
// Output: public/assets/skies/<name>.webp (2048 x 1024 for phones) and <name>_hd.webp (4096 x 2048)
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

export const SKIES = [
  { name: 'day', id: 'kloofendal_48d_partly_cloudy_puresky' },
  // Warmed towards the orange of a tropical evening.
  { name: 'golden', id: 'belfast_sunset_puresky', recomb: [[1.2, 0.08, 0], [0.04, 0.92, 0], [0, 0.02, 0.7]], gamma: 1.0 },
  { name: 'overcast', id: 'kloofendal_overcast_puresky' },
  // Darkened to a night sky over a city (the clouds lit orange from below).
  { name: 'night', id: 'kloppenheim_07_puresky', recomb: [[0.3, 0.02, 0], [0.01, 0.24, 0.02], [0, 0.03, 0.38]] },
];

const RAW = 'assets-src/polyhaven';
const OUT = 'public/assets/skies';

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

await mkdir(RAW, { recursive: true });
await mkdir(OUT, { recursive: true });
for (const s of SKIES) {
  const src = join(RAW, `${s.id}.jpg`);
  if (!(await exists(src))) {
    const info = await (await fetch(`https://api.polyhaven.com/files/${s.id}`)).json();
    const res = await fetch(info.tonemapped.url);
    if (!res.ok) throw new Error(`${res.status} ${s.id}`);
    await writeFile(src, Buffer.from(await res.arrayBuffer()));
  }
  const img = (w) => {
    let i = sharp(src, { limitInputPixels: false }).resize(w, w / 2);
    if (s.recomb) i = i.recomb(s.recomb);
    return i;
  };
  await img(2048).webp({ quality: 78 }).toFile(join(OUT, `${s.name}.webp`));
  await img(4096).webp({ quality: 80 }).toFile(join(OUT, `${s.name}_hd.webp`));
  console.log('sky', s.name);
}
