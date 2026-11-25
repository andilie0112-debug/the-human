import {
  AnimationClip,
  CanvasTexture,
  Sprite,
  SpriteMaterial,
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
import type { Outfit } from '../sim/actions';
import { createGarment, faceOpening, HIJAB, PANTS_LONG, PANTS_SHORT, SHIRT_LONG_SLEEVE, SHIRT_SHORT_SLEEVE, SHOES } from './clothing';

// Realistic characters: Quaternius Universal Base Characters + Universal Animation Library (CC0).

export type BodyType = 'male' | 'female';
export type HumanClip =
  | 'Idle_Loop' | 'Idle_Talking_Loop' | 'Walk_Loop' | 'Walk_Formal_Loop' | 'Jog_Fwd_Loop'
  | 'Sitting_Enter' | 'Sitting_Idle_Loop' | 'Sitting_Talking_Loop' | 'Sitting_Exit'
  | 'Interact' | 'PickUp_Table' | 'Dance_Loop' | 'Crouch_Idle_Loop' | 'Fixing_Kneeling' | 'Driving_Loop';

export type Gesture = 'eat' | 'stir' | 'chop' | 'scrub' | 'type' | 'pray';

/** Soft frosted mosaic in the character's skin tone, fading out at the edges. */
function censorTexture(skin: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  const base = new Color(skin);
  const cells = 8;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const dx = (x + 0.5) / cells - 0.5;
      const dy = (y + 0.5) / cells - 0.5;
      const d = Math.hypot(dx, dy);
      const alpha = d < 0.36 ? 1 : Math.max(0, 1 - (d - 0.36) * 7);
      // Mosaic blocks: skin tone mixed with a frosted light tint, clearly reading as a blur.
      const v = 0.75 + Math.random() * 0.5;
      const mix = 0.35;
      const ch = (c: number): number => Math.round(Math.min(255, (c * v * (1 - mix) + 0.92 * mix) * 255));
      g.fillStyle = `rgba(${ch(base.r)},${ch(base.g)},${ch(base.b)},${alpha.toFixed(2)})`;
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = 'srgb';
  return tex;
}

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
    upperarm_r: [0.12 * Math.sin(t * 4), 0.45, 0.55 + 0.1 * Math.cos(t * 4)],
    lowerarm_r: [1.0 + 0.1 * Math.sin(t * 4), 0, 0],
    upperarm_l: [0, 0.45, 0.35],
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
  // Knife going up and down on the cutting board, the other hand holding the vegetables.
  chop: (t) => ({
    upperarm_r: [0, 0.45, 0.55],
    lowerarm_r: [1.0 + 0.28 * Math.abs(Math.sin(t * 7)), 0, 0],
    upperarm_l: [0, 0.45, 0.5],
    lowerarm_l: [1.15, 0, 0],
    Head: [0.35, 0, 0],
  }),
  // Hands on the keyboard with small finger-tapping motion.
  type: (t) => ({
    upperarm_r: [0, 0.45, 0.5],
    lowerarm_r: [1.35 + 0.05 * Math.sin(t * 17), 0, 0],
    upperarm_l: [0, 0.45, 0.5],
    lowerarm_l: [1.35 + 0.05 * Math.sin(t * 13 + 1), 0, 0],
    Head: [0.15, 0, 0],
  }),
  // Hands together in front of the chest, head slightly bowed (a calm, respectful placeholder).
  pray: () => ({
    upperarm_r: [0, 0.45, 0.45],
    lowerarm_r: [1.7, 0, 0],
    upperarm_l: [0, 0.45, 0.45],
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
  sleepTopColor?: string;
  sleepPantsColor?: string;
  hijab?: boolean;
  hijabColor?: string;
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

  private readonly censor: Sprite[] = [];
  private outfit: Outfit = 'daily';
  /** Camera used to place the censor blur in front of the body. */
  censorCamera: Object3D | null = null;

  private constructor(
    root: Group,
    private readonly body: SkinnedMesh,
    private readonly outfits: Record<Exclude<Outfit, 'none'>, SkinnedMesh[]>,
    look: HumanLook,
  ) {
    this.root = root;
    this.mixer = new AnimationMixer(root);
    this.shaped = [body, ...Object.values(outfits).flat()];
    this.setOutfit('daily');
    // Frosted mosaic blur (our own look) used when the character is undressed in the shower.
    const tex = censorTexture(look.skinTone);
    const spots = look.body === 'female' ? ['pelvis', 'spine_03'] : ['pelvis'];
    for (const bone of spots) {
      const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      sprite.userData.bone = bone;
      sprite.visible = false;
      sprite.renderOrder = 10;
      this.censor.push(sprite);
      root.add(sprite);
    }
    this.mixer.addEventListener('finished', (e) => {
      if (e.action !== this.current || !this.onceDone) return;
      const done = this.onceDone;
      this.onceDone = null;
      done();
    });
  }

  /** Hides hands and feet: they are under the blanket in bed and would poke through it. */
  setHandsHidden(hidden: boolean): void {
    for (const name of ['hand_l', 'hand_r', 'foot_l', 'foot_r']) this.bone(name)?.scale.setScalar(hidden ? 0.001 : 1);
  }

  get currentOutfit(): Outfit {
    return this.outfit;
  }

  /** Hair meshes chosen for this character (hidden under a hijab when dressed). */
  private hair: Object3D[] = [];
  private hijab = false;

  setOutfit(outfit: Outfit): void {
    this.outfit = outfit;
    for (const h of this.hair) h.visible = !(this.hijab && outfit === 'daily');
    for (const [name, meshes] of Object.entries(this.outfits)) for (const m of meshes) m.visible = name === outfit;
    for (const s of this.censor) s.visible = outfit === 'none';
  }

  private readonly tmpV = new Vector3();
  private readonly tmpC = new Vector3();
  private updateCensor(): void {
    if (this.outfit !== 'none') return;
    const scale = this.root.scale.x || 1;
    for (const s of this.censor) {
      const bone = this.bone(s.userData.bone as string);
      if (!bone) continue;
      bone.getWorldPosition(this.tmpV);
      if (s.userData.bone === 'pelvis') this.tmpV.y -= 0.06;
      // Pull the blur towards the camera so the body never pokes through it.
      if (this.censorCamera) {
        this.censorCamera.getWorldPosition(this.tmpC);
        this.tmpV.addScaledVector(this.tmpC.sub(this.tmpV).normalize(), 0.22);
      }
      this.root.worldToLocal(this.tmpV);
      s.position.copy(this.tmpV);
      const size = s.userData.bone === 'pelvis' ? 0.46 : 0.4;
      s.scale.set(size / scale, (size * 0.85) / scale, 1);
    }
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
    // Every outfit is built once and switched by visibility.
    const outfits: Record<Exclude<Outfit, 'none'>, SkinnedMesh[]> = {
      daily: [
        createGarment(bodyMesh, { name: 'Pants', bones: look.shorts ? PANTS_SHORT : PANTS_LONG, threshold: 0.2, offset: 0.012, color: look.pantsColor, smooth: 6, keepVolume: true }, morphs),
        createGarment(bodyMesh, { name: 'Shirt', bones: look.longSleeve ? SHIRT_LONG_SLEEVE : SHIRT_SHORT_SLEEVE, threshold: 0.38, offset: 0.024, color: look.shirtColor, smooth: 8 }, morphs),
        createGarment(bodyMesh, { name: 'Shoes', bones: SHOES, threshold: 0.4, offset: 0.012, color: look.shoesColor, roughness: 0.55 }, morphs),
        ...(look.hijab
          ? [createGarment(bodyMesh, { name: 'Hijab', bones: HIJAB, threshold: 0.2, offset: 0.045, color: look.hijabColor ?? '#c46b7a', smooth: 16, roughness: 0.9, opening: faceOpening(bodyMesh) }, morphs)]
          : []),
      ],
      sleep: [
        createGarment(bodyMesh, { name: 'PyjamaPants', bones: PANTS_LONG, threshold: 0.2, offset: 0.014, color: look.sleepPantsColor ?? '#6f8fc0', smooth: 6, keepVolume: true }, morphs),
        createGarment(bodyMesh, { name: 'PyjamaTop', bones: SHIRT_LONG_SLEEVE, threshold: 0.5, offset: 0.026, color: look.sleepTopColor ?? '#b8d4ee', smooth: 8 }, morphs),
      ],
      towel: [
        createGarment(bodyMesh, { name: 'Towel', bones: PANTS_SHORT, threshold: 0.3, offset: 0.03, color: '#f4f1ea', smooth: 10, roughness: 0.95 }, morphs),
      ],
    };

    const model = new HumanModel(root, bodyMesh, outfits, look);
    model.hijab = look.hijab === true;
    root.traverse((o) => {
      if (o.name.startsWith('Hair_') && o.visible && o.name !== 'Hair_Beard') model.hair.push(o);
    });
    model.setOutfit('daily');
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
    this.updateCensor();
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
