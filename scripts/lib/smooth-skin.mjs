// Removes the painted-in muscle shading from a body's skin texture while keeping the face
// and hands sharp. Works in texture space:
//   1. rasterize the body's UV triangles into a "smooth amount" mask
//      (1 on the torso, arms and legs; 0 where vertices are skinned to the head or hands)
//   2. blur the texture with normalized convolution (no bleeding from empty texture areas)
//   3. blend original and blurred by the mask.
import sharp from 'sharp';

const SIZE = 1024;
const KEEP_SHARP = /^(Head|hand_|thumb_|index_|middle_|ring_|pinky_)/;

function rasterize(mask, cover, uv, values, a, b, c) {
  const [ax, ay] = [uv[a * 2] * SIZE, uv[a * 2 + 1] * SIZE];
  const [bx, by] = [uv[b * 2] * SIZE, uv[b * 2 + 1] * SIZE];
  const [cx, cy] = [uv[c * 2] * SIZE, uv[c * 2 + 1] * SIZE];
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(SIZE - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(SIZE - 1, Math.ceil(Math.max(ay, by, cy)));
  const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  if (Math.abs(area) < 1e-9) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
      const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
      const i = y * SIZE + x;
      mask[i] = w0 * values[a] + w1 * values[b] + w2 * values[c];
      cover[i] = 255;
    }
  }
}

async function blurRaw(buf, channels, sigma) {
  let img = sharp(buf, { raw: { width: SIZE, height: SIZE, channels } }).blur(sigma);
  if (channels === 1) img = img.extractChannel(0); // sharp would otherwise return 3 channels
  const out = await img.raw().toBuffer();
  if (out.length !== SIZE * SIZE * channels) throw new Error(`unexpected blur output size ${out.length}`);
  return out;
}

/**
 * @param {Buffer} png  source skin texture
 * @param {import('@gltf-transform/core').Primitive} prim  body primitive (TEXCOORD_0, JOINTS_0, WEIGHTS_0)
 * @param {string[]} jointNames  skin joint names, indexed like JOINTS_0
 * @returns {Promise<Buffer>} PNG at 1024x1024
 */
export async function smoothSkinTexture(png, prim, jointNames) {
  const uv = prim.getAttribute('TEXCOORD_0').getArray();
  const joints = prim.getAttribute('JOINTS_0');
  const weights = prim.getAttribute('WEIGHTS_0');
  const count = joints.getCount();
  const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  const smoothAmount = new Float32Array(count);
  for (let v = 0; v < count; v++) {
    joints.getElement(v, j);
    weights.getElement(v, w);
    let keep = 0;
    for (let k = 0; k < 4; k++) if (KEEP_SHARP.test(jointNames[j[k]] ?? '')) keep += w[k];
    smoothAmount[v] = Math.max(0, 1 - keep * 1.5); // fade out before the head/hands
  }

  const mask = new Float32Array(SIZE * SIZE);
  const cover = new Uint8Array(SIZE * SIZE);
  const idx = prim.getIndices().getArray();
  for (let t = 0; t < idx.length; t += 3) rasterize(mask, cover, uv, smoothAmount, idx[t], idx[t + 1], idx[t + 2]);

  const img = await sharp(png).resize(SIZE, SIZE).removeAlpha().raw().toBuffer();
  // Normalized convolution: blur(img * cover) / blur(cover).
  const pre = Buffer.alloc(SIZE * SIZE * 3);
  for (let i = 0; i < SIZE * SIZE; i++) for (let c = 0; c < 3; c++) pre[i * 3 + c] = cover[i] ? img[i * 3 + c] : 0;
  const SIGMA = 14;
  const [blurImg, blurCover] = await Promise.all([blurRaw(pre, 3, SIGMA), blurRaw(Buffer.from(cover), 1, SIGMA)]);
  // Soften the mask edge so the transition to the face is invisible.
  const maskBytes = Buffer.from(mask.map((m) => Math.round(Math.min(1, Math.max(0, m)) * 255)));
  const softMask = await blurRaw(maskBytes, 1, 4);

  const out = Buffer.alloc(SIZE * SIZE * 3);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const m = cover[i] ? softMask[i] / 255 : 0;
    const bc = blurCover[i] || 1;
    for (let c = 0; c < 3; c++) {
      const blurred = Math.min(255, (blurImg[i * 3 + c] * 255) / bc);
      out[i * 3 + c] = Math.round(img[i * 3 + c] * (1 - m) + blurred * m);
    }
  }
  return sharp(out, { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toBuffer();
}
