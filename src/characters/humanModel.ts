import {
  AnimationClip,
  Euler,
  Quaternion,
  type Bone,
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
  Sphere,
  Vector3,
  type AnimationAction,
  type Group,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { routineLength, sample, type BonePose, type Routine } from './routines';
import type { BottomStyle, GlassesStyle, ShoeStyle, TopStyle } from '../sim/characterSetup';
import { fabric } from './patterns';
import { addAccessories, attachHandProp, type HandProp } from './accessories';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Face, type Expression } from './face';
import { applyMorphs, computeBodyMorphs, MORPH_FAT, MORPH_LEAN } from './bodyShape';
import type { Outfit } from '../sim/actions';
import { band, boundsOf, COLLAR, createGarment, createSkirt, faceOpening, HIJAB, PANTS_LONG, PANTS_SHORT, SHIRT_LONG_SLEEVE, SHIRT_SHORT_SLEEVE, SHOES } from './clothing';

// Realistic characters: Quaternius Universal Base Characters + Universal Animation Library (CC0).

export type BodyType = 'male' | 'female';
export type HumanClip =
  | 'Idle_Loop' | 'Idle_Talking_Loop' | 'Walk_Loop' | 'Walk_Formal_Loop' | 'Jog_Fwd_Loop'
  | 'Sitting_Enter' | 'Sitting_Idle_Loop' | 'Sitting_Talking_Loop' | 'Sitting_Exit'
  | 'Interact' | 'PickUp_Table' | 'Dance_Loop' | 'Crouch_Idle_Loop' | 'Fixing_Kneeling' | 'Driving_Loop' | 'Push_Loop'
  // Second library (ubc_anims2.glb)
  | 'Chest_Open' | 'Consume' | 'Idle_TalkingPhone_Loop' | 'Idle_FoldArms_Loop' | 'Idle_Rail_Loop' | 'Idle_Rail_Call'
  | 'Idle_No_Loop' | 'Yes' | 'Walk_Carry_Loop' | 'LayToIdle' | 'Farm_Watering' | 'Farm_PlantSeed' | 'Farm_Harvest';

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
/** Bones a routine rotates on top of the clip instead of from the rest (T) pose. */
const ADDITIVE_BONE = /^(clavicle|upperarm|lowerarm|hand)_/;
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
  topStyle?: TopStyle;
  bottomStyle?: BottomStyle;
  shoeStyle?: ShoeStyle;
  glasses?: GlassesStyle;
  peci?: boolean;
  /** -1 .. 1 around the average height (about ±6 %). */
  height?: number;
  /** 0 = average untrained body, 1 = very athletic. Changes with exercise later. */
  muscle?: number;
  /** 0 = thin, 1 = heavy. Changes with diet later. */
  fat?: number;
}

const HEIGHT: Record<BodyType, number> = { male: 1.7, female: 1.6 };

/** Everyday clothes for a look: top, bottom, shoes and hijab, in the chosen styles and patterns. */
function dailyOutfit(body: SkinnedMesh, look: HumanLook, morphs: Float32Array[]): SkinnedMesh[] {
  const top = look.topStyle ?? 'kaos';
  const bottom = look.bottomStyle ?? (look.shorts ? 'pendek' : 'chino');
  const shoe = look.shoeStyle ?? 'sneakers';
  const out: SkinnedMesh[] = [];
  // Bottom.
  if (bottom === 'rok' || bottom === 'rokPanjang' || bottom === 'sarung') {
    const legs = boundsOf(body, ['calf_l', 'calf_r'], 0.5);
    const hemY = bottom === 'rok' ? legs.maxY - 0.04 : legs.minY + 0.08;
    out.push(createSkirt(body, hemY, look.pantsColor, bottom === 'sarung' ? fabric('sarung', look.pantsColor) : null, morphs));
    // Shorts underneath keep the hips covered when sitting.
    out.push(createGarment(body, { name: 'Under', bones: PANTS_SHORT, threshold: 0.45, offset: 0.004, color: look.pantsColor, smooth: 6, keepVolume: true }, morphs));
  } else {
    out.push(createGarment(body, { name: 'Pants', bones: bottom === 'pendek' ? PANTS_SHORT : PANTS_LONG, threshold: 0.2, offset: 0.012, color: look.pantsColor, smooth: 6, keepVolume: true, map: bottom === 'jeans' ? fabric('denim', look.pantsColor) : null, uvRepeat: [6, 5] }, morphs));
  }
  // Top.
  const longSleeve = top === 'jaket' || look.longSleeve === true;
  const pattern = top === 'kemeja' ? 'plaid' : top === 'batik' ? 'batik' : top === 'polo' ? 'placket' : top === 'jaket' ? 'zip' : 'plain';
  const repeat: [number, number] = pattern === 'placket' || pattern === 'zip' ? [1, 3] : [4, 4];
  out.push(createGarment(body, { name: 'Shirt', bones: longSleeve ? SHIRT_LONG_SLEEVE : SHIRT_SHORT_SLEEVE, threshold: 0.38, offset: top === 'jaket' ? 0.036 : 0.024, color: look.shirtColor, smooth: 8, roughness: top === 'jaket' ? 0.6 : 0.85, map: fabric(pattern, look.shirtColor), uvRepeat: repeat }, morphs));
  if (top === 'kemeja' || top === 'batik' || top === 'polo') {
    const neck = boundsOf(body, ['neck_01'], 0.5);
    const collarColor = top === 'batik' ? '#3a2416' : look.shirtColor;
    out.push(createGarment(body, { name: 'Collar', bones: COLLAR, threshold: 0.3, offset: 0.034, color: collarColor, smooth: 6, roughness: 0.8, opening: band(neck.minY - 0.005, neck.minY + 0.045) }, morphs));
  }
  // Shoes.
  const feet = boundsOf(body, SHOES, 0.4);
  if (shoe === 'sandal') {
    out.push(createGarment(body, { name: 'SandalSole', bones: SHOES, threshold: 0.3, offset: 0.008, color: '#5a3a24', roughness: 0.8, opening: band(feet.minY - 0.05, feet.minY + 0.018) }, morphs));
    out.push(createGarment(body, { name: 'SandalStrap', bones: SHOES, threshold: 0.3, offset: 0.01, color: look.shoesColor, roughness: 0.6, opening: band(feet.minY + 0.03, feet.minY + 0.05, (_x, _y, z) => (z < feet.maxZ - 0.1 ? 1 : 0)) }, morphs));
  } else {
    out.push(createGarment(body, { name: 'Shoes', bones: SHOES, threshold: 0.4, offset: shoe === 'pantofel' ? 0.014 : 0.012, color: shoe === 'pantofel' ? '#1c1a18' : look.shoesColor, roughness: shoe === 'pantofel' ? 0.2 : 0.55 }, morphs));
  }
  if (look.hijab) out.push(createGarment(body, { name: 'Hijab', bones: HIJAB, threshold: 0.2, offset: 0.045, color: look.hijabColor ?? '#c46b7a', smooth: 16, roughness: 0.9, opening: faceOpening(body) }, morphs));
  return out;
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const base = import.meta.env.BASE_URL;
let clipsPromise: Promise<Map<string, AnimationClip>> | null = null;

/** Loads the shared animation library once. Bone translations are dropped (except the hips)
 *  so clips authored on the mannequin keep each character's own proportions. */
function loadClips(): Promise<Map<string, AnimationClip>> {
  const file = (name: string): Promise<AnimationClip[]> => loader.loadAsync(`${base}assets/characters/${name}`).then((gltf) => gltf.animations);
  clipsPromise ??= Promise.all([file('ubc_anims.glb'), file('ubc_anims2.glb')]).then((sets) => {
    const map = new Map<string, AnimationClip>();
    for (const clip of sets.flat()) {
      clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name.startsWith('pelvis.')));
      map.set(clip.name, clip);
    }
    return map;
  });
  return clipsPromise;
}

export class HumanModel {
  /** Every character alive now (for drawing only the ones near the camera). */
  static readonly all = new Set<HumanModel>();
  readonly root: Group;
  private far = false;
  /** Blinking, eyelids and eyebrows. */
  face: Face | null = null;
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private current: AnimationAction | null = null;
  private readonly shaped: SkinnedMesh[];

  private readonly censor: Sprite[] = [];
  private outfit: Outfit = 'daily';
  /** Camera used to place the censor blur in front of the body. */
  censorCamera: Object3D | null = null;

  /** Body type (for naming people you meet). */
  readonly gender: BodyType;

  private constructor(
    root: Group,
    private readonly body: SkinnedMesh,
    private readonly outfits: Record<Exclude<Outfit, 'none'>, SkinnedMesh[]>,
    look: HumanLook,
  ) {
    this.root = root;
    this.gender = look.body;
    HumanModel.all.add(this);
    // Rest (bind) pose of every bone, before any clip plays: routines are posed relative to it.
    root.traverse((o) => {
      if ((o as Bone).isBone) this.rest.set(o.name, o.quaternion.clone());
    });
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
  private handProp: { kind: HandProp; group: Group } | null = null;

  /** Puts a tool in the right hand (broom, mop, cloth, knife, clothes) or empties it. */
  holdProp(kind: HandProp | null): void {
    if (this.handProp?.kind === kind) return;
    if (this.handProp) {
      this.handProp.group.removeFromParent();
      this.handProp.group.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
      this.handProp = null;
    }
    if (!kind) return;
    const group = attachHandProp(this.shaped[0], kind);
    if (group) this.handProp = { kind, group };
  }

  private readonly propQ = new Quaternion();
  private readonly propE = new Euler();

  /** Long tools point from the hand down to the floor in front, whatever the hand does. */
  private orientHandProp(): void {
    const h = this.handProp;
    const bone = h?.group.parent;
    if (!h || !bone) return;
    bone.updateWorldMatrix(true, false);
    bone.getWorldQuaternion(this.propQ).invert();
    const long = h.kind === 'sapu' || h.kind === 'pel';
    this.propE.set(long ? 0.55 : 0, this.root.rotation.y, 0, 'YXZ');
    h.group.quaternion.setFromEuler(this.propE).premultiply(this.propQ);
  }

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

  /** Turns shadow casting on or off for all of this person's meshes (NPCs on Low/Medium). */
  setCastShadow(on: boolean): void {
    this.root.traverse((o) => {
      if (o instanceof Mesh) o.castShadow = on;
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
    if (height > 0) root.scale.setScalar((HEIGHT[look.body] * (1 + 0.06 * (look.height ?? 0))) / height);
    root.updateMatrixWorld(true);

    const bodyMesh: SkinnedMesh = body;
    const morphs = computeBodyMorphs(bodyMesh);
    applyMorphs(bodyMesh, morphs);
    // Every outfit is built once and switched by visibility.
    const outfits: Record<Exclude<Outfit, 'none'>, SkinnedMesh[]> = {
      daily: dailyOutfit(bodyMesh, look, morphs),
      sleep: [
        createGarment(bodyMesh, { name: 'PyjamaPants', bones: PANTS_LONG, threshold: 0.2, offset: 0.014, color: look.sleepPantsColor ?? '#6f8fc0', smooth: 6, keepVolume: true }, morphs),
        createGarment(bodyMesh, { name: 'PyjamaTop', bones: SHIRT_LONG_SLEEVE, threshold: 0.5, offset: 0.026, color: look.sleepTopColor ?? '#b8d4ee', smooth: 8 }, morphs),
      ],
      towel: [
        createGarment(bodyMesh, { name: 'Towel', bones: PANTS_SHORT, threshold: 0.3, offset: 0.03, color: '#f4f1ea', smooth: 10, roughness: 0.95 }, morphs),
      ],
    };

    const model = new HumanModel(root, bodyMesh, outfits, look);
    addAccessories(bodyMesh, look, outfits.daily);
    model.hijab = look.hijab === true;
    root.traverse((o) => {
      if (o.name.startsWith('Hair_') && o.visible && o.name !== 'Hair_Beard') model.hair.push(o);
    });
    model.setOutfit('daily');
    model.setBodyShape(look.muscle ?? 0.1, look.fat ?? 0.3);
    model.cullOffscreen();
    model.face = new Face(root, bodyMesh.material as MeshStandardMaterial);
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
    if (!this.far) this.face?.update(dt);
    this.applyGesture(dt);
    this.applyRoutine(dt);
    this.applyLife(dt);
    this.orientHandProp();
    this.updateCensor();
  }

  // --- Life-like idling: small fidgets, looking around and at people -------------------------

  private idleTime = 0;
  private nextFidget = 5 + Math.random() * 6;
  private fidgetLeft = 0;
  private glanceYaw = 0;
  private glanceLeft = 0;
  private headYaw = 0;
  private hasLook = false;
  private readonly lookPoint = new Vector3();
  private readonly lifeQ = new Quaternion();
  private readonly lifeQ2 = new Quaternion();
  private readonly lifeQ3 = new Quaternion();
  private static readonly UP = new Vector3(0, 1, 0);

  /** Turns the head toward a point in the world (a person nearby); call `clearLook` to stop. */
  lookAt(x: number, y: number, z: number): void {
    this.lookPoint.set(x, y, z);
    this.hasLook = true;
  }

  clearLook(): void {
    this.hasLook = false;
  }

  private applyLife(dt: number): void {
    const idle = this.actions.get('Idle_Loop');
    const fold = this.actions.get('Idle_FoldArms_Loop');
    const upright = this.root.rotation.x === 0 && this.root.rotation.z === 0;
    const calm = !!idle && this.current === idle && idle.timeScale === 1 && this.gestureWeight < 0.01 && !this.routine && upright;
    if (this.fidgetLeft > 0) {
      this.fidgetLeft -= dt;
      if (this.fidgetLeft <= 0 && this.current === fold) this.play('Idle_Loop', 0.7);
    } else if (calm) {
      // Standing still for a while: fold the arms for a bit, or glance to one side.
      this.idleTime += dt;
      if (this.idleTime > this.nextFidget) {
        this.idleTime = 0;
        this.nextFidget = 7 + Math.random() * 9;
        if (fold && Math.random() < 0.4) {
          this.play('Idle_FoldArms_Loop', 0.7);
          this.fidgetLeft = 4 + Math.random() * 4;
        } else {
          this.glanceYaw = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
          this.glanceLeft = 1.5 + Math.random() * 1.5;
        }
      }
    } else {
      this.idleTime = 0;
    }
    if (this.glanceLeft > 0) this.glanceLeft -= dt;

    // Head and neck turn toward the look target (or the glance), within a natural range.
    let want = 0;
    if (!upright) want = 0;
    else if (this.hasLook) {
      const p = this.root.position;
      const toTarget = Math.atan2(this.lookPoint.x - p.x, this.lookPoint.z - p.z);
      let d = toTarget - this.root.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      want = Math.abs(d) < 1.9 ? Math.max(-1.1, Math.min(1.1, d)) : 0;
    } else if (this.glanceLeft > 0) want = this.glanceYaw;
    this.headYaw += (want - this.headYaw) * Math.min(1, dt * 3.5);
    if (Math.abs(this.headYaw) < 0.005) return;
    const neck = this.bone('neck_01');
    const head = this.bone('Head');
    if (!neck?.parent || !head?.parent) return;
    this.root.updateMatrixWorld(true);
    for (const [b, share] of [[neck, 0.45], [head, 0.55]] as const) {
      // Rotate about the world's vertical axis: local' = P^-1 * Ry * P * local.
      b.parent!.getWorldQuaternion(this.lifeQ);
      this.lifeQ2.setFromAxisAngle(HumanModel.UP, this.headYaw * share);
      this.lifeQ3.copy(this.lifeQ).invert();
      this.lifeQ2.premultiply(this.lifeQ3).multiply(this.lifeQ);
      b.quaternion.premultiply(this.lifeQ2);
    }
  }

  // --- Full-body routines (worship) ---------------------------------------------------------

  private readonly rest = new Map<string, Quaternion>();
  private routine: Routine | null = null;
  private routineTime = 0;
  private routinePrev = -1;
  private routineWeight = 0;
  private routineTarget = 0;
  /** Called when a routine reaches a keyframe with a sound cue. */
  onCue: ((cue: string) => void) | null = null;
  /** Debug: absolute pose (relative to rest) with a hip drop, for calibration. */
  debugAbs: { pose: BonePose; drop?: number } | null = null;
  private readonly tq = new Quaternion();
  private readonly tq2 = new Quaternion();
  private readonly te = new Euler();
  private readonly tv = new Vector3();
  private readonly ts = new Vector3();

  /** Drives the routine from an action's progress (0..1) instead of real time. */
  setRoutineProgress(fraction: number): void {
    if (!this.routine) return;
    this.routineFixed = Math.min(0.9999, Math.max(0, fraction)) * routineLength(this.routine);
  }
  private routineFixed: number | null = null;

  /** Starts a keyframed routine (from its beginning) or eases out of it (null). */
  setRoutine(r: Routine | null, startAt = 0): void {
    if (r) {
      this.routine = r;
      this.routineTime = startAt;
      this.routinePrev = startAt - 0.001;
      this.routineFixed = null;
    }
    this.routineTarget = r ? 1 : 0;
  }

  private poseBones(pose: BonePose, drop: number, w: number): void {
    for (const name in pose) {
      const b = this.bone(name);
      const rest = this.rest.get(name);
      if (!b || !rest) continue;
      const [x, y, z] = pose[name];
      // Arms are layered on the idle clip (its relaxed arms); legs, hips and back are absolute.
      if (ADDITIVE_BONE.test(name)) {
        b.rotateX(x * w);
        b.rotateY(y * w);
        b.rotateZ(z * w);
        continue;
      }
      this.tq.setFromEuler(this.te.set(x, y, z, 'XYZ'));
      this.tq2.copy(rest).multiply(this.tq);
      b.quaternion.slerp(this.tq2, w);
    }
    if (drop !== 0) {
      const pelvis = this.bone('pelvis');
      const parent = pelvis?.parent;
      if (pelvis && parent) {
        parent.getWorldQuaternion(this.tq).invert();
        parent.getWorldScale(this.ts);
        this.tv.set(0, -drop * w, 0).applyQuaternion(this.tq).divide(this.ts);
        pelvis.position.add(this.tv);
      }
    }
  }

  private applyRoutine(dt: number): void {
    if (this.debugAbs) this.poseBones(this.debugAbs.pose, this.debugAbs.drop ?? 0, 1);
    this.routineWeight += (this.routineTarget - this.routineWeight) * Math.min(1, dt * 3);
    if (!this.routine) return;
    if (this.routineWeight < 0.01 && this.routineTarget === 0) {
      this.routine = null;
      return;
    }
    if (this.routineFixed !== null && this.routineTarget === 1) this.routineTime = Math.max(this.routineTime, this.routineFixed);
    else this.routineTime += dt;
    const s = sample(this.routine, this.routineTime, this.routinePrev);
    this.routinePrev = this.routineTime;
    if (s.cue && this.routineTarget === 1) this.onCue?.(s.cue);
    this.poseBones(s.pose, s.drop, this.routineWeight);
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

  /**
   * Lets the renderer skip this person when they are off screen. Skinned bounds do not follow the
   * animation, so each part gets a generous fixed sphere around the whole body (any pose fits).
   */
  private cullOffscreen(): void {
    const ref = this.body.geometry;
    ref.computeBoundingBox();
    const box = ref.boundingBox!;
    const centre = box.getCenter(new Vector3());
    const radius = box.getSize(new Vector3()).length() * 0.75;
    this.root.traverse((o) => {
      if (o instanceof SkinnedMesh) {
        o.boundingSphere = new Sphere(centre.clone(), radius);
        o.frustumCulled = true;
      } else if (o instanceof Mesh) {
        o.frustumCulled = true;
      }
    });
  }

  /**
   * Far from the camera: not drawn (moved to a camera layer nobody renders), without touching
   * `visible`, which game logic uses. Cheap to call often: only acts on a change.
   */
  setFar(far: boolean): void {
    if (far === this.far) return;
    this.far = far;
    this.root.traverse((o) => o.layers.set(far ? 5 : 0));
  }

  get isFar(): boolean {
    return this.far;
  }

  /** How the face looks (eyebrows and eyelids); it blinks on its own. */
  setExpression(e: Expression): void {
    this.face?.set(e);
  }

  /** Eyes shut (sleeping). */
  setEyesClosed(closed: boolean): void {
    this.face?.setClosed(closed);
  }

  dispose(): void {
    this.face?.dispose();
    HumanModel.all.delete(this);
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
