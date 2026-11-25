// Full-body procedural routines (worship movements), keyframed as bone rotations relative to
// the skeleton's rest pose, so floor poses (kneeling, sujud, sitting on the heels) are symmetric
// whatever clip runs underneath. Angles are radians on the Universal Base Characters skeleton:
//   pelvis X+  tilts the whole body forward     thigh X−  swings the leg forward
//   calf X+    bends the knee                   spine Z+  bends the back forward
//   Head Z+    bows the head                    upperarm Z+ raises the arm forward
//   lowerarm X+ bends the elbow
// `drop` lowers the hips (metres) for kneeling and sitting.

export type Euler3 = [number, number, number];
export type BonePose = Record<string, Euler3>;

export interface Keyframe {
  pose: BonePose;
  drop?: number;
  /** Seconds to move into this pose from the previous one. */
  move: number;
  /** Seconds to hold it. */
  hold: number;
  /** Sound cue played when the pose is reached (e.g. 'bell', 'knock'). */
  cue?: string;
}

export interface Routine {
  frames: Keyframe[];
  /** Index to loop back to after the last frame (the opening frames play once). */
  loopFrom: number;
}

// --- Building blocks ------------------------------------------------------------------------

type Part = BonePose;
const both = (upper: Euler3, lower: Euler3): Part => ({ upperarm_l: upper, lowerarm_l: lower, upperarm_r: upper, lowerarm_r: lower });
const pose = (...parts: Part[]): BonePose => Object.assign({}, ...parts);

const HEAD = 0.18; // the rest pose looks slightly up; this levels the gaze
const legs: Part = { pelvis: [0, 0, 0], thigh_l: [0, 0, 0], thigh_r: [0, 0, 0], calf_l: [0, 0, 0], calf_r: [0, 0, 0] };
const back: Part = { spine_01: [0, 0, 0], spine_02: [0, 0, 0], spine_03: [0, 0, 0], Head: [0, 0, HEAD] };
const armsDown = both([0, 0, 0], [0, 0, 0]);
const STAND = pose(legs, back, armsDown);
/** Kneeling upright (knees and shins on the floor). */
const KNEEL: Part = { calf_l: [1.57, 0, 0], calf_r: [1.57, 0, 0] };
/** Sitting back on the heels (duduk bersimpuh / iftirasy / seiza). */
const ON_HEELS: Part = { thigh_l: [-1.5, 0, 0], thigh_r: [-1.5, 0, 0], calf_l: [2.9, 0, 0], calf_r: [2.9, 0, 0] };
const DROP_KNEEL = 0.45;
const DROP_HEELS = 0.62;

const handsChest = both([0, 0.55, 0.48], [1.9, 0, 0]);
const handsOnThighs = both([0, 0, 0.35], [0.8, 0, 0]);
const headDown = (a: number): Part => ({ Head: [0, 0, HEAD + a] });

// Islam: sholat (two rakaat, ending with salam and a short doa).
const TAKBIR = pose(STAND, both([0, 0.25, 0.55], [2.7, 0, 0]));
const QIYAM = pose(STAND, { upperarm_l: [0, 0.5, 0.5], lowerarm_l: [1.8, 0, 0], upperarm_r: [0, 0.55, 0.55], lowerarm_r: [1.75, 0, 0] }, headDown(0.25));
const RUKUK = pose(STAND, { pelvis: [1.4, 0, 0], thigh_l: [-1.4, 0, 0], thigh_r: [-1.4, 0, 0], Head: [0, 0, -0.05] }, both([0, 0, 0.5], [0, 0, 0]));
const ITIDAL = pose(STAND, headDown(0.15));
const SUJUD = pose(legs, back, KNEEL, { pelvis: [1.6, 0, 0], thigh_l: [-1.85, 0, 0], thigh_r: [-1.85, 0, 0], spine_01: [0, 0, 0.45], spine_02: [0, 0, 0.4], Head: [0, 0, 0.3] }, both([0, 0, 1.3], [0.6, 0, 0]));
const DUDUK = pose(legs, back, ON_HEELS, handsOnThighs, headDown(0.12));
const SALAM_R = pose(DUDUK, { Head: [0, -0.75, HEAD + 0.05] });
const SALAM_L = pose(DUDUK, { Head: [0, 0.75, HEAD + 0.05] });
const DOA_SIT = pose(DUDUK, both([0, 0.3, 0.75], [1.3, 0, 0]), headDown(0.25));

/** A routine that plays once (fitted to the action's length). */
const once = (frames: Keyframe[]): Routine => ({ frames, loopFrom: frames.length });

const k = (p: BonePose, move: number, hold: number, drop = 0, cue?: string): Keyframe => ({ pose: p, move, hold, drop, cue });
const rakaat = (): Keyframe[] => [
  k(QIYAM, 0.5, 2.2),
  k(RUKUK, 0.8, 0.9),
  k(ITIDAL, 0.7, 0.5),
  k(SUJUD, 1.1, 0.9, DROP_KNEEL),
  k(DUDUK, 0.8, 0.5, DROP_HEELS),
  k(SUJUD, 0.8, 0.9, DROP_KNEEL),
];

const SHOLAT: Routine = once([
    k(TAKBIR, 0.7, 0.6),
    ...rakaat(),
    k(TAKBIR, 1.1, 0.4),
    ...rakaat(),
    k(DUDUK, 0.9, 1.8, DROP_HEELS),
    k(SALAM_R, 0.6, 0.6, DROP_HEELS),
    k(SALAM_L, 0.8, 0.6, DROP_HEELS),
    k(DOA_SIT, 0.7, 1.8, DROP_HEELS),
  ]);

// Kristen: kneeling prayer with folded hands and bowed head.
const KNEEL_PRAY = pose(legs, back, KNEEL, handsChest, headDown(0.35));
const DOA_KRISTEN: Routine = once([k(pose(STAND, handsChest, headDown(0.2)), 0.8, 0.8), k(KNEEL_PRAY, 1.4, 9, DROP_KNEEL), k(pose(KNEEL_PRAY, headDown(0.5)), 1.2, 6, DROP_KNEEL), k(pose(KNEEL_PRAY, headDown(0.1)), 1, 1.5, DROP_KNEEL)]);

// Katolik: kneeling, the sign of the cross, folded hands (rosary), the sign of the cross again.
const cross = (upper: Euler3, lower: Euler3): BonePose => pose(legs, back, KNEEL, { upperarm_l: [0, 0.4, 0.3], lowerarm_l: [1.2, 0, 0], upperarm_r: upper, lowerarm_r: lower }, headDown(0.2));
const signOfCross = (): Keyframe[] => [
  k(cross([0, 0.35, 1.05], [2.45, 0, 0]), 0.6, 0.4, DROP_KNEEL), // forehead
  k(cross([0, 0.5, 0.45], [1.9, 0, 0]), 0.5, 0.3, DROP_KNEEL), // chest
  k(cross([0, 0.95, 0.6], [2.2, 0, 0]), 0.5, 0.3, DROP_KNEEL), // left shoulder
  k(cross([0, 0.15, 0.6], [2.4, 0, 0]), 0.5, 0.4, DROP_KNEEL), // right shoulder
];
const DOA_KATOLIK: Routine = once([k(pose(STAND, headDown(0.15)), 0.5, 0.5), k(pose(legs, back, KNEEL, armsDown, headDown(0.2)), 1.3, 0.5, DROP_KNEEL), ...signOfCross(), k(KNEEL_PRAY, 0.8, 11, DROP_KNEEL), ...signOfCross(), k(KNEEL_PRAY, 0.6, 1, DROP_KNEEL)]);

// Hindu: kramaning sembah, sitting, hands joined with the fingertips above the forehead.
const SIT = pose(legs, back, ON_HEELS, handsChest, headDown(0.15));
const SEMBAH = pose(legs, back, ON_HEELS, both([0, 0.5, 1.4], [2.0, 0, 0]), headDown(0.1));
const SEMBAHYANG: Routine = once([
    k(SIT, 1.5, 2, DROP_HEELS, 'genta'),
    ...[0, 1, 2, 3].flatMap(() => [k(SEMBAH, 0.9, 2.6, DROP_HEELS), k(SIT, 0.8, 1.2, DROP_HEELS)]),
    k(pose(SIT, headDown(0.3)), 0.8, 3, DROP_HEELS, 'genta'),
  ]);

// Buddha: puja bakti, anjali, three prostrations (namaskara), then meditation.
const ANJALI = pose(legs, back, ON_HEELS, handsChest, headDown(0.2));
const NAMASKARA = pose(legs, back, ON_HEELS, { pelvis: [1.2, 0, 0], thigh_l: [-2.7, 0, 0], thigh_r: [-2.7, 0, 0], spine_01: [0, 0, 0.4], spine_02: [0, 0, 0.35], Head: [0, 0, 0.3] }, both([0, 0, 1.2], [0.4, 0, 0]));
const MEDITASI = pose(legs, back, ON_HEELS, both([0, 0.35, 0.3], [1.25, 0, 0]), headDown(0.3));
const PUJA_BAKTI: Routine = once([
    k(ANJALI, 1.5, 1.5, DROP_HEELS, 'bell'),
    ...[0, 1, 2].flatMap(() => [k(NAMASKARA, 1.1, 1.2, DROP_HEELS), k(ANJALI, 1, 0.8, DROP_HEELS)]),
    k(MEDITASI, 1.2, 12, DROP_HEELS, 'bell'),
    k(ANJALI, 1, 1.2, DROP_HEELS, 'bell'),
  ]);

// Konghucu: standing before the altar, hands joined (soja) with incense, three bows.
const SOJA = pose(STAND, both([0, 0.55, 0.75], [1.55, 0, 0]), headDown(0.15));
const BOW = pose(SOJA, { pelvis: [0.6, 0, 0], thigh_l: [-0.6, 0, 0], thigh_r: [-0.6, 0, 0], Head: [0, 0, HEAD + 0.25] });
const SEMBAHYANG_KONGHUCU: Routine = once([k(SOJA, 1, 3, 0, 'gong'), ...[0, 1, 2].flatMap(() => [k(BOW, 1, 1, 0, 'bell'), k(SOJA, 1, 1.5)]), k(pose(SOJA, headDown(0.3)), 1, 8), k(BOW, 1, 1.2, 0, 'gong'), k(SOJA, 1, 1)]);

/** Worship routine for each religion (ids from religions.json). */
export const WORSHIP: Record<string, Routine> = {
  islam: SHOLAT,
  kristen: DOA_KRISTEN,
  katolik: DOA_KATOLIK,
  hindu: SEMBAHYANG,
  buddha: PUJA_BAKTI,
  konghucu: SEMBAHYANG_KONGHUCU,
};

/** Length of a routine's frames in seconds (used to fit it to an action). */
export function routineLength(r: Routine): number {
  return r.frames.reduce((s, f) => s + f.move + f.hold, 0);
}

// --- Playback -------------------------------------------------------------------------------

const smooth = (t: number): number => t * t * (3 - 2 * t);

export interface Sampled {
  pose: BonePose;
  drop: number;
  /** Cue of a frame reached since the last sample, if any. */
  cue: string | null;
}

/** Total length of one pass through frames [from, to). */
function span(frames: Keyframe[], from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += frames[i].move + frames[i].hold;
  return s;
}

/** Pose at time t (seconds) of a routine; `prevT` detects cues crossed since the last call. */
export function sample(r: Routine, t: number, prevT: number): Sampled {
  const f = r.frames;
  const intro = span(f, 0, r.loopFrom);
  const loop = span(f, r.loopFrom, f.length);
  const local = (time: number): number => (time < intro || loop <= 0 ? time : intro + ((time - intro) % loop));
  const at = (time: number): { i: number; k: number; reached: boolean } => {
    let rest = local(time);
    for (let i = 0; i < f.length; i++) {
      if (rest < f[i].move) return { i, k: smooth(rest / f[i].move), reached: false };
      rest -= f[i].move;
      if (rest < f[i].hold) return { i, k: 1, reached: true };
      rest -= f[i].hold;
    }
    return { i: f.length - 1, k: 1, reached: true };
  };
  const cur = at(t);
  const before = at(Math.max(0, prevT));
  const prev = cur.i === 0 ? (t < intro ? null : f[f.length - 1]) : f[cur.i - 1];
  const to = f[cur.i];
  const from = prev?.pose ?? {};
  const out: BonePose = {};
  const names = new Set([...Object.keys(from), ...Object.keys(to.pose)]);
  for (const n of names) {
    const a = from[n] ?? [0, 0, 0];
    const b = to.pose[n] ?? [0, 0, 0];
    out[n] = [a[0] + (b[0] - a[0]) * cur.k, a[1] + (b[1] - a[1]) * cur.k, a[2] + (b[2] - a[2]) * cur.k];
  }
  const drop = (prev?.drop ?? 0) + ((to.drop ?? 0) - (prev?.drop ?? 0)) * cur.k;
  const cue = cur.reached && (!before.reached || before.i !== cur.i) && prevT >= 0 ? (to.cue ?? null) : null;
  return { pose: out, drop, cue };
}
