import {
  AnimationClip,
  type Object3D,
  LoopOnce,
  LoopRepeat,
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
import { applyMorphs, computeBodyMorphs, MORPH_FAT, MORPH_LEAN } from './bodyShape';
import { createGarment, PANTS_LONG, PANTS_SHORT, SHIRT_LONG_SLEEVE, SHIRT_SHORT_SLEEVE, SHOES } from './clothing';

// Realistic characters: Quaternius Universal Base Characters + Universal Animation Library (CC0).

export type BodyType = 'male' | 'female';
export type HumanClip =
  | 'Idle_Loop' | 'Idle_Talking_Loop' | 'Walk_Loop' | 'Walk_Formal_Loop' | 'Jog_Fwd_Loop'
  | 'Sitting_Enter' | 'Sitting_Idle_Loop' | 'Sitting_Talking_Loop' | 'Sitting_Exit'
  | 'Interact' | 'PickUp_Table' | 'Dance_Loop' | 'Crouch_Idle_Loop' | 'Fixing_Kneeling';

export type Gesture = 'eat' | 'stir' | 'scrub' | 'type' | 'pray';

type Pose = Record<string, [number, number, number]>;
const smooth = (t: number): number => 0.5 - 0.5 * Math.cos(t);

/** Gesture poses over time (seconds). */
const GESTURES: Record<Gesture, (t: number) => Pose> = {
  // Spoon from plate to mouth about every 3 seconds.
  eat: (t) => {
    const k = smooth(Math.max(0, Math.sin((t * Math.PI * 2) / 3)) * Math.PI);
    return { upperarm_r: [0, 0, 0.6 + 0.3 * k], lowerarm_r: [1.1 + 1.1 * k, 0, 0], Head: [0.12 * (1 - k), 0, 0] };
  },
  // Stirring the pan in small circles.
  stir: (t) => ({
    upperarm_r: [0.12 * Math.sin(t * 4), 0, 0.55 + 0.1 * Math.cos(t * 4)],
    lowerarm_r: [1.0 + 0.1 * Math.sin(t * 4), 0, 0],
    upperarm_l: [0, 0, 0.35],
    lowerarm_l: [0.9, 0, 0],
    Head: [0.3, 0, 0],
  }),
  // Rubbing hair and shoulders under the shower.
  scrub: (t) => ({
    upperarm_r: [0.1 * Math.sin(t * 6), 0, 1.0 + 0.08 * Math.sin(t * 6)],
    lowerarm_r: [2.5, 0, 0],
    upperarm_l: [0, 0, 0.45],
    lowerarm_l: [1.8 + 0.2 * Math.sin(t * 5), 0, 0],
    Head: [0.2, 0, 0],
  }),
  // Hands on the keyboard with small finger-tapping motion.
  type: (t) => ({
    upperarm_r: [0, 0, 0.5],
    lowerarm_r: [1.35 + 0.05 * Math.sin(t * 17), 0, 0],
    upperarm_l: [0, 0, 0.5],
    lowerarm_l: [1.35 + 0.05 * Math.sin(t * 13 + 1), 0, 0],
    Head: [0.15, 0, 0],
  }),
  // Hands together in front of the chest, head slightly bowed (a calm, respectful placeholder).
  pray: () => ({
    upperarm_r: [0, 0, 0.45],
    lowerarm_r: [1.7, 0, 0],
    upperarm_l: [0, 0, 0.45],
    lowerarm_l: [1.7, 0, 0],
    Head: [0.25, 0, 0],
  }),
};

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
  /** 0 = average untrained body, 1 = very athletic. Changes with exercise later. */
  muscle?: number;
  /** 0 = thin, 1 = heavy. Changes with diet later. */
  fat?: number;
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
  private readonly shaped: SkinnedMesh[];

  private constructor(root: Group, private readonly body: SkinnedMesh, garments: SkinnedMesh[]) {
    this.root = root;
    this.mixer = new AnimationMixer(root);
    this.shaped = [body, ...garments];
    this.mixer.addEventListener('finished', (e) => {
      if (e.action !== this.current || !this.onceDone) return;
      const done = this.onceDone;
      this.onceDone = null;
      done();
    });
  }

  /** muscle and fat in 0..1. Lower muscle also softens the muscle detail in the skin's normal map. */
  setBodyShape(muscle: number, fat: number): void {
    const m = Math.min(1, Math.max(0, muscle));
    const f = Math.min(1, Math.max(0, fat));
    for (const mesh of this.shaped) {
      const inf = mesh.morphTargetInfluences;
      if (!inf) continue;
      inf[MORPH_LEAN] = 1 - m;
      inf[MORPH_FAT] = f;
    }
    const mat = this.body.material as MeshStandardMaterial;
    mat.normalScale.setScalar(0.2 + 0.8 * m);
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
    const morphs = computeBodyMorphs(bodyMesh);
    applyMorphs(bodyMesh, morphs);
    const garments = [
      createGarment(bodyMesh, { name: 'Pants', bones: look.shorts ? PANTS_SHORT : PANTS_LONG, threshold: 0.2, offset: 0.012, color: look.pantsColor, smooth: 6, keepVolume: true }, morphs),
      createGarment(bodyMesh, { name: 'Shirt', bones: look.longSleeve ? SHIRT_LONG_SLEEVE : SHIRT_SHORT_SLEEVE, threshold: 0.5, offset: 0.024, color: look.shirtColor, smooth: 8 }, morphs),
      createGarment(bodyMesh, { name: 'Shoes', bones: SHOES, threshold: 0.4, offset: 0.012, color: look.shoesColor, roughness: 0.55 }, morphs),
    ];

    const model = new HumanModel(root, bodyMesh, garments);
    model.setBodyShape(look.muscle ?? 0.1, look.fat ?? 0.3);
    for (const [name, clip] of clips) model.actions.set(name, model.mixer.clipAction(clip));
    model.play('Idle_Loop', 0);
    return model;
  }

  private onceDone: (() => void) | null = null;

  /** Cross-fades to a looping clip. `timeScale` slows or speeds the clip (e.g. calm breathing). */
  play(name: HumanClip, fade = 0.35, timeScale = 1): void {
    const next = this.actions.get(name);
    if (!next) return;
    next.timeScale = timeScale;
    if (next === this.current) return;
    this.onceDone = null;
    next.reset().setLoop(LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = next;
  }

  /** Plays a clip once, holds its last frame and calls `onDone` when it ends. */
  playOnce(name: HumanClip, onDone: () => void, fade = 0.25): void {
    const next = this.actions.get(name);
    if (!next) {
      onDone();
      return;
    }
    next.timeScale = 1;
    next.reset().setLoop(LoopOnce, 1).setEffectiveWeight(1).fadeIn(fade).play();
    next.clampWhenFinished = true;
    if (this.current !== next) this.current?.fadeOut(fade);
    this.current = next;
    this.onceDone = onDone;
  }

  update(dt: number): void {
    this.mixer.update(dt);
    this.applyGesture(dt);
  }

  // --- Procedural arm gestures ------------------------------------------------------------
  // Small hand movements layered on top of the clip (eating, stirring, scrubbing, typing), so
  // activities read clearly without extra animation files. Angles are bone-local radians,
  // measured on the Universal Base Characters skeleton: lowerarm X bends the elbow, upperarm Z
  // swings the arm forward.

  private gesture: Gesture | null = null;
  private gestureWeight = 0;
  private gestureTime = 0;
  private gestureBones: Record<string, Object3D | undefined> | null = null;
  /** Debug: fixed extra rotations per bone (used to calibrate gestures). */
  debugPose: Record<string, [number, number, number]> | null = null;

  setGesture(g: Gesture | null): void {
    if (g) this.gesture = g;
    this.gestureTarget = g ? 1 : 0;
  }
  private gestureTarget = 0;

  private bone(name: string): Object3D | undefined {
    this.gestureBones ??= {};
    if (!(name in this.gestureBones)) this.gestureBones[name] = this.root.getObjectByName(name);
    return this.gestureBones[name];
  }

  private applyGesture(dt: number): void {
    this.gestureTime += dt;
    this.gestureWeight += (this.gestureTarget - this.gestureWeight) * Math.min(1, dt * 4);
    if (this.gestureWeight < 0.01) {
      if (this.gestureTarget === 0) this.gesture = null;
    } else if (this.gesture) {
      const pose = GESTURES[this.gesture](this.gestureTime);
      for (const [name, [x, y, z]] of Object.entries(pose)) {
        const b = this.bone(name);
        if (!b) continue;
        const w = this.gestureWeight;
        b.rotateX(x * w);
        b.rotateY(y * w);
        b.rotateZ(z * w);
      }
    }
    if (this.debugPose) {
      for (const [name, [x, y, z]] of Object.entries(this.debugPose)) {
        const b = this.bone(name);
        b?.rotateX(x);
        b?.rotateY(y);
        b?.rotateZ(z);
      }
    }
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
