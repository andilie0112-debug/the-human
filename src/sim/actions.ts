import { clamp100, NEED_KEYS, type NeedKey, type Vitals } from './needs';

// Actions advertised by smart objects (data in src/data/objects.json). The simulation only
// knows their effects and timing; walking there and animating is the renderer's job.

export type ActionActivity = 'idle' | 'sleeping' | 'working' | 'exercising';

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
  /** Animation hint for the renderer. */
  animation: 'stand' | 'interact' | 'sit' | 'lie' | 'exercise' | 'worship';
}

export interface Buff {
  id: string;
  mood: number;
  /** Game minute when it ends. */
  until: number;
}

export type ActionBlock = 'fasting' | 'money' | null;

/** Applies an action's per-hour effects for `hours` of game time. Mutates `v`. */
export function applyActionEffects(v: Vitals, def: ActionDef, hours: number): void {
  if (hours <= 0) return;
  for (const k of NEED_KEYS) {
    const rate = def.needsPerHour?.[k];
    if (rate) v.needs[k] = clamp100(v.needs[k] + rate * hours);
  }
  if (def.stressPerHour) v.stress = clamp100(v.stress + def.stressPerHour * hours);
  if (def.kangenPerHour) v.kangen = clamp100(v.kangen + def.kangenPerHour * hours);
}
