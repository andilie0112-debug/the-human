// Crime and the law (no violence against people): shoplifting, running off without paying,
// pickpocketing. Each offence may be seen (CCTV, witnesses): that raises the wanted level
// (0..3 stars) and goes on the criminal record. Police look for wanted people; caught means a
// fine or jail. A recent record means no SKCK, so many employers will not hire you.

export type Offence = 'mencuri' | 'kabur' | 'copet';

export interface CrimeConfig {
  /** Chance that the offence is noticed (0..1). */
  seenChance: Record<Offence, number>;
  /** Wanted stars added when noticed. */
  stars: Record<Offence, number>;
  /** Fine per star (rupiah). */
  finePerStar: number;
  /** Days in jail per star when the fine cannot (or will not) be paid. */
  jailDaysPerStar: number;
  /** Game hours for one star to fade when nobody catches you. */
  starFadeHours: number;
  /** A record younger than this blocks the SKCK. */
  recordYears: number;
}

export interface CrimeRecordEntry {
  offence: Offence;
  t: number;
  /** What happened at the end: fined, jailed, or still open. */
  outcome: 'denda' | 'penjara' | 'lolos' | 'buron';
}

export interface CrimeState {
  wanted: number;
  /** Game minute of the last offence seen (for fading). */
  wantedSince: number;
  record: CrimeRecordEntry[];
  /** Game minute when a jail sentence ends (null = free). */
  jailUntil: number | null;
}

export function newCrimeState(): CrimeState {
  return { wanted: 0, wantedSince: 0, record: [], jailUntil: null };
}

/** Records an offence; returns whether it was noticed. */
export function commitOffence(s: CrimeState, offence: Offence, now: number, roll: number, cfg: CrimeConfig, chanceFactor = 1): boolean {
  const seen = roll < Math.min(0.98, cfg.seenChance[offence] * chanceFactor);
  if (seen) {
    s.wanted = Math.min(3, s.wanted + cfg.stars[offence]);
    s.wantedSince = now;
    s.record.push({ offence, t: now, outcome: 'buron' });
  } else {
    s.record.push({ offence, t: now, outcome: 'lolos' });
  }
  return seen;
}

/** Wanted stars fade with time when nobody catches you. */
export function fadeWanted(s: CrimeState, now: number, cfg: CrimeConfig): void {
  if (s.wanted <= 0) return;
  const hours = (now - s.wantedSince) / 60;
  if (hours >= cfg.starFadeHours) {
    s.wanted -= 1;
    s.wantedSince = now;
    if (s.wanted === 0) for (const e of s.record) if (e.outcome === 'buron') e.outcome = 'lolos';
  }
}

export function fineFor(s: CrimeState, cfg: CrimeConfig): number {
  return Math.max(1, s.wanted) * cfg.finePerStar;
}

export function jailDaysFor(s: CrimeState, cfg: CrimeConfig): number {
  return Math.max(1, s.wanted) * cfg.jailDaysPerStar;
}

/** After an arrest: the open offences close with the outcome and the wanted level resets. */
export function settleArrest(s: CrimeState, outcome: 'denda' | 'penjara', now: number, jailMinutes: number): void {
  for (const e of s.record) if (e.outcome === 'buron') e.outcome = outcome;
  s.wanted = 0;
  s.jailUntil = outcome === 'penjara' ? now + jailMinutes : null;
}

/** True when a recent conviction or open case stops the police from issuing an SKCK. */
export function skckBlocked(s: CrimeState, now: number, cfg: CrimeConfig): boolean {
  const window = cfg.recordYears * 365 * 24 * 60;
  return s.wanted > 0 || s.record.some((e) => (e.outcome === 'denda' || e.outcome === 'penjara' || e.outcome === 'buron') && now - e.t < window);
}
