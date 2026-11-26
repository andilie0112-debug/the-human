// When people gather to worship, for every religion: the five daily prayers at the mosque after
// the adzan (prayed together, berjamaah), Sunday services at church, puja bakti at the vihara on
// Sunday morning with a bhante, the Tri Sandhya at the pura three times a day, and incense
// prayers at the klenteng. Used to fill places with worshippers and to time the adzan.

export interface WorshipSlot {
  /** Days of the week (0 = Sunday). */
  days: number[];
  /** Start and end hour (fractional). */
  from: number;
  to: number;
}

export interface WorshipConfig {
  /** Hours of the adzan (subuh, dzuhur, ashar, maghrib, isya). */
  adzanHours: number[];
  adzanNames: string[];
  /** Congregational prayer starts this many minutes after the adzan and lasts this long. */
  jamaahDelayMinutes: number;
  jamaahMinutes: number;
  /** People walk in during this many minutes before a service. */
  gatherMinutes: number;
  services: Record<string, WorshipSlot[]>;
}

export type WorshipPhase = 'none' | 'gathering' | 'service';

/** The phase of worship for a religion at a moment (weekday 0 = Sunday, hour fractional). */
export function worshipPhase(religion: string, weekday: number, hour: number, cfg: WorshipConfig): WorshipPhase {
  if (religion === 'islam') {
    for (const h of cfg.adzanHours) {
      const start = h + cfg.jamaahDelayMinutes / 60;
      if (hour >= h && hour < start) return 'gathering';
      if (hour >= start && hour < start + cfg.jamaahMinutes / 60) return 'service';
    }
    return 'none';
  }
  for (const s of cfg.services[religion] ?? []) {
    if (!s.days.includes(weekday)) continue;
    if (hour >= s.from && hour < s.to) return 'service';
    if (hour >= s.from - cfg.gatherMinutes / 60 && hour < s.from) return 'gathering';
  }
  return 'none';
}

/** The adzan sounding at this hour, if any (its name: subuh, dzuhur...). */
export function adzanAt(hour: number, cfg: WorshipConfig): string | null {
  const i = cfg.adzanHours.indexOf(hour);
  return i >= 0 ? cfg.adzanNames[i] ?? null : null;
}

/** Fraction (0..1) through the current service, for keeping everyone's movements in step. */
export function serviceProgress(religion: string, weekday: number, hour: number, cfg: WorshipConfig): number {
  if (religion === 'islam') {
    for (const h of cfg.adzanHours) {
      const start = h + cfg.jamaahDelayMinutes / 60;
      if (hour >= start && hour < start + cfg.jamaahMinutes / 60) return (hour - start) / (cfg.jamaahMinutes / 60);
    }
    return 0;
  }
  for (const s of cfg.services[religion] ?? []) if (s.days.includes(weekday) && hour >= s.from && hour < s.to) return (hour - s.from) / (s.to - s.from);
  return 0;
}

/**
 * The next worship reminder after game minute `after` for a religion: at each adzan for Muslims,
 * an hour before a service for the others (half an hour before the daily Tri Sandhya).
 */
export function nextReminder(religion: string, after: number, weekdayOf: (minute: number) => number, cfg: WorshipConfig): { at: number; hour: number } | null {
  const DAY = 24 * 60;
  const day0 = Math.floor(after / DAY);
  for (let d = day0; d < day0 + 8; d++) {
    const wd = weekdayOf(d * DAY);
    const times: { at: number; hour: number }[] = [];
    if (religion === 'islam') for (const h of cfg.adzanHours) times.push({ at: d * DAY + h * 60, hour: h });
    else
      for (const s of cfg.services[religion] ?? []) {
        if (!s.days.includes(wd)) continue;
        const lead = s.days.length === 7 ? 0.5 : 1;
        times.push({ at: d * DAY + (s.from - lead) * 60, hour: s.from });
      }
    times.sort((a, b) => a.at - b.at);
    const hit = times.find((x) => x.at > after);
    if (hit) return hit;
  }
  return null;
}
