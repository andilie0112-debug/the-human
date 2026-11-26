// Side businesses run from home besides a job: an online shop, home catering, freelance design.
// Starting one costs capital. Each day the business sells more when it was worked on that day and
// as its reputation grows; there are daily running costs. The day's profit or loss is booked at
// night. Skills help: marketing (karisma) for the shop, cooking for catering, creativity for design.

import type { SkillId } from './career';

export interface BusinessType {
  id: string;
  nameKey: string;
  descKey: string;
  icon: string;
  capital: number;
  /** Average sales per day at reputation 50 when worked on that day. */
  baseRevenue: number;
  /** Running costs per day (stock, ingredients, ads, internet). */
  dailyCost: number;
  /** Share of sales on days nobody works on it (orders still trickle in). */
  idleShare: number;
  /** The skill that raises sales. */
  skill: SkillId;
}

export interface BusinessConfig {
  types: BusinessType[];
  reputationGain: number;
  reputationLoss: number;
}

export interface BusinessState {
  typeId: string;
  /** 0..100 */
  reputation: number;
  /** Game day index the business was last worked on. */
  workedDay: number;
  startedDay: number;
  /** Totals since it started (for the app). */
  totalProfit: number;
  lastProfit: number;
}

/** One day's result. `rand` is 0..1. */
export function dayProfit(b: BusinessState, type: BusinessType, worked: boolean, skillLevel: number, rand: number): number {
  const repFactor = 0.4 + (b.reputation / 100) * 1.2;
  const skillFactor = 0.8 + Math.min(10, skillLevel) * 0.04;
  const luck = 0.7 + rand * 0.6;
  const sales = type.baseRevenue * repFactor * skillFactor * luck * (worked ? 1 : type.idleShare);
  return Math.round((sales - type.dailyCost) / 500) * 500;
}

/** Reputation grows on worked days and fades when the business is left alone. */
export function nextReputation(b: BusinessState, worked: boolean, cfg: BusinessConfig): number {
  return Math.max(0, Math.min(100, b.reputation + (worked ? cfg.reputationGain : -cfg.reputationLoss)));
}
