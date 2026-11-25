import { applyActionEffects, type ActionBlock, type ActionDef, type Buff } from './actions';
import { updateBodyDaily, type BodyConfig, type BodyState } from './body';
import { Calendar, type CalendarData, type FastingHours } from './calendar';
import { GameClock, type ClockConfig } from './clock';
import { Wallet } from './money';
import { computeMood, freshVitals, isBurnedOut, rollSickness, updateVitals, type MoodConfig, type NeedsConfig, type Vitals } from './needs';
import { computePayslip, thrAmount, type PayrollConfig, type Payslip } from './payroll';
import { createRng, type Rng } from './rng';
import { MINUTES_PER_HOUR, fromDate, monthsBetween, parseIsoDate, toParts } from './time';

// The persistent simulation state. Rendering and UI read from it and send commands; it never
// touches three.js or the DOM.

export interface SimConfig {
  clock: ClockConfig;
  needs: NeedsConfig;
  mood: MoodConfig;
  body: BodyConfig;
  payroll: PayrollConfig;
  bills: { billDay: number; mobileDataMonthly: number };
  fasting: FastingHours;
  start: { savings: number };
}

export interface ReligionData {
  id: string;
  mainHolidayDate2027: string;
  thrPaidDaysBefore: number;
}

export interface CityData {
  id: string;
  boardingRoomRentMonthly: number;
  hotClimate: boolean;
}

export interface SimData {
  config: SimConfig;
  calendar: CalendarData;
  religions: ReligionData[];
  cities: CityData[];
}

export type Activity = 'idle' | 'sleeping' | 'working' | 'exercising';

export interface RunningAction {
  def: ActionDef;
  /** Instance id of the object it runs on (for the renderer). */
  objectInstanceId: string;
  remainingMinutes: number;
}

export interface Employment {
  jobId: string;
  monthlyGross: number;
  /** Game minute the job started (for THR proration). */
  startMinute: number;
  workDaysThisMonth: number;
  absentDaysThisMonth: number;
}

export interface CharacterState {
  name: string;
  religionId: string;
  cityId: string;
  traits: string[];
  /** Lives outside the parents' home region: homesickness grows. */
  perantau: boolean;
  /** Muslim characters may choose to fast during Ramadan. */
  fastingEnabled: boolean;
  /** Fan or AC in the room (cancels the hot-climate need penalty). */
  hasCooling: boolean;
  activity: Activity;
  vitals: Vitals;
  body: BodyState;
  employment: Employment | null;
  mood: number;
  buffs: Buff[];
}

export type SimEvent =
  | { kind: 'newDay'; holidays: string[]; ramadanStart: boolean }
  | { kind: 'salary'; payslip: Payslip }
  | { kind: 'thr'; amount: number }
  | { kind: 'bill'; amount: number; labelKey: string }
  | { kind: 'burnout' }
  | { kind: 'sick' }
  | { kind: 'actionDone'; actionId: string; objectInstanceId: string };

export function defaultCharacter(): CharacterState {
  return {
    name: 'Kamu',
    religionId: 'islam',
    cityId: 'jkt',
    traits: [],
    perantau: false,
    fastingEnabled: true,
    hasCooling: false,
    activity: 'idle',
    vitals: freshVitals(),
    body: { muscle: 0.1, fat: 0.3 },
    employment: null,
    mood: 70,
    buffs: [],
  };
}

export class GameSession {
  readonly clock: GameClock;
  readonly calendar: Calendar;
  readonly wallet: Wallet;
  readonly character: CharacterState;
  private readonly rng: Rng;
  private readonly cfg: SimConfig;

  // Bookkeeping so monthly events fire once.
  private lastBilledMonth: string;
  private lastPaidMonth = '';
  private lastThrYear = 0;
  private burnoutActive = false;
  private pendingBurnout = false;
  private pendingActionDone: RunningAction | null = null;
  /** The action the character is performing right now, if any. */
  current: RunningAction | null = null;
  // Daily accumulators for the body update.
  private fullnessSum = 0;
  private minutesToday = 0;
  private exerciseMinutesToday = 0;

  constructor(private readonly data: SimData, character: CharacterState = defaultCharacter(), seed = 1) {
    this.cfg = data.config;
    this.clock = new GameClock(this.cfg.clock);
    this.calendar = new Calendar(data.calendar, this.cfg.fasting);
    this.wallet = new Wallet(this.cfg.start.savings);
    this.character = character;
    this.rng = createRng(seed);
    // The first month's rent is already paid when the game starts.
    const p = toParts(this.clock.minutes);
    this.lastBilledMonth = `${p.year}-${p.month}`;
    this.character.mood = this.currentMood();
  }

  get city(): CityData {
    const c = this.data.cities.find((x) => x.id === this.character.cityId);
    if (!c) throw new Error(`unknown city ${this.character.cityId}`);
    return c;
  }

  /** Real-time tick from the game loop. */
  tick(realSeconds: number): SimEvent[] {
    return this.simulate(this.clock.gameMinutesFor(realSeconds));
  }

  /** Advances the simulation by a number of game minutes, firing hourly and daily rules. */
  simulate(gameMinutes: number): SimEvent[] {
    const events: SimEvent[] = [];
    let remaining = gameMinutes;
    while (remaining > 1e-9) {
      const now = this.clock.minutes;
      const nextHour = (Math.floor(now / MINUTES_PER_HOUR + 1e-9) + 1) * MINUTES_PER_HOUR;
      // Never step past the end of the running action, so its effects stop exactly on time.
      const actionLeft = this.current ? Math.max(this.current.remainingMinutes, 1e-6) : Infinity;
      const step = Math.min(remaining, nextHour - now, actionLeft);
      this.integrate(step);
      this.clock.minutes = now + step;
      remaining -= step;
      if (Math.abs(this.clock.minutes - nextHour) < 1e-6) {
        this.clock.minutes = nextHour;
        this.onHour(nextHour, events);
      }
    }
    this.flushActionDone(events);
    this.character.mood = this.currentMood();
    return events;
  }

  private flushActionDone(events: SimEvent[]): void {
    const done = this.pendingActionDone;
    if (!done) return;
    this.pendingActionDone = null;
    events.push({ kind: 'actionDone', actionId: done.def.id, objectInstanceId: done.objectInstanceId });
  }

  /** Why an action cannot start right now, or null if it can. */
  actionBlock(def: ActionDef): ActionBlock {
    if (def.isEating && !this.canEat()) return 'fasting';
    if ((def.cost ?? 0) > 0 && this.wallet.balance < (def.cost ?? 0)) return 'money';
    return null;
  }

  /** Starts an action now (the character has arrived at the object). Returns false if blocked. */
  startAction(def: ActionDef, objectInstanceId: string): boolean {
    if (this.actionBlock(def)) return false;
    if (this.current) this.cancelAction();
    if (def.cost) this.wallet.add(this.clock.minutes, -def.cost, def.isEating ? 'food' : 'other', def.labelKey);
    this.current = { def, objectInstanceId, remainingMinutes: def.durationMinutes };
    this.character.activity = def.activity ?? 'idle';
    this.clock.fastForward = def.fastForward === true;
    return true;
  }

  /** Stops the running action without its completion buff. */
  cancelAction(): void {
    if (!this.current) return;
    this.current = null;
    this.character.activity = 'idle';
    this.clock.fastForward = false;
  }

  private finishAction(): void {
    const done = this.current;
    if (!done) return;
    const buff = done.def.buff;
    if (buff) {
      const c = this.character;
      c.buffs = c.buffs.filter((b) => b.id !== buff.id);
      c.buffs.push({ id: buff.id, mood: buff.mood, until: this.clock.minutes + buff.hours * MINUTES_PER_HOUR });
    }
    this.cancelAction();
    this.pendingActionDone = done;
  }

  /** Continuous rules over `minutes` of game time. */
  private integrate(minutes: number): void {
    const c = this.character;
    const fasting = c.religionId === 'islam' && c.fastingEnabled && this.calendar.isFastingTime(this.clock.minutes);
    updateVitals(c.vitals, minutes / MINUTES_PER_HOUR, {
      sleeping: c.activity === 'sleeping',
      working: c.activity === 'working',
      hotRoom: this.city.hotClimate && !c.hasCooling,
      fasting,
      traits: c.traits,
    }, this.cfg.needs);
    if (c.activity === 'exercising') this.exerciseMinutesToday += minutes;
    const action = this.current;
    if (action) {
      applyActionEffects(c.vitals, action.def, minutes / MINUTES_PER_HOUR);
      action.remainingMinutes -= minutes;
      const full = action.def.endWhenFull !== undefined && c.vitals.needs[action.def.endWhenFull] >= 100;
      if (action.remainingMinutes <= 1e-6 || full) this.finishAction();
    }
    this.fullnessSum += c.vitals.needs.kenyang * minutes;
    this.minutesToday += minutes;

    if (isBurnedOut(c.vitals, this.cfg.needs)) {
      if (!this.burnoutActive) this.pendingBurnout = true;
      this.burnoutActive = true;
    } else if (c.vitals.stress < this.cfg.needs.burnoutStress - 15) {
      this.burnoutActive = false;
    }
  }

  private onHour(t: number, events: SimEvent[]): void {
    this.flushActionDone(events);
    const p = toParts(t);
    if (this.pendingBurnout) {
      events.push({ kind: 'burnout' });
      this.pendingBurnout = false;
    }
    if (p.hour === 0) this.onNewDay(t, events);
    if (p.hour === this.cfg.payroll.paymentHour) this.onPaymentHour(t, events);
  }

  private onNewDay(t: number, events: SimEvent[]): void {
    const c = this.character;
    // Close the previous day.
    const averageFullness = this.minutesToday > 0 ? this.fullnessSum / this.minutesToday : c.vitals.needs.kenyang;
    updateBodyDaily(c.body, { averageFullness, exerciseHours: this.exerciseMinutesToday / 60 }, c.traits, this.cfg.body);
    this.fullnessSum = 0;
    this.minutesToday = 0;
    this.exerciseMinutesToday = 0;
    if (c.perantau) c.vitals.kangen = Math.min(100, c.vitals.kangen + this.cfg.needs.kangenPerDay);
    if (rollSickness(c.vitals, this.cfg.needs, this.rng())) events.push({ kind: 'sick' });

    const ramadanStart = this.calendar.isRamadan(t) && !this.calendar.isRamadan(t - 1);
    events.push({ kind: 'newDay', holidays: this.calendar.holidaysOn(t).map((h) => h.name), ramadanStart });
  }

  private onPaymentHour(t: number, events: SimEvent[]): void {
    const p = toParts(t);
    const monthKey = `${p.year}-${p.month}`;
    const c = this.character;

    if (p.day === this.cfg.bills.billDay && monthKey !== this.lastBilledMonth) {
      this.lastBilledMonth = monthKey;
      const rent = this.city.boardingRoomRentMonthly;
      this.wallet.add(t, -rent, 'rent', 'tx.rent');
      events.push({ kind: 'bill', amount: rent, labelKey: 'tx.rent' });
      this.wallet.add(t, -this.cfg.bills.mobileDataMonthly, 'bill', 'tx.mobileData');
      events.push({ kind: 'bill', amount: this.cfg.bills.mobileDataMonthly, labelKey: 'tx.mobileData' });
    }

    const job = c.employment;
    if (job && p.day === this.cfg.payroll.salaryDay && monthKey !== this.lastPaidMonth) {
      this.lastPaidMonth = monthKey;
      const payslip = computePayslip(job.monthlyGross, this.cfg.payroll, { workDays: job.workDaysThisMonth, absentDays: job.absentDaysThisMonth });
      this.wallet.add(t, payslip.net, 'salary', 'tx.salary');
      job.absentDaysThisMonth = 0;
      events.push({ kind: 'salary', payslip });
    }

    if (job && p.year !== this.lastThrYear && this.isThrDay(t)) {
      this.lastThrYear = p.year;
      const amount = thrAmount(job.monthlyGross, monthsBetween(job.startMinute, t));
      if (amount > 0) {
        this.wallet.add(t, amount, 'thr', 'tx.thr');
        events.push({ kind: 'thr', amount });
      }
    }
  }

  /** THR is paid `thrPaidDaysBefore` days before the character's own religion's main holiday. */
  isThrDay(t: number): boolean {
    const r = this.data.religions.find((x) => x.id === this.character.religionId);
    if (!r) return false;
    const p = toParts(t);
    const h = parseIsoDate(r.mainHolidayDate2027);
    const holiday = fromDate(p.year, h.month, h.day);
    const thrDay = toParts(holiday - r.thrPaidDaysBefore * 24 * 60);
    return thrDay.month === p.month && thrDay.day === p.day;
  }

  private currentMood(): number {
    const c = this.character;
    c.buffs = c.buffs.filter((b) => b.until > this.clock.minutes);
    const buffMood = c.buffs.reduce((sum, b) => sum + b.mood, 0);
    return Math.min(100, Math.max(0, computeMood(c.vitals, this.cfg.mood, { negativeBalance: this.wallet.balance < 0 }) + buffMood));
  }

  /** Whether the character may eat right now (Ramadan fasting hours). */
  canEat(): boolean {
    const c = this.character;
    return this.calendar.canEat(this.clock.minutes, c.religionId, c.fastingEnabled);
  }
}
