import {
  AnimationMixer,
  Box3,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type AnimationAction,
  type Group,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** Character models shipped in public/assets/characters (CC0, Quaternius). */
export const CHARACTER_MODELS = [
  'Casual_Male',
  'Casual_Female',
  'Casual2_Male',
  'Casual2_Female',
  'Casual3_Male',
  'Casual3_Female',
] as const;
export type CharacterModelId = (typeof CHARACTER_MODELS)[number];

/** Colours applied to the model's named materials (Skin, Hair, Shirt, Pants, Belt). */
export interface CharacterLook {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  belt: string;
}

/** Skin tones common across Indonesia, light to deep. */
export const SKIN_TONES = ['#f1c9a5', '#e0ac7e', '#c98e62', '#a8714a', '#7d5236'] as const;

export type ClipName = 'Idle' | 'Walk' | 'Run' | 'SitDown' | 'StandUp' | 'PickUp' | 'Victory';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** Target standing height in metres; models are rescaled to it. */
const TARGET_HEIGHT = 1.65;

export class CharacterModel {
  readonly root: Group;
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private current: AnimationAction | null = null;

  private constructor(root: Group, mixer: AnimationMixer) {
    this.root = root;
    this.mixer = mixer;
  }

  static async load(id: CharacterModelId, look: CharacterLook): Promise<CharacterModel> {
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/characters/${id}.glb`);
    const root = gltf.scene;
    root.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false; // skinned bounds do not follow animation
        const m = o.material as Material;
        if (m instanceof MeshStandardMaterial) {
          m.roughness = 0.75;
          const key = m.name.toLowerCase() as keyof CharacterLook;
          if (key in look) m.color.set(look[key]);
        }
      }
    });
    const height = new Box3().setFromObject(root).getSize(new Vector3()).y;
    if (height > 0) root.scale.setScalar(TARGET_HEIGHT / height);

    const model = new CharacterModel(root, new AnimationMixer(root));
    for (const clip of gltf.animations) model.actions.set(clip.name, model.mixer.clipAction(clip));
    model.play('Idle', 0);
    return model;
  }

  /** Cross-fades to a looping clip. */
  play(name: ClipName, fade = 0.3): void {
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
        mats.forEach((m) => m.dispose());
      }
    });
    this.root.removeFromParent();
  }
}
