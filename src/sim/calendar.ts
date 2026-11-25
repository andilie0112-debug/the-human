import { minuteOfDay, monthDayKey, parseClock, parseIsoDate, toParts } from './time';

// Yearly calendar. The prototype data only has 2027 dates; they are reused every year (flagged in data).

export interface HolidayEntry {
  date: string;
  name: string;
  publicHoliday: boolean;
}

export interface CalendarData {
  ramadan2027: { start: string; end: string };
  holidays: HolidayEntry[];
}

export interface FastingHours {
  start: string;
  end: string;
}

export class Calendar {
  private readonly byDay = new Map<string, HolidayEntry[]>();
  private readonly ramadanStart: string;
  private readonly ramadanEnd: string;
  private readonly fastStart: number;
  private readonly fastEnd: number;

  constructor(data: CalendarData, fasting: FastingHours) {
    for (const h of data.holidays) {
      const d = parseIsoDate(h.date);
      const key = monthDayKey(d.month, d.day);
      this.byDay.set(key, [...(this.byDay.get(key) ?? []), h]);
    }
    const s = parseIsoDate(data.ramadan2027.start);
    const e = parseIsoDate(data.ramadan2027.end);
    this.ramadanStart = monthDayKey(s.month, s.day);
    this.ramadanEnd = monthDayKey(e.month, e.day);
    this.fastStart = parseClock(fasting.start);
    this.fastEnd = parseClock(fasting.end);
  }

  holidaysOn(gameMinutes: number): HolidayEntry[] {
    const p = toParts(gameMinutes);
    return this.byDay.get(monthDayKey(p.month, p.day)) ?? [];
  }

  isPublicHoliday(gameMinutes: number): boolean {
    return this.holidaysOn(gameMinutes).some((h) => h.publicHoliday);
  }

  isRamadan(gameMinutes: number): boolean {
    const p = toParts(gameMinutes);
    const key = monthDayKey(p.month, p.day);
    return key >= this.ramadanStart && key <= this.ramadanEnd;
  }

  /** True during fasting hours on a Ramadan day (04:30 to 18:00 by default). */
  isFastingTime(gameMinutes: number): boolean {
    if (!this.isRamadan(gameMinutes)) return false;
    const m = minuteOfDay(gameMinutes);
    return m >= this.fastStart && m < this.fastEnd;
  }

  /** Whether a character may eat now. Only Muslim characters who chose to fast are restricted. */
  canEat(gameMinutes: number, religionId: string, fastingEnabled: boolean): boolean {
    if (religionId !== 'islam' || !fastingEnabled) return true;
    return !this.isFastingTime(gameMinutes);
  }
}
