import {
  AnimationClip,
  AnimationMixer,
  Box3,
  Color,
  Mesh,
  MeshStandardMaterial,
  SkinnedMesh,
  Vector3,
  type AnimationAction,
  type Group,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createGarment, PANTS_LONG, PANTS_SHORT, SHIRT_LONG_SLEEVE, SHIRT_SHORT_SLEEVE, SHOES } from './clothing';

// Realistic characters: Quaternius Universal Base Characters + Universal Animation Library (CC0).

export type BodyType = 'male' | 'female';
export type HumanClip =
  | 'Idle_Loop' | 'Idle_Talking_Loop' | 'Walk_Loop' | 'Walk_Formal_Loop' | 'Jog_Fwd_Loop'
  | 'Sitting_Enter' | 'Sitting_Idle_Loop' | 'Sitting_Talking_Loop' | 'Sitting_Exit'
  | 'Interact' | 'PickUp_Table' | 'Dance_Loop';

export const HAIRSTYLES: Record<BodyType, readonly string[]> = {
  male: ['Hair_SimpleParted', 'Hair_Buzzed'],
  female: ['Hair_Long', 'Hair_Buns', 'Hair_BuzzedFemale', 'Hair_SimpleParted'],
};

/** Target average skin colours (sRGB), from kuning langsat to deep brown. */
export const HUMAN_SKIN_TONES = ['#ecc8aa', '#deb08c', '#be8c69', '#96694b', '#6e4b37'] as const;

/** Average colour of each body's skin texture (sRGB), measured from the source PNGs. */
const TEXTURE_AVERAGE: Record<BodyType, string> = { male: '#a67858', female: '#a97956' };

/** Per-channel multiplier that shifts the texture's average colour to the target tone.
 *  Components may exceed 1, which brightens the texture while keeping its detail. */
export function skinTint(body: BodyType, tone: string): Color {
  const target = new Color(tone);
  const avg = new Color(TEXTURE_AVERAGE[body]);
  return new Color(target.r / avg.r, target.g / avg.g, target.b / avg.b);
}

export interface HumanLook {
  body: BodyType;
  skinTone: string;
  hair: string;
  hairColor: string;
  beard?: boolean;
  shirtColor: string;
  longSleeve?: boolean;
  pantsColor: string;
  shorts?: boolean;
  shoesColor: string;
}

const HEIGHT: Record<BodyType, number> = { male: 1.7, female: 1.6 };

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const base = import.meta.env.BASE_URL;
let clipsPromise: Promise<Map<string, AnimationClip>> | null = null;

/** Loads the shared animation library once. Bone translations are dropped (except the hips)
 *  so clips authored on the mannequin keep each character's own proportions. */
function loadClips(): Promise<Map<string, AnimationClip>> {
  clipsPromise ??= loader.loadAsync(`${base}assets/characters/ubc_anims.glb`).then((gltf) => {
    const map = new Map<string, AnimationClip>();
    for (const clip of gltf.animations) {
      clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name.startsWith('pelvis.')));
      map.set(clip.name, clip);
    }
    return map;
  });
  return clipsPromise;
}

export class HumanModel {
  readonly root: Group;
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private current: AnimationAction | null = null;

  private constructor(root: Group) {
    this.root = root;
    this.mixer = new AnimationMixer(root);
  }

  static async load(look: HumanLook): Promise<HumanModel> {
    const [gltf, clips] = await Promise.all([
      loader.loadAsync(`${base}assets/characters/ubc_${look.body}.glb`),
      loadClips(),
    ]);
    const root = gltf.scene;
    let body: SkinnedMesh | null = null;

    root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned bounds do not follow animation
      const name = o.name;
      const mat = o.material as Material;
      if (name.startsWith('Hair_')) {
        const visible = name === look.hair || (name === 'Hair_Beard' && look.beard === true);
        o.visible = visible;
        if (mat instanceof MeshStandardMaterial) mat.color.set(look.hairColor);
      } else if (o instanceof SkinnedMesh && mat instanceof MeshStandardMaterial && mat.name.startsWith('MI_Superhero')) {
        body = o;
        mat.color.copy(skinTint(look.body, look.skinTone));
      } else if (mat instanceof MeshStandardMaterial && mat.name.startsWith('MI_Hair')) {
        mat.color.set(look.hairColor); // eyebrows
      }
    });
    if (!body) throw new Error('UBC body mesh not found');

    const height = new Box3().setFromObject(root).getSize(new Vector3()).y;
    if (height > 0) root.scale.setScalar(HEIGHT[look.body] / height);
    root.updateMatrixWorld(true);

    const bodyMesh: SkinnedMesh = body;
    createGarment(bodyMesh, { name: 'Pants', bones: look.shorts ? PANTS_SHORT : PANTS_LONG, threshold: 0.3, offset: 0.01, color: look.pantsColor });
    createGarment(bodyMesh, { name: 'Shirt', bones: look.longSleeve ? SHIRT_LONG_SLEEVE : SHIRT_SHORT_SLEEVE, threshold: 0.5, offset: 0.018, color: look.shirtColor });
    createGarment(bodyMesh, { name: 'Shoes', bones: SHOES, threshold: 0.4, offset: 0.012, color: look.shoesColor, roughness: 0.55 });

    const model = new HumanModel(root);
    for (const [name, clip] of clips) model.actions.set(name, model.mixer.clipAction(clip));
    model.play('Idle_Loop', 0);
    return model;
  }

  /** Cross-fades to a looping clip. */
  play(name: HumanClip, fade = 0.35): void {
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = next;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        const mats: Material[] = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          for (const v of Object.values(m)) if (v && typeof v === 'object' && 'isTexture' in v) (v as { dispose: () => void }).dispose();
          m.dispose();
        });
      }
    });
    this.root.removeFromParent();
  }
}
