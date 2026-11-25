import { applyActionEffects, stepsOf, type ActionBlock, type ActionDef, type ActionStep, type Buff, type Outfit } from './actions';
import { Inventory, type ItemDef } from './inventory';
import { Career, SKILLS, type CareerConfig, type CareerSave, type CareerEvent, type InterviewQuestion, type JobData, type Message, type SkillId } from './career';
import type { AutonomyConfig, AutonomyLevel } from './autonomy';
import type { Appearance, StartOption } from './characterSetup';
import { updateBodyDaily, type BodyConfig, type BodyState } from './body';
import { Calendar, type CalendarData, type FastingHours } from './calendar';
import { GameClock, type ClockConfig, type Speed } from './clock';
import { Wallet, type Transaction } from './money';
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
  start: { savings: number; groceries: Record<string, number> };
  autonomy: AutonomyConfig & { idleSecondsBeforeActing: number };
  startOptions: StartOption[];
  career: CareerConfig;
  skills: { max: number; traitKreatifFactor: number };
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
  minimumWage2026: number;
  streetMealPrice: number;
  industries: string[];
}

export interface SimData {
  config: SimConfig;
  calendar: CalendarData;
  religions: ReligionData[];
  cities: CityData[];
  items: ItemDef[];
  jobs: JobData[];
  interviewQuestions: InterviewQuestion[];
}

export type Activity = 'idle' | 'sleeping' | 'working' | 'exercising';

export interface RunningAction {
  def: ActionDef;
  steps: ActionStep[];
  /** Instance id of the object the player chose (for the renderer). */
  objectInstanceId: string;
  stepIndex: number;
  /** Minutes left in the current step. */
  remainingMinutes: number;
  /** Between steps: the character is walking to the next object; no effects, clock not fast. */
  waiting: boolean;
  /** Items used up when the action started (shown as props, e.g. what is being cooked). */
  usedItems: string[];
  /** Groceries delivered when the action finishes (shopping). */
  purchase?: Record<string, number>;
}

export interface ActionProgress {
  labelKey: string;
  /** 0..1 over the whole action. */
  fraction: number;
  /** Estimated game minutes left. */
  minutesLeft: number;
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
  outfit: Outfit;
  autonomy: AutonomyLevel;
  gender: 'male' | 'female';
  age: number;
  education: string;
  experienceYears: number;
  ownsMotorbike: boolean;
  /** Ethnicities whose traditions the character follows (both parents). */
  ethnicities: string[];
  appearance: Appearance;
  skills: Record<SkillId, number>;
}

export type SimEvent =
  | { kind: 'newDay'; holidays: string[]; ramadanStart: boolean }
  | { kind: 'salary'; payslip: Payslip }
  | { kind: 'thr'; amount: number }
  | { kind: 'bill'; amount: number; labelKey: string }
  | { kind: 'burnout' }
  | { kind: 'sick' }
  | { kind: 'actionDone'; actionId: string; objectInstanceId: string }
  | { kind: 'actionStep'; actionId: string; objectInstanceId: string; stepIndex: number }
  | { kind: 'shoppingDone'; items: Record<string, number> }
  | { kind: 'message'; message: Message }
  | { kind: 'hired' }
  | { kind: 'fired'; reason: 'warnings' | 'layoff'; severance: number };

export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  /** Real time (ms) of the save, for the slot list. */
  savedAt: number;
  clock: { minutes: number; speed: Speed };
  character: CharacterState;
  wallet: { balance: number; history: Transaction[] };
  inventory: Record<string, number>;
  career: CareerSave;
  book: {
    lastBilledMonth: string;
    lastPaidMonth: string;
    lastThrYear: number;
    burnoutActive: boolean;
    fullnessSum: number;
    minutesToday: number;
    exerciseMinutesToday: number;
  };
  rng: number;
  lastPayslip: Payslip | null;
}

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
    outfit: 'daily',
    autonomy: 'full',
    gender: 'male',
    age: 22,
    education: 'S1',
    experienceYears: 0,
    ownsMotorbike: false,
    ethnicities: ['jawa'],
    skills: { logika: 1, karisma: 0, kreatif: 0, masak: 0, fisik: 0 },
    appearance: {
      skinTone: '#be8c69',
      hair: 'Hair_SimpleParted',
      hairColor: '#1a1310',
      beard: false,
      hijab: false,
      shirtColor: '#f2c14e',
      longSleeve: false,
      pantsColor: '#2f3a52',
      shorts: false,
      shoesColor: '#f2f2f2',
    },
  };
}

export class GameSession {
  readonly clock: GameClock;
  readonly calendar: Calendar;
  readonly wallet: Wallet;
  readonly inventory: Inventory;
  readonly career: Career;
  readonly character: CharacterState;
  private readonly rng: Rng;
  private readonly cfg: SimConfig;

  // Bookkeeping so monthly events fire once.
  private lastBilledMonth: string;
  private lastPaidMonth = '';
  private lastThrYear = 0;
  private burnoutActive = false;
  private pendingBurnout = false;
  private pendingActionEvents: SimEvent[] = [];
  /** The action the character is performing right now, if any. */
  current: RunningAction | null = null;
  // Daily accumulators for the body update.
  private fullnessSum = 0;
  private minutesToday = 0;
  private exerciseMinutesToday = 0;

  constructor(private readonly data: SimData, character: CharacterState = defaultCharacter(), seed = 1, startSavings?: number) {
    this.cfg = data.config;
    this.clock = new GameClock(this.cfg.clock);
    this.calendar = new Calendar(data.calendar, this.cfg.fasting);
    this.wallet = new Wallet(startSavings ?? this.cfg.start.savings);
    this.inventory = new Inventory(data.items, this.cfg.start.groceries);
    this.character = character;
    this.character.skills ??= { logika: 0, karisma: 0, kreatif: 0, masak: 0, fisik: 0 };
    this.career = new Career(
      {
        now: () => this.clock.minutes,
        rng: () => this.rng(),
        cityMinimumWage: () => this.city.minimumWage2026,
        education: () => this.character.education,
        experienceYears: () => this.character.experienceYears,
        skills: () => this.character.skills,
        traits: () => this.character.traits,
        presentation: () => this.presentation(),
        pay: (amount, labelKey) => this.wallet.add(this.clock.minutes, amount, 'salary', labelKey),
        isPublicHoliday: (t) => this.calendar.isPublicHoliday(t),
      },
      data.jobs,
      this.cfg.career,
      () => this.city.industries,
    );
    // A job given directly (tests, old saves) becomes the career's job.
    const emp = character.employment;
    if (emp) {
      const company = data.jobs.find((j) => j.id === emp.jobId)?.companies[0] ?? 'PT Contoh';
      this.career.job = { jobId: emp.jobId, company, monthlyGross: emp.monthlyGross, startMinute: emp.startMinute, level: 0, levelSinceMinute: emp.startMinute, performance: 50, warnings: 0, absencesSinceWarning: 0, absentDaysThisMonth: emp.absentDaysThisMonth, leaveDaysLeft: this.cfg.career.annualLeaveDays, excusedDays: [], lastJudgedDay: -1 };
    }
    this.rng = createRng(seed);
    this.career.refreshListings(this.clock.minutes);
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
      const actionLeft = this.current && !this.current.waiting ? Math.max(this.current.remainingMinutes, 1e-6) : Infinity;
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

  /** Everything needed to continue this game later (the running action is not kept). */
  toSave(): SaveData {
    const c: CharacterState = JSON.parse(JSON.stringify(this.character));
    if (c.outfit === 'none') c.outfit = 'towel';
    c.activity = 'idle';
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      clock: { minutes: this.clock.minutes, speed: this.clock.speed },
      character: c,
      wallet: { balance: this.wallet.balance, history: this.wallet.history.slice(-200) },
      inventory: this.inventory.toSave(),
      career: JSON.parse(JSON.stringify(this.career.toSave())),
      book: {
        lastBilledMonth: this.lastBilledMonth,
        lastPaidMonth: this.lastPaidMonth,
        lastThrYear: this.lastThrYear,
        burnoutActive: this.burnoutActive,
        fullnessSum: this.fullnessSum,
        minutesToday: this.minutesToday,
        exerciseMinutesToday: this.exerciseMinutesToday,
      },
      rng: this.rng.getState(),
      lastPayslip: this.lastPayslip,
    };
  }

  /** Rebuilds a session from saved data. */
  static fromSave(data: SimData, save: SaveData): GameSession {
    if (save.version !== SAVE_VERSION) throw new Error(`unsupported save version ${save.version}`);
    const s = new GameSession(data, save.character, 1, save.wallet.balance);
    s.clock.minutes = save.clock.minutes;
    s.clock.speed = save.clock.speed;
    s.wallet.history.push(...save.wallet.history);
    s.inventory.restore(save.inventory);
    s.career.restore(save.career);
    s.lastBilledMonth = save.book.lastBilledMonth;
    s.lastPaidMonth = save.book.lastPaidMonth;
    s.lastThrYear = save.book.lastThrYear;
    s.burnoutActive = save.book.burnoutActive;
    s.fullnessSum = save.book.fullnessSum;
    s.minutesToday = save.book.minutesToday;
    s.exerciseMinutesToday = save.book.exerciseMinutesToday;
    s.rng.setState(save.rng);
    s.lastPayslip = save.lastPayslip;
    s.character.mood = s.currentMood();
    return s;
  }

  /** Last payslip (for the M-Banking app). */
  lastPayslip: Payslip | null = null;

  private pushCareer(out: CareerEvent[], events: SimEvent[]): void {
    for (const e of out) {
      if (e.kind === 'message') events.push({ kind: 'message', message: e.message });
      else if (e.kind === 'hired') events.push({ kind: 'hired' });
      else events.push({ kind: 'fired', reason: e.reason, severance: e.severance });
    }
  }

  /** First impression at an interview (0..100): hygiene, mood and tidy clothes. */
  presentation(): number {
    const c = this.character;
    const tidy = c.outfit === 'daily' ? (c.appearance.longSleeve ? 20 : 12) : 0;
    return Math.min(100, c.vitals.needs.bersih * 0.5 + c.mood * 0.3 + tidy);
  }

  /** Actions offered at the front door right now (work, interview) besides the data ones. */
  doorActions(interviewAction: ActionDef): ActionDef[] {
    const list: ActionDef[] = [];
    const work = this.career.workAction(this.clock.minutes);
    if (work) list.push(work);
    if (this.career.interviewNow()) list.push(interviewAction);
    return list;
  }

  private flushActionDone(events: SimEvent[]): void {
    if (this.pendingActionEvents.length === 0) return;
    events.push(...this.pendingActionEvents);
    this.pendingActionEvents = [];
  }

  /** Why an action cannot start right now, or null if it can. */
  actionBlock(def: ActionDef): ActionBlock {
    if (def.isEating && !this.canEat()) return 'fasting';
    if ((def.cost ?? 0) > 0 && this.wallet.balance < (def.cost ?? 0)) return 'money';
    if (def.consumes && this.inventory.countCategory(def.consumes.category) < def.consumes.qty) return 'noFood';
    return null;
  }

  /**
   * Starts an action (the character has arrived at its first object). Pays the cost and uses up
   * items. Returns false if blocked. `purchase`: groceries delivered when it finishes (shopping).
   */
  startAction(def: ActionDef, objectInstanceId: string, purchase?: Record<string, number>): boolean {
    if (this.actionBlock(def)) return false;
    if (this.current) this.cancelAction();
    const cost = purchase ? this.inventory.priceOf(purchase) : def.cost ?? 0;
    if (purchase && this.wallet.balance < cost) return false;
    if (cost) this.wallet.add(this.clock.minutes, -cost, purchase || def.isEating ? 'food' : 'other', def.labelKey);
    const usedItems = def.consumes ? this.inventory.take(def.consumes.category, def.consumes.qty) ?? [] : [];
    if (def.id === 'go_work') {
      const out: CareerEvent[] = [];
      this.career.startShift(this.clock.minutes, out);
      this.pushCareer(out, this.pendingActionEvents);
    }
    const steps = stepsOf(def);
    this.current = { def, steps, objectInstanceId, stepIndex: 0, remainingMinutes: steps[0].durationMinutes, waiting: false, usedItems, purchase };
    this.applyStepState();
    return true;
  }

  /** The step currently running (or about to run, while walking between steps). */
  get currentStep(): ActionStep | null {
    return this.current ? this.current.steps[this.current.stepIndex] : null;
  }

  /** The character reached the object of the next step. */
  continueAction(): void {
    if (!this.current?.waiting) return;
    this.current.waiting = false;
    this.applyStepState();
  }

  private applyStepState(): void {
    const a = this.current;
    const step = this.currentStep;
    if (!a || !step) return;
    if (!a.waiting && step.outfit) this.character.outfit = step.outfit;
    this.character.activity = a.waiting ? 'idle' : step.activity ?? 'idle';
    this.clock.fastForward = !a.waiting && a.def.fastForward === true;
  }

  /** Stops the running action without its completion buff (items already used are not returned). */
  cancelAction(): void {
    if (!this.current) return;
    this.current = null;
    // Never leave the character undressed: grab the towel.
    if (this.character.outfit === 'none') this.character.outfit = 'towel';
    this.character.activity = 'idle';
    this.clock.fastForward = false;
  }

  /** Progress over the whole action, for the progress bar. */
  progress(): ActionProgress | null {
    const a = this.current;
    if (!a) return null;
    const total = a.steps.reduce((s, st) => s + st.durationMinutes, 0);
    let done = 0;
    for (let i = 0; i < a.stepIndex; i++) done += a.steps[i].durationMinutes;
    const step = a.steps[a.stepIndex];
    let stepDone = step.durationMinutes - a.remainingMinutes;
    let stepLeft = a.remainingMinutes;
    // Steps that end when a need is full: estimate from the need's level and rate.
    const need = step.endWhenFull;
    const rate = need ? step.needsPerHour?.[need] ?? 0 : 0;
    if (need && rate > 0) {
      const left = Math.min(a.remainingMinutes, ((100 - this.character.vitals.needs[need]) / rate) * 60);
      stepLeft = left;
      stepDone = step.durationMinutes - a.remainingMinutes;
      const plannedTotal = total - step.durationMinutes + stepDone + left;
      let later = 0;
      for (let i = a.stepIndex + 1; i < a.steps.length; i++) later += a.steps[i].durationMinutes;
      return { labelKey: a.def.labelKey, fraction: Math.min(1, (done + stepDone) / Math.max(1, plannedTotal)), minutesLeft: left + later };
    }
    let later = 0;
    for (let i = a.stepIndex + 1; i < a.steps.length; i++) later += a.steps[i].durationMinutes;
    return { labelKey: a.def.labelKey, fraction: Math.min(1, (done + stepDone) / Math.max(1, total)), minutesLeft: stepLeft + later };
  }

  /** Ends the current step: moves to the next one (waiting for the walk) or finishes. */
  private endStep(): void {
    const a = this.current;
    if (!a) return;
    if (a.stepIndex + 1 < a.steps.length) {
      a.stepIndex += 1;
      a.remainingMinutes = a.steps[a.stepIndex].durationMinutes;
      a.waiting = true;
      this.applyStepState();
      this.pendingActionEvents.push({ kind: 'actionStep', actionId: a.def.id, objectInstanceId: a.objectInstanceId, stepIndex: a.stepIndex });
      return;
    }
    this.finishAction();
  }

  private finishAction(): void {
    const done = this.current;
    if (!done) return;
    if (done.purchase) {
      for (const [id, n] of Object.entries(done.purchase)) if (n > 0) this.inventory.add(id, n);
      this.pendingActionEvents.push({ kind: 'shoppingDone', items: done.purchase });
    }
    const buff = done.def.buff;
    if (buff) {
      const c = this.character;
      c.buffs = c.buffs.filter((b) => b.id !== buff.id);
      c.buffs.push({ id: buff.id, mood: buff.mood, until: this.clock.minutes + buff.hours * MINUTES_PER_HOUR });
    }
    this.cancelAction();
    this.pendingActionEvents.push({ kind: 'actionDone', actionId: done.def.id, objectInstanceId: done.objectInstanceId });
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
    if (action && !action.waiting) {
      const step = action.steps[action.stepIndex];
      applyActionEffects(c.vitals, step, minutes / MINUTES_PER_HOUR);
      if (step.skillsPerHour) {
        for (const k of SKILLS) {
          const rate = step.skillsPerHour[k];
          if (!rate) continue;
          const factor = k === 'kreatif' && c.traits.includes('kreatif') ? this.cfg.skills.traitKreatifFactor : 1;
          c.skills[k] = Math.min(this.cfg.skills.max, c.skills[k] + rate * factor * (minutes / MINUTES_PER_HOUR));
        }
      }
      action.remainingMinutes -= minutes;
      const full = step.endWhenFull !== undefined && c.vitals.needs[step.endWhenFull] >= 100;
      if (action.remainingMinutes <= 1e-6 || full) this.endStep();
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
    const careerOut: CareerEvent[] = [];
    this.career.checkAbsence(t, careerOut);
    this.pushCareer(careerOut, events);
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

    const careerOut: CareerEvent[] = [];
    this.career.onNewDay(t, careerOut);
    this.pushCareer(careerOut, events);

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

    void c;
    const job = this.career.job;
    if (job && p.day === this.cfg.payroll.salaryDay && monthKey !== this.lastPaidMonth) {
      this.lastPaidMonth = monthKey;
      const payslip = computePayslip(job.monthlyGross, this.cfg.payroll, { workDays: this.career.workDaysInMonth(t), absentDays: job.absentDaysThisMonth });
      this.wallet.add(t, payslip.net, 'salary', 'tx.salary');
      this.lastPayslip = payslip;
      this.career.afterPayday();
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

  get cfgAutonomy(): SimConfig['autonomy'] {
    return this.cfg.autonomy;
  }

  /** Whether the character may eat right now (Ramadan fasting hours). */
  canEat(): boolean {
    const c = this.character;
    return this.calendar.canEat(this.clock.minutes, c.religionId, c.fastingEnabled);
  }
}
