// Needs, stress, health and mood. All values are 0..100; stress is "higher is worse".

export const NEED_KEYS = ['kenyang', 'energi', 'bersih', 'sosial', 'hiburan'] as const;
export type NeedKey = (typeof NEED_KEYS)[number];
export type Needs = Record<NeedKey, number>;

export interface NeedsConfig {
  decayPerHour: Needs;
  sleepingDecayFactor: Needs;
  workingDecayFactor: number;
  hotRoomDecayFactor: number;
  fastingHungerFactor: number;
  sickEnergyFactor: number;
  lowNeedThreshold: number;
  stressPerLowNeedPerHour: number;
  stressRecoveryPerHour: number;
  stressRecoveryNeedFloor: number;
  burnoutStress: number;
  healthLossStarvingPerHour: number;
  healthLossExhaustedPerHour: number;
  healthRecoveryPerHour: number;
  healthRecoveryNeedFloor: number;
  sickHealthThreshold: number;
  sickChancePerDay: number;
  kangenPerDay: number;
  traitSantaiStressFactor: number;
}

export interface MoodConfig {
  needsWeight: number;
  calmWeight: number;
  healthWeight: number;
  sickPenalty: number;
  kangenPenaltyAbove: number;
  kangenPenalty: number;
  negativeBalancePenalty: number;
}

export interface Vitals {
  needs: Needs;
  stress: number;
  health: number;
  sick: boolean;
  /** Homesickness, only grows for perantau (migrant) characters. */
  kangen: number;
}

export interface Conditions {
  sleeping: boolean;
  working: boolean;
  hotRoom: boolean;
  fasting: boolean;
  traits: readonly string[];
}

export const clamp100 = (v: number): number => Math.min(100, Math.max(0, v));

export function freshVitals(): Vitals {
  return {
    needs: { kenyang: 80, energi: 85, bersih: 80, sosial: 70, hiburan: 70 },
    stress: 10,
    health: 100,
    sick: false,
    kangen: 0,
  };
}

/** Decays needs and updates stress and health over `hours` of game time. Mutates `v`. */
export function updateVitals(v: Vitals, hours: number, c: Conditions, cfg: NeedsConfig): void {
  if (hours <= 0) return;
  for (const k of NEED_KEYS) {
    let rate = cfg.decayPerHour[k];
    if (c.sleeping) rate *= cfg.sleepingDecayFactor[k];
    if (c.working) rate *= cfg.workingDecayFactor;
    if (c.hotRoom) rate *= cfg.hotRoomDecayFactor;
    if (k === 'kenyang' && c.fasting) rate *= cfg.fastingHungerFactor;
    if (k === 'energi' && v.sick) rate *= cfg.sickEnergyFactor;
    v.needs[k] = clamp100(v.needs[k] - rate * hours);
  }

  const low = NEED_KEYS.filter((k) => v.needs[k] < cfg.lowNeedThreshold).length;
  if (low > 0) {
    const santai = c.traits.includes('santai') ? cfg.traitSantaiStressFactor : 1;
    v.stress = clamp100(v.stress + low * cfg.stressPerLowNeedPerHour * santai * hours);
  } else if (NEED_KEYS.every((k) => v.needs[k] >= cfg.stressRecoveryNeedFloor)) {
    v.stress = clamp100(v.stress - cfg.stressRecoveryPerHour * hours);
  }

  let dh = 0;
  if (v.needs.kenyang <= 0) dh -= cfg.healthLossStarvingPerHour;
  if (v.needs.energi <= 0) dh -= cfg.healthLossExhaustedPerHour;
  if (dh === 0 && !v.sick && v.needs.kenyang >= cfg.healthRecoveryNeedFloor && v.needs.energi >= cfg.healthRecoveryNeedFloor) {
    dh = cfg.healthRecoveryPerHour;
  }
  v.health = clamp100(v.health + dh * hours);
}

export function isBurnedOut(v: Vitals, cfg: NeedsConfig): boolean {
  return v.stress >= cfg.burnoutStress;
}

/** Once a day: maybe fall sick when health is low. Returns true if the character just got sick. */
export function rollSickness(v: Vitals, cfg: NeedsConfig, roll: number): boolean {
  if (v.sick || v.health >= cfg.sickHealthThreshold) return false;
  if (roll < cfg.sickChancePerDay) {
    v.sick = true;
    return true;
  }
  return false;
}

/** Mood 0..100 from needs, calm (inverse stress), health and penalties. */
export function computeMood(v: Vitals, cfg: MoodConfig, opts: { negativeBalance: boolean }): number {
  const needsAvg = NEED_KEYS.reduce((s, k) => s + v.needs[k], 0) / NEED_KEYS.length;
  let mood = needsAvg * cfg.needsWeight + (100 - v.stress) * cfg.calmWeight + v.health * cfg.healthWeight;
  if (v.sick) mood -= cfg.sickPenalty;
  if (v.kangen > cfg.kangenPenaltyAbove) mood -= cfg.kangenPenalty;
  if (opts.negativeBalance) mood -= cfg.negativeBalancePenalty;
  return clamp100(mood);
}
