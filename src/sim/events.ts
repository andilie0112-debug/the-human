import { NEED_KEYS, clamp100, type NeedKey } from './needs';

// Random life events, holidays and traditions (data: events.json, traditions.json).

export interface Effects {
  money?: number;
  stress?: number;
  kangen?: number;
  /** Mood buff id: 'senang' (happy) or 'tenang' (calm). */
  buff?: string;
  /** Joins the monthly arisan. */
  arisan?: boolean;
  /** Puts money into a relative's business (Minang merantau offer). */
  investment?: boolean;
  mood?: number;
  kenyang?: number;
  energi?: number;
  bersih?: number;
  sosial?: number;
  hiburan?: number;
}

export interface Choice {
  labelKey: string;
  effects: Effects;
}

export interface EventDef {
  id: string;
  titleKey: string;
  textKey: string;
  weight: number;
  conditions: {
    minBalance?: number;
    employed?: boolean;
    ethnicity?: string;
    floodCity?: boolean;
    rainyMonths?: boolean;
  };
  choices: Choice[];
}

export interface TraditionDef {
  id: string;
  /** "MM-DD", reused every year. */
  date: string;
  religions?: string[];
  ethnicities?: string[];
  effects?: Effects;
  choices?: Choice[];
  angpao?: boolean;
  nyepi?: boolean;
}

export interface EventContext {
  balance: number;
  employed: boolean;
  ethnicities: string[];
  religionId: string;
  floodRisk: number;
  month: number;
}

const RAINY = new Set([11, 12, 1, 2, 3]);

export function eligible(e: EventDef, ctx: EventContext): boolean {
  const c = e.conditions;
  if (c.minBalance !== undefined && ctx.balance < c.minBalance) return false;
  if (c.employed && !ctx.employed) return false;
  if (c.ethnicity && !ctx.ethnicities.includes(c.ethnicity)) return false;
  if (c.floodCity && ctx.floodRisk < 0.4) return false;
  if (c.rainyMonths && !RAINY.has(ctx.month)) return false;
  return true;
}

/** Weighted pick among eligible events. Good feng shui (luck 0..5) makes lucky events likelier. */
export function pickEvent(events: readonly EventDef[], ctx: EventContext, roll: number, luck = 0): EventDef | null {
  const pool = events.filter((e) => eligible(e, ctx)).map((e) => ({ e, w: e.weight * (e.id === 'rejekiNomplok' ? 1 + luck * 0.4 : 1) }));
  const total = pool.reduce((s, p) => s + p.w, 0);
  if (total <= 0) return null;
  let r = roll * total;
  for (const p of pool) {
    r -= p.w;
    if (r <= 0) return p.e;
  }
  return pool[pool.length - 1].e;
}

/** Traditions for today that apply to this character. */
export function traditionsToday(all: readonly TraditionDef[], monthDay: string, religionId: string, ethnicities: string[]): TraditionDef[] {
  return all.filter((t) => {
    if (t.date !== monthDay) return false;
    const rel = t.religions ?? [];
    const eth = t.ethnicities ?? [];
    if (rel.length === 0 && eth.length === 0) return true;
    return rel.includes(religionId) || eth.some((e) => ethnicities.includes(e));
  });
}

/** Applies need/stress/homesickness changes (money and buffs are handled by the session). */
export function applyNeedEffects(v: { needs: Record<NeedKey, number>; stress: number; kangen: number }, e: Effects): void {
  for (const k of NEED_KEYS) if (e[k] !== undefined) v.needs[k] = clamp100(v.needs[k] + (e[k] ?? 0));
  if (e.stress) v.stress = clamp100(v.stress + e.stress);
  if (e.kangen) v.kangen = clamp100(v.kangen + e.kangen);
}
