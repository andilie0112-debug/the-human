import { fromDate, parseIsoDate } from './time';

export type Speed = 0 | 1 | 2 | 3;

export interface ClockConfig {
  startDate: string;
  startHour: number;
  gameMinutesPerRealSecondAt1x: number;
  fastForwardMultiplier: number;
}

/** The single game clock. Pause, 1x, 2x, 3x, plus fast-forward for sleep and work. */
export class GameClock {
  /** In-game minutes since 2027-01-01 00:00 (may be fractional between ticks). */
  minutes: number;
  speed: Speed = 1;
  fastForward = false;

  constructor(private readonly config: ClockConfig, startMinutes?: number) {
    const d = parseIsoDate(config.startDate);
    this.minutes = startMinutes ?? fromDate(d.year, d.month, d.day, config.startHour);
  }

  /** Game minutes that pass for the given real seconds at the current speed. */
  gameMinutesFor(realSeconds: number): number {
    if (this.speed === 0) return 0;
    const ff = this.fastForward ? this.config.fastForwardMultiplier : 1;
    return realSeconds * this.config.gameMinutesPerRealSecondAt1x * this.speed * ff;
  }

  /** Advances the clock; returns the number of game minutes that passed. */
  advance(realSeconds: number): number {
    const dm = this.gameMinutesFor(realSeconds);
    this.minutes += dm;
    return dm;
  }
}
