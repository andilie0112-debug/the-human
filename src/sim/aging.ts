// Growing older: the character has a birthday every "year" of game days (the length is a setting,
// because a real 365-day year would take weeks of play), moves through life stages and retires
// from a job at the retirement age with a JHT (old-age savings) payout.

export type AgeSpeed = 'cepat' | 'normal' | 'realistis';
export type LifeStage = 'muda' | 'dewasa' | 'paruhBaya' | 'lansia';

export interface AgingConfig {
  daysPerYear: Record<AgeSpeed, number>;
  retireAge: number;
  /** JHT payout in months of gross salary per year worked at the last employer (capped). */
  jhtMonthsPerYear: number;
  jhtMaxMonths: number;
  /** Hair turns grey from this age. */
  greyFromAge: number;
  /** Energy drains faster from this age (factor per decade above it). */
  slowerFromAge: number;
  energyFactorPerDecade: number;
}

export function lifeStage(age: number): LifeStage {
  if (age < 30) return 'muda';
  if (age < 50) return 'dewasa';
  if (age < 60) return 'paruhBaya';
  return 'lansia';
}

/** Days into the current year -> whether today is a birthday. */
export function isBirthday(ageDays: number, speed: AgeSpeed, cfg: AgingConfig): boolean {
  return ageDays >= cfg.daysPerYear[speed];
}

/** How much faster energy drains at this age (1 = normal). */
export function energyFactor(age: number, cfg: AgingConfig): number {
  return 1 + Math.max(0, (age - cfg.slowerFromAge) / 10) * cfg.energyFactorPerDecade;
}

/** Share of grey in the hair at this age, 0..1. */
export function greyShare(age: number, cfg: AgingConfig): number {
  return Math.max(0, Math.min(1, (age - cfg.greyFromAge) / 20));
}

/** JHT payout when retiring after `yearsWorked` at the last employer. */
export function jhtPayout(monthlyGross: number, yearsWorked: number, cfg: AgingConfig): number {
  return Math.round(monthlyGross * Math.min(cfg.jhtMaxMonths, Math.max(1, yearsWorked) * cfg.jhtMonthsPerYear));
}
