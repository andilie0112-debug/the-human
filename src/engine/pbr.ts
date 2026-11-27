import { getQuality } from './graphics';
import { Color, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector2, type Texture } from 'three';

// Realistic materials from photo-scanned CC0 textures (ambientCG, built by scripts/build-textures.mjs).
// Images are loaded once and shared; each material gets its own repeat.

export type TextureName =
  | 'floor_tile' | 'tiles_cream' | 'bath_floor' | 'bath_wall' | 'plaster'
  | 'wood_light' | 'wood_dark' | 'fabric_blue' | 'fabric_linen' | 'fabric_weave' | 'fabric_white'
  | 'roof_tiles' | 'asphalt' | 'paving' | 'grass' | 'concrete' | 'zinc';

// Medium and High graphics use the sharper set with more of the real detail.
const base = `${import.meta.env.BASE_URL}assets/textures/${getQuality() === 'low' ? '' : 'hd/'}`;
const loader = new TextureLoader();
interface Entry {
  tex: Texture;
  loaded: boolean;
  /** Repeated copies waiting for the image (they share it). */
  copies: Texture[];
}
const cache = new Map<string, Entry>();

function image(name: string, srgb: boolean): Entry {
  let e = cache.get(name);
  if (!e) {
    const entry: Entry = { tex: null as unknown as Texture, loaded: false, copies: [] };
    entry.tex = loader.load(`${base}${name}.webp`, () => {
      entry.loaded = true;
      for (const c of entry.copies) c.needsUpdate = true;
      entry.copies = [];
    });
    entry.tex.wrapS = entry.tex.wrapT = RepeatWrapping;
    if (srgb) entry.tex.colorSpace = SRGBColorSpace;
    entry.tex.anisotropy = 4;
    cache.set(name, entry);
    e = entry;
  }
  return e;
}

function repeated(e: Entry, rx: number, ry: number): Texture {
  const c = e.tex.clone();
  c.repeat.set(rx, ry);
  if (!e.loaded) {
    // clone() marks the copy for upload; wait until the shared image has arrived.
    c.version = 0;
    e.copies.push(c);
  }
  return c;
}

export interface PbrOptions {
  /** Texture repeats across the surface [u, v]. */
  repeat?: [number, number];
  /** Multiplies the texture colour (e.g. paint colour on plaster). */
  tint?: string;
  roughness?: number;
  metalness?: number;
  normalScale?: number;
}

const materials = new Map<string, MeshStandardMaterial>();

/** A standard material using a scanned texture set (shared for equal options, so parts merge). */
export function pbr(name: TextureName, o: PbrOptions = {}): MeshStandardMaterial {
  const key = `${name}|${JSON.stringify(o)}`;
  const hit = materials.get(key);
  if (hit) return hit;
  const m = makePbr(name, o);
  materials.set(key, m);
  return m;
}

function makePbr(name: TextureName, o: PbrOptions): MeshStandardMaterial {
  const [rx, ry] = o.repeat ?? [1, 1];
  // Low graphics: colour texture only (fewer texture reads per pixel on weak phones).
  const lite = getQuality() === 'low';
  const m = new MeshStandardMaterial({
    map: repeated(image(`${name}_c`, true), rx, ry),
    normalMap: lite ? null : repeated(image(`${name}_n`, false), rx, ry),
    roughnessMap: lite ? null : repeated(image(`${name}_r`, false), rx, ry),
    color: new Color(o.tint ?? '#ffffff'),
    roughness: o.roughness ?? 1,
    metalness: o.metalness ?? 0,
  });
  // Clean look: gentle surface relief by default.
  const relief = o.normalScale ?? (lite ? 0.55 : 0.8);
  m.normalScale = new Vector2(relief, relief);
  return m;
}
