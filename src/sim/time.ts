// Game time is a whole number of in-game minutes since 1 January 2027 00:00.
// Pure functions only; no Date objects leak out (UTC is used internally so time zones never matter).

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * 60;

const EPOCH_MS = Date.UTC(2027, 0, 1);

export interface DateParts {
  year: number;
  /** 1..12 */
  month: number;
  /** 1..31 */
  day: number;
  hour: number;
  minute: number;
  /** 0 = Minggu (Sunday) .. 6 = Sabtu */
  weekday: number;
}

export function toParts(gameMinutes: number): DateParts {
  const d = new Date(EPOCH_MS + Math.floor(gameMinutes) * 60000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

/** Game minutes at the start of the given calendar day (month 1..12). */
export function fromDate(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return Math.round((Date.UTC(year, month - 1, day, hour, minute) - EPOCH_MS) / 60000);
}

/** Parses "YYYY-MM-DD". */
export function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`bad date ${iso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Parses "HH:MM" into minutes after midnight. */
export function parseClock(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`bad time ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function dayIndex(gameMinutes: number): number {
  return Math.floor(gameMinutes / MINUTES_PER_DAY);
}

export function minuteOfDay(gameMinutes: number): number {
  return ((gameMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** "MM-DD" key used for yearly-recurring dates. */
export function monthDayKey(month: number, day: number): string {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Whole months of service between two game times (calendar months, day-of-month aware). */
export function monthsBetween(from: number, to: number): number {
  const a = toParts(from);
  const b = toParts(to);
  let months = (b.year - a.year) * 12 + (b.month - a.month);
  if (b.day < a.day) months -= 1;
  return Math.max(0, months);
}
