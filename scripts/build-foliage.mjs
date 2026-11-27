// Builds leaf textures for the trees from photographed CC0 leaves (ambientCG, https://ambientcg.com):
// single leaves are cut out of the leaf sets and arranged into twigs full of leaves (mango and
// ketapang-like trees) and into coconut palm fronds (narrow leaflets along a midrib). The trees
// themselves are built in code from these cards (src/world/trees.ts).
//
// Usage: node scripts/build-foliage.mjs   (or: npm run assets:foliage)
// Output: public/assets/textures/foliage/<name>.webp (512 px, Low) and .../foliage/hd/<name>.webp
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const RAW = 'assets-src/ambientcg';
const OUT = 'public/assets/textures/foliage';

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function fetchSet(id) {
  const dir = join(RAW, id);
  if (!(await exists(join(dir, 'src.zip')))) {
    const res = await fetch(`https://ambientcg.com/get?file=${id}_1K-JPG.zip`);
    if (!res.ok) throw new Error(`${res.status} ${id}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'src.zip'), Buffer.from(await res.arrayBuffer()));
    execFileSync('unzip', ['-q', '-o', join(dir, 'src.zip'), '-d', dir]);
  }
  const files = await readdir(dir);
  const f = (part) => join(dir, files.find((x) => x.endsWith(`_${part}.jpg`)));
  return { color: f('Color'), opacity: f('Opacity') };
}

/** Cuts the single leaves out of a leaf set: RGBA buffers, each with its size. */
async function leaves(id) {
  const { color, opacity } = await fetchSet(id);
  const meta = await sharp(color).metadata();
  const W = meta.width;
  const H = meta.height;
  const rgb = await sharp(color).removeAlpha().raw().toBuffer();
  const mask = await sharp(opacity).greyscale().raw().toBuffer();
  // Connected areas of the mask (on a coarse grid, then cropped from the full image).
  const S = 4;
  const gw = Math.floor(W / S);
  const gh = Math.floor(H / S);
  const solid = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) solid[y * gw + x] = mask[y * S * W + x * S] > 128 ? 1 : 0;
  const seen = new Uint8Array(gw * gh);
  const out = [];
  for (let i = 0; i < solid.length; i++) {
    if (!solid[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    let x0 = gw, y0 = gh, x1 = 0, y1 = 0, n = 0;
    while (stack.length) {
      const j = stack.pop();
      const x = j % gw;
      const y = (j / gw) | 0;
      n++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const k of [j - 1, j + 1, j - gw, j + gw]) if (k >= 0 && k < solid.length && solid[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
    }
    if (n < 300) continue; // specks
    const left = x0 * S, top = y0 * S, w = (x1 - x0 + 1) * S, h = (y1 - y0 + 1) * S;
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const s = (top + y) * W + left + x;
        const d = (y * w + x) * 4;
        buf[d] = rgb[s * 3];
        buf[d + 1] = rgb[s * 3 + 1];
        buf[d + 2] = rgb[s * 3 + 2];
        buf[d + 3] = mask[s];
      }
    out.push({ buf, w, h });
  }
  return out;
}

/** A leaf turned by `deg` (its stem at the bottom), scaled to `len` px long, shaded. */
async function placed(leaf, len, deg, shade, thin = 1, hue = 0) {
  const scale = len / leaf.h;
  const w = Math.max(2, Math.round(leaf.w * scale * thin));
  const img = await sharp(leaf.buf, { raw: { width: leaf.w, height: leaf.h, channels: 4 } })
    .resize(w, Math.round(len), { fit: 'fill' })
    .modulate({ brightness: shade, hue, saturation: hue ? 1.05 : 1 })
    .rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const m = await sharp(img).metadata();
  return { img, w: m.width, h: m.height };
}

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** A small branch on a square card: a stem with side twigs, leaves along each and a tuft at the tips. */
async function twig(set, size, count, leafLen) {
  const parts = [];
  const paths = [];
  // Stems: [x0, y0, x1, y1] in card units (0..1), the main one up the middle.
  const stems = [[0.5, 1, 0.5, 0.08]];
  for (const [t, side] of [[0.3, -1], [0.45, 1], [0.6, -1], [0.72, 1]]) {
    const y = 1 - t * 0.92;
    stems.push([0.5, y, 0.5 + side * (0.3 + rnd() * 0.12), y - 0.22 - rnd() * 0.08]);
  }
  for (const [x0, y0, x1, y1] of stems) paths.push(`<path d="M${x0 * size} ${y0 * size} L${x1 * size} ${y1 * size}" stroke="#5b4630" stroke-width="${size / 140}" fill="none"/>`);
  parts.push({ input: Buffer.from(`<svg width="${size}" height="${size}">${paths.join('')}</svg>`), left: 0, top: 0 });
  const perStem = Math.max(4, Math.round(count / stems.length));
  for (const [si, [x0, y0, x1, y1]] of stems.entries()) {
    const base = (Math.atan2(x1 - x0, -(y1 - y0)) * 180) / Math.PI;
    const n = si === 0 ? perStem + 2 : perStem;
    for (let i = 0; i < n; i++) {
      const t = (si === 0 ? 0.3 : 0.2) + (i / n) * (si === 0 ? 0.7 : 0.8);
      const side = i % 2 ? 1 : -1;
      const tip = i >= n - 2;
      const deg = base + (tip ? (rnd() - 0.5) * 50 : side * (40 + rnd() * 35));
      const len = leafLen * (0.7 + rnd() * 0.35) * (si === 0 ? 1 : 0.85);
      const leaf = set[Math.floor(rnd() * set.length)];
      const p = await placed(leaf, len, deg, 0.72 + rnd() * 0.35);
      const bx = (x0 + (x1 - x0) * t) * size;
      const by = (y0 + (y1 - y0) * t) * size;
      const r = (deg * Math.PI) / 180;
      parts.push({ input: p.img, left: Math.round(bx + Math.sin(r) * len * 0.5 - p.w / 2), top: Math.round(by - Math.cos(r) * len * 0.5 - p.h / 2) });
    }
  }
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(parts.filter((p) => p.left > -size && p.top > -size))
    .png()
    .toBuffer();
}

/** A palm frond: a midrib down the middle with long narrow leaflets angled to the tip. */
async function frond(set, w, h) {
  const parts = [];
  const rib = Buffer.from(`<svg width="${w}" height="${h}"><path d="M${w / 2} ${h} L${w / 2} 0" stroke="#8a7a3a" stroke-width="${w / 45}" fill="none"/></svg>`);
  parts.push({ input: rib, left: 0, top: 0 });
  const n = 34;
  for (let i = 0; i < n; i++) {
    const t = 0.04 + (i / n) * 0.94;
    for (const side of [-1, 1]) {
      const deg = side * (62 - t * 22 + (rnd() - 0.5) * 8);
      // Long leaflets reaching nearly to the card's edge, shorter towards the tip.
      const len = ((w * 0.48) / Math.sin((Math.abs(deg) * Math.PI) / 180)) * (1 - t * 0.5) * (0.92 + rnd() * 0.1);
      const leaf = set[Math.floor(rnd() * set.length)];
      // Coconut leaflets: long, narrow and a deeper green than the source leaf.
      const p = await placed(leaf, len, deg, 0.7 + rnd() * 0.18, 0.55, 16);
      const by = h * (1 - t);
      const r = (deg * Math.PI) / 180;
      const cx = w / 2 + Math.sin(r) * len * 0.5;
      const cy = by - Math.cos(r) * len * 0.5;
      parts.push({ input: p.img, left: Math.round(cx - p.w / 2), top: Math.round(cy - p.h / 2) });
    }
  }
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(parts.filter((p) => p.left > -w && p.top > -h))
    .png()
    .toBuffer();
}

await mkdir(join(OUT, 'hd'), { recursive: true });
const mango = await leaves('LeafSet022');
const ketapang = await leaves('LeafSet024');
const narrow = await leaves('LeafSet013');
console.log('leaves', mango.length, ketapang.length, narrow.length);
const cards = {
  mango: await twig(mango, 1024, 46, 170),
  ketapang: await twig(ketapang, 1024, 36, 200),
  palm: await frond(narrow, 512, 2048),
};
for (const [name, png] of Object.entries(cards)) {
  const m = await sharp(png).metadata();
  await sharp(png).webp({ quality: 82, alphaQuality: 90 }).toFile(join(OUT, 'hd', `${name}.webp`));
  await sharp(png).resize(m.width / 2, m.height / 2).webp({ quality: 80, alphaQuality: 90 }).toFile(join(OUT, `${name}.webp`));
  console.log('card', name);
}
