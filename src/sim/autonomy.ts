import { stepsOf, type ActionDef, type ActionStep } from './actions';
import { NEED_KEYS, type NeedKey } from './needs';
import type { GameSession } from './session';

// Utility AI: when left alone, the character scores every action the objects in the room
// advertise and picks a good one. Urgent needs weigh much more than comfortable ones.

export type AutonomyLevel = 'off' | 'low' | 'full';

export interface Candidate {
  instanceId: string;
  action: ActionDef;
  /** Walking distance in metres. */
  distance: number;
}

export interface Choice {
  instanceId: string;
  action: ActionDef;
  score: number;
  /** The need this choice mostly serves (for the thought bubble). */
  reason: NeedKey | 'stres' | 'belanja';
}

export interface AutonomyConfig {
  /** Low autonomy only acts when a need is below this. */
  lowThreshold: number;
  distancePenaltyPerMetre: number;
  /** Rupiah that cost one point of utility. */
  rupiahPerPoint: number;
  /** Groceries bought when the character goes shopping on its own. */
  autoBasket: Record<string, number>;
}

/** How much a need matters right now: nearly nothing when full, a lot when empty. */
export function urgency(value: number): number {
  const lack = 1 - value / 100;
  return 0.05 + 3 * lack * lack;
}

function stepGain(step: ActionStep, need: NeedKey, current: number): number {
  const rate = step.needsPerHour?.[need] ?? 0;
  if (rate <= 0) return rate * (step.durationMinutes / 60) * 0.3; // small cost for draining a need
  return Math.min(100 - current, rate * (step.durationMinutes / 60));
}

/** Utility of an action for the character's current state. */
export function scoreAction(session: GameSession, c: Candidate): { score: number; reason: Choice['reason'] } {
  const v = session.character.vitals;
  const traits = session.character.traits;
  const steps = stepsOf(c.action);
  let best: Choice['reason'] = 'hiburan';
  let bestPart = -Infinity;
  let score = 0;
  for (const k of NEED_KEYS) {
    let gain = 0;
    let level = v.needs[k];
    for (const st of steps) {
      const g = stepGain(st, k, level);
      gain += g;
      level = Math.min(100, level + Math.max(0, g));
    }
    const part = gain * urgency(v.needs[k]);
    score += part;
    if (part > bestPart) {
      bestPart = part;
      best = k;
    }
  }
  // Stress relief matters more the more stressed the character is.
  const stressDrop = -steps.reduce((s, st) => s + (st.stressPerHour ?? 0) * (st.durationMinutes / 60), 0);
  if (stressDrop > 0) {
    const part = Math.min(stressDrop, v.stress) * (v.stress / 100) * 1.5;
    score += part;
    if (part > bestPart) {
      bestPart = part;
      best = 'stres';
    }
  }
  if (c.action.activity === 'exercising') score *= traits.includes('sporty') ? 1.6 : 1;
  if (c.action.labelKey === 'act.watchTv' || c.action.labelKey === 'act.browse') score *= traits.includes('santai') ? 1.3 : 1;
  return { score, reason: best };
}

/**
 * Picks what to do next, or null (nothing worth doing, autonomy off, or needs fine on Low).
 * `random` (0..1) chooses among the top options so the character does not feel robotic.
 */
export function chooseAction(session: GameSession, candidates: Candidate[], level: AutonomyLevel, cfg: AutonomyConfig, random: number): Choice | null {
  if (level === 'off') return null;
  const v = session.character.vitals;
  const lowest = Math.min(...NEED_KEYS.map((k) => v.needs[k]));
  if (level === 'low' && lowest >= cfg.lowThreshold) return null;

  const options: Choice[] = [];
  for (const c of candidates) {
    if (c.action.ui === 'shop') continue; // shopping is considered separately below
    if (session.actionBlock(c.action)) continue;
    const { score, reason } = scoreAction(session, c);
    const cost = (c.action.cost ?? 0) / cfg.rupiahPerPoint;
    const final = score - c.distance * cfg.distancePenaltyPerMetre - cost;
    if (final > 2) options.push({ instanceId: c.instanceId, action: c.action, score: final, reason });
  }

  // Hungry with an empty fridge: go shopping (if it can be afforded).
  const hungry = v.needs.kenyang < 45;
  const canEatSomething = options.some((o) => o.reason === 'kenyang');
  const shop = candidates.find((c) => c.action.ui === 'shop');
  if (hungry && !canEatSomething && shop && session.wallet.balance >= session.inventory.priceOf(cfg.autoBasket)) {
    options.push({ instanceId: shop.instanceId, action: shop.action, score: urgency(v.needs.kenyang) * 40, reason: 'belanja' });
  }

  if (options.length === 0) return null;
  options.sort((a, b) => b.score - a.score);
  // Weighted pick among options close to the best one.
  const top = options.filter((o) => o.score >= options[0].score * 0.75).slice(0, 3);
  const total = top.reduce((s, o) => s + o.score, 0);
  let r = random * total;
  for (const o of top) {
    r -= o.score;
    if (r <= 0) return o;
  }
  return top[0];
}
