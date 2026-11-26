import { clamp100, NEED_KEYS, type NeedKey, type Vitals } from './needs';

// Actions advertised by smart objects (data in src/data/objects.json). The simulation only
// knows their effects and timing; walking there and animating is the renderer's job.

export type ActionActivity = 'idle' | 'sleeping' | 'working' | 'exercising';

export type ActionAnimation = 'stand' | 'interact' | 'sit' | 'lie' | 'exercise' | 'worship' | 'eat' | 'cook' | 'chop' | 'shower' | 'dry' | 'type' | 'away' | 'sweep' | 'mop' | 'wipe' | 'wash';

/** What the character wears. 'none' = undressed in the shower (shown censored). */
export type Outfit = 'daily' | 'sleep' | 'towel' | 'none';

/**
 * One stage of a multi-step action, done at an object. `object` is an object type id resolved to
 * the nearest instance in the room, or "self" for the object the player tapped.
 */
export interface ActionStep {
  object: string;
  durationMinutes: number;
  needsPerHour?: Partial<Record<NeedKey, number>>;
  stressPerHour?: number;
  kangenPerHour?: number;
  endWhenFull?: NeedKey;
  activity?: ActionActivity;
  animation: ActionAnimation;
  /** Visual state of the object while this step runs (fridge open, stove on, water on...). */
  prop?: string;
  /** Skill points gained per game hour (logika, karisma, kreatif, masak, fisik). */
  skillsPerHour?: Partial<Record<string, number>>;
  /** Outfit put on when this step starts (undress before the shower, pyjamas before bed...). */
  outfit?: Outfit;
  /** Where to stand, in object space, instead of the object's default spot. */
  spot?: [number, number];
  /** Face away from the object (sitting down on it, e.g. the toilet). */
  faceAway?: boolean;
}

export interface ActionDef {
  id: string;
  /** strings.id.json key for the menu label. */
  labelKey: string;
  /** Maximum duration in game minutes. */
  durationMinutes: number;
  /** Need changes per game hour while the action runs (positive restores). */
  needsPerHour?: Partial<Record<NeedKey, number>>;
  stressPerHour?: number;
  kangenPerHour?: number;
  /** Ends early when this need is full. */
  endWhenFull?: NeedKey;
  activity?: ActionActivity;
  /** Time runs fast-forward while this action runs (sleep, work). */
  fastForward?: boolean;
  /** Paid once when the action starts (rupiah). */
  cost?: number;
  /** Eating: blocked during fasting hours for characters who fast. */
  isEating?: boolean;
  /** Mood buff granted when the action completes. */
  buff?: { id: string; mood: number; hours: number };
  /** Offered only when this holds: 'business:<type>' (owning that side business). */
  requires?: string;
  /** Housework this action does (sweeping, laundry...); offered only when there is some to do. */
  chore?: import('./housework').Chore;
  /** Animation hint for the renderer. */
  animation: ActionAnimation;
  /** Visual state of the object while the action runs. */
  prop?: string;
  /** Multi-step action (take food from the fridge, cook at the stove, eat at the desk...). */
  steps?: ActionStep[];
  /** Items used up when the action starts. */
  consumes?: { category: string; qty: number };
  /** Special UI before starting (shopping list, interview questions, map, entering home...). */
  ui?: 'shop' | 'interview' | 'shopNow' | 'map' | 'enterHome' | 'goOutside' | 'enterStore' | 'enterHospital' | 'enterStation' | 'enterAirport' | 'enterCafe' | 'enterWorship' | 'enterPlace' | 'jobBoard' | 'askJob' | 'jobFair';
  /** Price comes from the city (e.g. a street meal at the warung). */
  costKey?: 'streetMeal';
  /** Free when the character has a job (BPJS Kesehatan). */
  bpjsCovered?: boolean;
  /** Cures sickness when the action completes (the clinic). */
  cures?: boolean;
  /** Rupiah earned per game hour while the action runs (ojol driving). */
  incomePerHour?: number;
  requiresMotorbike?: boolean;
  /** Worship at a place of worship: only for the character's own religion. */
  religionOnly?: boolean;
  /** Shop price multiplier (the market is cheaper). */
  priceFactor?: number;
  /** Skill points gained per game hour for single-step actions. */
  skillsPerHour?: Partial<Record<string, number>>;
  /** Doing this is an offence (eating and running off without paying). */
  crime?: 'kabur';
}

/** The steps of an action; a simple action is one step at the tapped object. */
export function stepsOf(def: ActionDef): ActionStep[] {
  if (def.steps && def.steps.length > 0) return def.steps;
  return [{
    object: 'self',
    durationMinutes: def.durationMinutes,
    needsPerHour: def.needsPerHour,
    stressPerHour: def.stressPerHour,
    kangenPerHour: def.kangenPerHour,
    endWhenFull: def.endWhenFull,
    activity: def.activity,
    animation: def.animation,
    prop: def.prop,
    skillsPerHour: def.skillsPerHour,
  }];
}

/** Total planned minutes of an action. */
export function totalMinutes(def: ActionDef): number {
  return stepsOf(def).reduce((s, st) => s + st.durationMinutes, 0);
}

export interface Buff {
  id: string;
  mood: number;
  /** Game minute when it ends. */
  until: number;
}

export type ActionBlock = 'fasting' | 'money' | 'noFood' | 'motorbike' | 'religion' | 'record' | 'business' | 'noChore' | null;

/** Applies a step's per-hour effects for `hours` of game time. Mutates `v`. */
export function applyActionEffects(v: Vitals, def: Pick<ActionStep, 'needsPerHour' | 'stressPerHour' | 'kangenPerHour'>, hours: number): void {
  if (hours <= 0) return;
  for (const k of NEED_KEYS) {
    const rate = def.needsPerHour?.[k];
    if (rate) v.needs[k] = clamp100(v.needs[k] + rate * hours);
  }
  if (def.stressPerHour) v.stress = clamp100(v.stress + def.stressPerHour * hours);
  if (def.kangenPerHour) v.kangen = clamp100(v.kangen + def.kangenPerHour * hours);
}
