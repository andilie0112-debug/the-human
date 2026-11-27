import { Color, EquirectangularReflectionMapping, PMREMGenerator, SRGBColorSpace, TextureLoader, type Fog, type Scene, type Texture, type WebGLRenderer } from 'three';
import { getQuality } from '../engine/graphics';

// The sky outside: photographed skies (Poly Haven, CC0; see scripts/build-skies.mjs) for the day,
// the golden hour around sunrise and sunset, rainy weather and the night over the city. The
// same picture lights the street (reflections in windows, cars and puddles), and the haze in the
// distance takes the colour of its horizon. High graphics loads the sharper panoramas.

export type SkyName = 'day' | 'golden' | 'overcast' | 'night';

/** Horizon colour of each sky (measured from the pictures) for the distant haze. */
const HORIZON: Record<SkyName, string> = { day: '#a9b4c4', golden: '#c49470', overcast: '#868b94', night: '#2a2438' };
/** How strongly each sky lights the street. */
const ENV: Record<SkyName, number> = { day: 0.55, golden: 0.5, overcast: 0.45, night: 0.25 };
/** How bright the sky itself shows. */
const BG: Record<SkyName, number> = { day: 1, golden: 1, overcast: 0.95, night: 1 };

/**
 * The direction the evening sun sets towards (where the sun is in the golden-hour picture), on
 * the ground plane. The morning sun rises opposite (the picture turned around).
 */
export const WEST = { x: 0.67, z: 0.74 };

/** Which sky fits the hour (0..24) and the weather (gloom 0 clear .. 1 downpour). */
export function skyFor(hour: number, gloom: number): SkyName {
  if (hour < 5.3 || hour >= 18.4) return 'night';
  if (gloom > 0.35) return 'overcast';
  if (hour < 7 || hour >= 16.6) return 'golden';
  return 'day';
}

export class SkyDome {
  private readonly loader = new TextureLoader();
  private readonly textures = new Map<SkyName, Texture>();
  private readonly envs = new Map<SkyName, Texture>();
  private current: SkyName | null = null;
  private morning = false;
  private pmrem: PMREMGenerator | null = null;

  constructor(private readonly renderer: WebGLRenderer, private readonly scene: Scene) {}

  private load(name: SkyName, done: (t: Texture) => void): void {
    const have = this.textures.get(name);
    if (have) return done(have);
    const hd = getQuality() === 'high' ? '_hd' : '';
    this.loader.load(`${import.meta.env.BASE_URL}assets/skies/${name}${hd}.webp`, (t) => {
      t.mapping = EquirectangularReflectionMapping;
      t.colorSpace = SRGBColorSpace;
      this.textures.set(name, t);
      done(t);
    });
  }

  /** Shows the sky for this hour and weather (cheap to call every frame). */
  update(hour: number, gloom: number): void {
    const name = skyFor(hour, gloom);
    const morning = hour < 12;
    if (name === this.current && morning === this.morning) return;
    this.current = name;
    this.morning = morning;
    this.load(name, (tex) => {
      if (this.current !== name) return;
      let env = this.envs.get(name);
      if (!env) {
        this.pmrem ??= new PMREMGenerator(this.renderer);
        env = this.pmrem.fromEquirectangular(tex).texture;
        this.envs.set(name, env);
      }
      const s = this.scene;
      s.background = tex;
      s.environment = env;
      s.backgroundIntensity = BG[name];
      s.environmentIntensity = ENV[name] * (1 - gloom * 0.3);
      // In the morning the sun is on the other side: turn the picture around.
      const turn = name === 'golden' && this.morning ? Math.PI : 0;
      s.backgroundRotation.set(0, turn, 0);
      s.environmentRotation.set(0, turn, 0);
      (s.fog as Fog | null)?.color.copy(new Color(HORIZON[name]));
    });
  }

  dispose(): void {
    for (const t of this.textures.values()) t.dispose();
    for (const t of this.envs.values()) t.dispose();
    this.textures.clear();
    this.envs.clear();
    this.pmrem?.dispose();
    this.pmrem = null;
  }
}
