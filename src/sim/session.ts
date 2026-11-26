import { diagnose, patientPays, registrationFee, waitMinutes, type Diagnosis, type Payer, type Treatment } from './health';
import { commitOffence, fadeWanted, fineFor, jailDaysFor, newCrimeState, settleArrest, skckBlocked, type CrimeConfig, type CrimeState, type Offence } from './crime';
import { dailyTasks, type DailyTask, type DoneTag } from './dailyTasks';
import { applyActionEffects, stepsOf, type ActionBlock, type ActionDef, type ActionStep, type Buff, type Outfit } from './actions';
import { Inventory, type ItemDef } from './inventory';
import { applyNeedEffects, pickEvent, traditionsToday, type Choice, type Effects, type EventDef, type TraditionDef } from './events';
import { dayProfit, nextReputation, type BusinessConfig, type BusinessState } from './business';
import { dayWeather, travelFactor, weatherAt, type DayWeather, type WeatherConfig, type WeatherNow } from './weather';
import { decay as decaySocial, ensureTopics, makeNpc, reactionTo, relLevel, socialBlock, type NameData, type Npc, type SocialAction, type SocialConfig, type TopicReaction } from './social';
import { checkPlacement, fengShui, mortgageBlock, mortgageQuote, paylaterInstalment, type Debt, type FengShuiResult, type FinanceConfig, type LayoutShape, type MortgageBlock, type Placement, type PlacementProblem } from './home';
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
import { MINUTES_PER_HOUR, fromDate, monthsBetween, parseIsoDate, toParts, dayIndex } from './time';

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
  finance: FinanceConfig;
  travel: { baseFare: number; farePer10m: number; baseMinutes: number; minutesPer10m: number; motorbikePrice: number; carPriceUsed: number; carPriceNew: number; carFuelShare: number; carParking: number };
  events: { dailyChance: number; eventHour: number; traditionHour: number; angpaoReceive: number; angpaoGive: number; arisanFee: number; arisanWin: number; arisanWinChance: number; investmentReturn: number; investmentSuccess: number; investmentDays: number };
  social: SocialConfig;
  weather: WeatherConfig;
  delivery: DeliveryConfig;
  business: BusinessConfig;
  crime: CrimeConfig;
  health: { bpjsMandiriMonthly: number; insuranceMonthly: number };
  buffs: Record<string, { mood: number; hours: number }>;
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
  name: string;
  publicTransport: string[];
  signatureFood: string;
  localGreeting: string;
  /** Neighbourhood flavour (stage 4): district, landmarks and street food of the city. */
  district?: string;
  mall?: string;
  hospital?: string;
  station?: string;
  transit?: string;
  angkot?: boolean;
  angkotColor?: string;
  cart?: string[];
  /** Commuter train destinations from the local station. */
  trainLines?: string[];
}

export interface SimData {
  config: SimConfig;
  calendar: CalendarData;
  religions: ReligionData[];
  cities: CityData[];
  items: ItemDef[];
  jobs: JobData[];
  interviewQuestions: InterviewQuestion[];
  objects: HomeObjectData[];
  layouts: Record<string, HomeLayoutData>;
  events: EventDef[];
  traditions: TraditionDef[];
  names: NameData;
  ethnicities: { id: string; name: string; hometownRegion: string; mudikTicketCost: number; weddingCeremony: string }[];
  trips: { destination: string; cost: number; days: number; mode?: 'kereta' | 'pesawat' }[];
}

/** A life event or tradition waiting for the player to choose. */
export interface PendingEvent {
  id: string;
  titleKey: string;
  textKey: string;
  choices: Choice[];
}

/** What the simulation needs to know about a furniture type. */
export interface HomeObjectData {
  id: string;
  model: string;
  footprint: [number, number];
  walkOn?: boolean;
  againstWall?: boolean;
  price?: number;
  fixture?: boolean;
  /** A fan or AC: the room no longer counts as hot. */
  cooling?: boolean;
}

export interface HomeLayoutData extends LayoutShape {
  rentFactor: number;
  objects: Placement[];
}

export interface HomeState {
  layoutId: string;
  placements: Placement[];
  /** Object ids bought or picked up and not placed. */
  storage: string[];
  debts: Debt[];
  /** A house being built on the family land (tanah), finished at this game minute. */
  construction?: { doneAt: number } | null;
}

export type HouseMoveBlock = MortgageBlock | 'money' | 'same' | null;

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
  actionId: string;
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
  /** Owns a car (and its colour). */
  ownsCar?: boolean;
  carColor?: string;
  /** Ethnicities whose traditions the character follows (both parents). */
  ethnicities: string[];
  appearance: Appearance;
  skills: Record<SkillId, number>;
  married?: boolean;
  /** Has an SKCK from the police (asked by many employers). */
  skck?: boolean;
  /** Self-paid BPJS Kesehatan (kelas 3) when not covered by an employer. */
  bpjsMandiri?: boolean;
  /** Private health insurance policy. */
  asuransi?: boolean;
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
  | { kind: 'fired'; reason: 'warnings' | 'layoff'; severance: number }
  | { kind: 'lifeEvent' }
  | { kind: 'tradition'; textKey: string; params?: Record<string, string | number> }
  | { kind: 'met'; name: string }
  | { kind: 'houseBuilt' }
  | { kind: 'social'; textKey: string; params: Record<string, string | number> }
  /** A relationship moved up or down a level (kenalan, teman, sahabat...). */
  | { kind: 'relLevel'; name: string; level: number; up: boolean }
  /** Someone is at the door. */
  | { kind: 'visit'; npcId: string; name: string }
  /** The rain starts or stops, or the street floods. */
  | { kind: 'weather'; raining: boolean; flooded: boolean }
  /** A food delivery reached the door. */
  | { kind: 'delivery'; items: Record<string, number> }
  /** The side business booked a day's profit (or loss). */
  | { kind: 'business'; nameKey: string; profit: number };

export interface PendingVisit {
  npcId: string;
  until: number;
  /** Set once the player lets them in. */
  inside: boolean;
}

export interface DeliveryConfig {
  fee: number;
  rainFee: number;
  minMinutes: number;
  maxMinutes: number;
  rainExtraMinutes: number;
  restaurants: { id: string; nameKey: string; dishes: string[] }[];
}

export interface Delivery {
  items: Record<string, number>;
  arriveAt: number;
}

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
    doneToday?: DoneTag[];
  };
  crime?: CrimeState;
  rng: number;
  lastPayslip: Payslip | null;
  home?: HomeState;
  npcs?: Npc[];
  pendingEvent?: PendingEvent | null;
  pendingVisit?: PendingVisit | null;
  floodDay?: number;
  deliveries?: Delivery[];
  business?: BusinessState | null;
  arisanMember?: boolean;
  investments?: { amount: number; due: number }[];
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
  home: HomeState;
  npcs: Npc[] = [];
  pendingEvent: PendingEvent | null = null;
  /** Set by the game while the character is out in the street (gets wet in the rain). */
  outdoors = false;
  /** The side business, if any. */
  business: BusinessState | null = null;
  /** Food orders on their way. */
  deliveries: Delivery[] = [];
  /** Day (index) the street floods because of a flood event, besides heavy rain. */
  floodDay = -1;
  private lastWeather: WeatherNow = { raining: false, intensity: 0, flooded: false };
  /** A visitor knocking at the door, waiting for an answer until `until`. */
  pendingVisit: PendingVisit | null = null;
  arisanMember = false;
  investments: { amount: number; due: number }[] = [];
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
  /** Wanted level, criminal record and jail time. */
  crime: CrimeState = newCrimeState();

  /** Commits an offence (`chanceFactor` > 1 when more people are watching). Returns true if seen. */
  commitCrime(offence: Offence, chanceFactor = 1): boolean {
    const seen = commitOffence(this.crime, offence, this.clock.minutes, this.rng(), this.cfg.crime, chanceFactor);
    // A guilty conscience, whether seen or not.
    this.character.vitals.stress = Math.min(100, this.character.vitals.stress + (seen ? 15 : 8));
    return seen;
  }

  /** A random yes/no with the given probability (uses the saved random sequence). */
  chance(p: number): boolean {
    return this.rng() < p;
  }

  /** Picks a pocket: some cash if it works (it may also be noticed). */
  pickpocket(): { seen: boolean; loot: number } {
    const seen = this.commitCrime('copet');
    const loot = seen ? 0 : 50000 + Math.floor(this.rng() * 26) * 10000;
    if (loot > 0) this.wallet.add(this.clock.minutes, loot, 'other', 'tx.copet');
    return { seen, loot };
  }

  fine(): number {
    return fineFor(this.crime, this.cfg.crime);
  }

  jailDays(): number {
    return jailDaysFor(this.crime, this.cfg.crime);
  }

  /**
   * Arrested by the police: pay the fine (if you can and want to) or serve the jail time, which
   * runs as an away action (work days are missed, without leave).
   */
  arrest(choice: 'denda' | 'penjara'): ActionDef | null {
    if (choice === 'denda' && this.wallet.balance >= this.fine()) {
      this.wallet.add(this.clock.minutes, -this.fine(), 'other', 'tx.fine');
      settleArrest(this.crime, 'denda', this.clock.minutes, 0);
      this.character.vitals.stress = Math.min(100, this.character.vitals.stress + 10);
      return null;
    }
    const days = this.jailDays();
    settleArrest(this.crime, 'penjara', this.clock.minutes, days * 24 * 60);
    this.cancelAction();
    return { id: 'jail', labelKey: 'act.jail', durationMinutes: days * 24 * 60, fastForward: true, animation: 'away', needsPerHour: { sosial: -1, hiburan: -2 }, stressPerHour: 0.8 };
  }

  // --- Health care: BPJS, insurance and hospital visits ------------------------------------

  /** BPJS Kesehatan is active through an employer or as a self-paid member. */
  bpjsActive(): boolean {
    return this.career.job !== null || this.character.bpjsMandiri === true;
  }

  payerOptions(): Payer[] {
    const out: Payer[] = [];
    if (this.bpjsActive()) out.push('bpjs');
    if (this.character.asuransi) out.push('asuransi');
    out.push('umum');
    return out;
  }

  registerBpjsMandiri(): void {
    this.character.bpjsMandiri = true;
  }

  buyInsurance(): void {
    this.character.asuransi = true;
  }

  /** Registration at the hospital desk: admin fee and the waiting time until you are called. */
  hospitalRegister(payer: Payer): { fee: number; wait: number; number: string } | null {
    const fee = registrationFee(payer);
    if (this.wallet.balance < fee) return null;
    if (fee > 0) this.wallet.add(this.clock.minutes, -fee, 'health', 'tx.hospitalAdmin');
    const n = 1 + Math.floor(this.rng() * 60);
    return { fee, wait: waitMinutes(payer), number: `${payer === 'bpjs' ? 'B' : payer === 'asuransi' ? 'C' : 'A'}-${String(n).padStart(3, '0')}` };
  }

  diagnosis(): Diagnosis {
    const v = this.character.vitals;
    return diagnose({ sick: v.sick, health: v.health, stress: v.stress, energi: v.needs.energi });
  }

  /** Receives a treatment: pays what is not covered; may return a hospital stay to run. */
  treat(t: Treatment, payer: Payer): { paid: number; stay: ActionDef | null } | null {
    const pay = patientPays(t, payer);
    if (this.wallet.balance < pay) return null;
    if (pay > 0) this.wallet.add(this.clock.minutes, -pay, 'health', 'tx.treatment');
    const v = this.character.vitals;
    if (t.cure) v.sick = false;
    if (t.health) v.health = Math.min(100, Math.max(t.cure ? 65 : 0, v.health + t.health));
    if (t.stress) v.stress = Math.max(0, v.stress + t.stress);
    if (t.sickLeaveDays) this.career.excuseDays(this.clock.minutes, t.sickLeaveDays);
    this.character.mood = this.currentMood();
    const stay: ActionDef | null = t.inpatientDays
      ? { id: 'rawat_inap', labelKey: 'act.inpatient', durationMinutes: t.inpatientDays * 24 * 60, fastForward: true, animation: 'away', needsPerHour: { kenyang: 3, energi: 3, bersih: 1 }, stressPerHour: -0.5 }
      : null;
    return { paid: pay, stay };
  }

  /** What the character has done today (for the daily task list). */
  doneToday = new Set<DoneTag>();

  markDone(tag: DoneTag): void {
    this.doneToday.add(tag);
  }

  /** Today's to-do list ("Tugas hari ini"). */
  todayTasks(): DailyTask[] {
    const job = this.career.job;
    const now = this.clock.minutes;
    return dailyTasks({
      done: this.doneToday,
      employed: job !== null,
      workDay: job !== null && this.career.isWorkDay(now),
      shiftStart: job ? this.career.jobData(job.jobId).shiftStart : undefined,
      fridgeItems: this.inventory.list().reduce((n, [, k]) => n + k, 0),
      energy: this.character.vitals.needs.energi,
      sick: this.character.vitals.sick,
    });
  }

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
        hasSkck: () => this.character.skck === true && !skckBlocked(this.crime, this.clock.minutes, this.cfg.crime),
      },
      data.jobs,
      this.cfg.career,
      () => this.city.industries,
    );
    this.career.onApplied = () => this.markDone('lamar');
    // A job given directly (tests, old saves) becomes the career's job.
    const emp = character.employment;
    if (emp) {
      const company = data.jobs.find((j) => j.id === emp.jobId)?.companies[0] ?? 'PT Contoh';
      this.career.job = { jobId: emp.jobId, company, monthlyGross: emp.monthlyGross, startMinute: emp.startMinute, level: 0, levelSinceMinute: emp.startMinute, performance: 50, warnings: 0, absencesSinceWarning: 0, absentDaysThisMonth: emp.absentDaysThisMonth, leaveDaysLeft: this.cfg.career.annualLeaveDays, excusedDays: [], lastJudgedDay: -1 };
    }
    this.rng = createRng(seed);
    this.career.refreshListings(this.clock.minutes);
    this.home = { layoutId: 'kos', placements: this.defaultPlacements('kos'), storage: [], debts: [] };
    // Starting contacts: parents and two neighbours.
    const now0 = this.clock.minutes;
    const ayah = makeNpc('ayah', data.names, this.rng, 'keluarga', 75, now0);
    ayah.gender = 'male';
    ayah.name = 'Ayah';
    const ibu = makeNpc('ibu', data.names, this.rng, 'keluarga', 80, now0);
    ibu.gender = 'female';
    ibu.name = 'Ibu';
    this.npcs = [ayah, ibu, makeNpc('n1', data.names, this.rng, 'tetangga', 30, now0), makeNpc('n2', data.names, this.rng, 'tetangga', 25, now0)];
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
      if (this.deliveries.length) this.checkDeliveries(events);
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
        doneToday: [...this.doneToday],
      },
      crime: this.crime,
      rng: this.rng.getState(),
      lastPayslip: this.lastPayslip,
      home: JSON.parse(JSON.stringify(this.home)),
      npcs: JSON.parse(JSON.stringify(this.npcs)),
      pendingEvent: this.pendingEvent,
      pendingVisit: this.pendingVisit,
      floodDay: this.floodDay,
      deliveries: this.deliveries.map((d) => ({ ...d, items: { ...d.items } })),
      business: this.business ? { ...this.business } : null,
      arisanMember: this.arisanMember,
      investments: this.investments,
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
    s.doneToday = new Set(save.book.doneToday ?? []);
    if (save.crime) s.crime = save.crime;
    s.rng.setState(save.rng);
    s.lastPayslip = save.lastPayslip;
    if (save.home) s.home = save.home;
    if (save.npcs) s.npcs = save.npcs;
    s.pendingEvent = save.pendingEvent ?? null;
    s.pendingVisit = save.pendingVisit ?? null;
    s.floodDay = save.floodDay ?? -1;
    s.deliveries = save.deliveries ?? [];
    s.business = save.business ?? null;
    s.arisanMember = save.arisanMember ?? false;
    s.investments = save.investments ?? [];
    s.character.mood = s.currentMood();
    return s;
  }

  // --- Home: furniture, debts, moving --------------------------------------------------------

  private defaultPlacements(layoutId: string): Placement[] {
    return (this.data.layouts[layoutId]?.objects ?? []).map((o) => ({ ...o }));
  }

  get layout(): HomeLayoutData {
    return this.data.layouts[this.home.layoutId];
  }

  /** Furniture data for a placement's object (the worship token resolves to the character's religion). */
  objectData(objectId: string): HomeObjectData | undefined {
    const id = objectId === 'worship:{religion}' ? `worship_${this.character.religionId}` : objectId;
    return this.data.objects.find((o) => o.id === id);
  }

  private placed(): { p: Placement; def: HomeObjectData }[] {
    return this.home.placements.flatMap((p) => {
      const def = this.objectData(p.objectId);
      return def ? [{ p: this.wallSnapped(p, def), def }] : [];
    });
  }

  /** Worship shelves stand flush against the back wall whatever z the data says. */
  wallSnapped(p: Placement, def: HomeObjectData): Placement {
    return def.againstWall ? { ...p, z: -this.layout.depth / 2 + def.footprint[1] / 2 + 0.02 } : p;
  }

  placementProblem(p: Placement): PlacementProblem {
    const def = this.objectData(p.objectId);
    if (!def) return 'outside';
    return checkPlacement(this.wallSnapped(p, def), def, this.placed(), this.layout);
  }

  private nextPlacementId(objectId: string): string {
    let i = 1;
    while (this.home.placements.some((p) => p.id === `${objectId}#${i}`)) i++;
    return `${objectId}#${i}`;
  }

  /** Buys an object (cash, or paylater in instalments) and places it. */
  buy(objectId: string, at: { x: number; z: number; rot: number }, paylater: boolean): PlacementProblem | 'money' | null {
    const def = this.objectData(objectId);
    if (!def || def.fixture) return 'outside';
    const p: Placement = { id: this.nextPlacementId(objectId), objectId, ...at };
    const problem = this.placementProblem(p);
    if (problem) return problem;
    const price = def.price ?? 0;
    if (!paylater && this.wallet.balance < price) return 'money';
    if (paylater) {
      const f = this.cfg.finance;
      this.home.debts.push({ id: `D${Date.now() % 1e7}${this.home.debts.length}`, labelKey: 'tx.paylater', monthly: paylaterInstalment(price, f), monthsLeft: f.paylaterMonths });
    } else {
      this.wallet.add(this.clock.minutes, -price, 'shopping', 'tx.furniture');
    }
    this.home.placements.push(p);
    return null;
  }

  /** Moves or rotates a placed object. */
  movePlacement(id: string, at: { x: number; z: number; rot: number }): PlacementProblem {
    const p = this.home.placements.find((x) => x.id === id);
    const def = p && this.objectData(p.objectId);
    if (!p || !def || def.fixture) return 'outside';
    const next = { ...p, ...at };
    const problem = this.placementProblem(next);
    if (problem) return problem;
    Object.assign(p, at);
    return null;
  }

  /** Puts a placed object into storage. */
  store(id: string): boolean {
    const i = this.home.placements.findIndex((x) => x.id === id);
    const def = i >= 0 ? this.objectData(this.home.placements[i].objectId) : undefined;
    if (i < 0 || !def || def.fixture) return false;
    this.home.storage.push(this.home.placements[i].objectId);
    this.home.placements.splice(i, 1);
    return true;
  }

  /** Places an object from storage. */
  placeFromStorage(index: number, at: { x: number; z: number; rot: number }): PlacementProblem {
    const objectId = this.home.storage[index];
    if (!objectId) return 'outside';
    const p: Placement = { id: this.nextPlacementId(objectId), objectId, ...at };
    const problem = this.placementProblem(p);
    if (problem) return problem;
    this.home.storage.splice(index, 1);
    this.home.placements.push(p);
    return null;
  }

  /** Sells a placed object for part of its price. */
  sell(id: string): number {
    const i = this.home.placements.findIndex((x) => x.id === id);
    const def = i >= 0 ? this.objectData(this.home.placements[i].objectId) : undefined;
    if (i < 0 || !def || def.fixture) return 0;
    const refund = Math.round(((def.price ?? 0) * this.cfg.finance.sellBackShare) / 1000) * 1000;
    this.home.placements.splice(i, 1);
    if (refund > 0) this.wallet.add(this.clock.minutes, refund, 'other', 'tx.sell');
    return refund;
  }

  /** A fan (or AC) is placed in the home. */
  hasCoolingAppliance(): boolean {
    return this.home.placements.some((p) => this.objectData(p.objectId)?.cooling === true);
  }

  fengShui(): FengShuiResult {
    return fengShui(this.placed().map((x) => ({ ...x, model: x.def.model })), this.layout);
  }

  /** Monthly rent of a layout in this city. */
  rentOf(layoutId: string): number {
    return Math.round(this.city.boardingRoomRentMonthly * (this.data.layouts[layoutId]?.rentFactor ?? 1));
  }

  housePrice(): number {
    return (this.city as CityData & { housePrice?: number }).housePrice ?? 500000000;
  }

  /** Why moving to a layout is not possible right now (null = possible). */
  houseMoveBlock(layoutId: string): HouseMoveBlock {
    if (layoutId === this.home.layoutId) return 'same';
    const moveCost = this.cfg.finance.movingCost;
    if (layoutId === 'rumah') {
      const q = mortgageQuote(this.housePrice(), this.cfg.finance);
      const job = this.career.job;
      const months = job ? monthsBetween(job.startMinute, this.clock.minutes) : null;
      return mortgageBlock(q, { monthsEmployed: months, monthlyGross: job?.monthlyGross ?? 0, balance: this.wallet.balance - moveCost }, this.cfg.finance);
    }
    // A new rental needs the first month's rent and the moving truck.
    return this.wallet.balance < this.rentOf(layoutId) + moveCost ? 'money' : null;
  }

  /** Homes offered at the start of a new life. */
  static readonly START_HOMES = ['kos', 'kontrakan', 'apartemen', 'rumah_sewa', 'tanah'] as const;

  /** Moves into the chosen first home, paying the first month's rent. False if it cannot be paid. */
  startHome(layoutId: string): boolean {
    if (!this.data.layouts[layoutId]) return false;
    const rent = this.rentOf(layoutId);
    if (this.wallet.balance < rent) return false;
    if (rent > 0) this.wallet.add(this.clock.minutes, -rent, 'rent', 'tx.rent');
    this.home = { layoutId, placements: this.defaultPlacements(layoutId), storage: [], debts: [] };
    const p = toParts(this.clock.minutes);
    this.lastBilledMonth = `${p.year}-${p.month}`;
    return true;
  }

  /** Building a simple house on the family land: about a third of a house's market price. */
  buildCost(): number {
    return Math.round((this.housePrice() * this.cfg.finance.buildShare) / 100000) * 100000;
  }

  buildBlock(): 'notLand' | 'building' | 'money' | null {
    if (this.home.layoutId !== 'tanah') return 'notLand';
    if (this.home.construction) return 'building';
    return this.wallet.balance < this.buildCost() ? 'money' : null;
  }

  /** Hires builders: the house is ready after `buildDays`. */
  startBuilding(): boolean {
    if (this.buildBlock()) return false;
    this.wallet.add(this.clock.minutes, -this.buildCost(), 'other', 'tx.build');
    this.home.construction = { doneAt: this.clock.minutes + this.cfg.finance.buildDays * 24 * 60 };
    return true;
  }

  private checkConstruction(t: number, events: SimEvent[]): void {
    const c = this.home.construction;
    if (!c || t < c.doneAt) return;
    const keep = this.home.placements.filter((p) => !this.objectData(p.objectId)?.fixture && p.objectId !== 'worship:{religion}').map((p) => p.objectId);
    this.home = { layoutId: 'rumah', placements: this.defaultPlacements('rumah'), storage: [...this.home.storage, ...keep], debts: this.home.debts, construction: null };
    events.push({ kind: 'houseBuilt' });
  }

  /** Moves house. Furniture you bought goes into storage; the new home's fixtures come with it. */
  moveHouse(layoutId: string): HouseMoveBlock {
    const block = this.houseMoveBlock(layoutId);
    if (block) return block;
    const f = this.cfg.finance;
    this.wallet.add(this.clock.minutes, -f.movingCost, 'other', 'tx.moving');
    if (layoutId === 'rumah') {
      const q = mortgageQuote(this.housePrice(), f);
      this.wallet.add(this.clock.minutes, -q.downPayment, 'other', 'tx.downPayment');
      this.home.debts.push({ id: 'mortgage', labelKey: 'tx.mortgage', monthly: q.monthly, monthsLeft: f.mortgageYears * 12 });
    } else {
      const rent = this.rentOf(layoutId);
      this.wallet.add(this.clock.minutes, -rent, 'rent', 'tx.rent');
    }
    const keep = this.home.placements.filter((p) => !this.objectData(p.objectId)?.fixture && p.objectId !== 'worship:{religion}').map((p) => p.objectId);
    this.home = { layoutId, placements: this.defaultPlacements(layoutId), storage: [...this.home.storage, ...keep], debts: this.home.debts };
    // The month is paid: no second rent on the 1st of this month.
    const p = toParts(this.clock.minutes);
    this.lastBilledMonth = `${p.year}-${p.month}`;
    return null;
  }

  // --- Life events, traditions ----------------------------------------------------------------

  private eventContext() {
    const p = toParts(this.clock.minutes);
    return {
      balance: this.wallet.balance,
      employed: this.career.job !== null,
      ethnicities: this.character.ethnicities,
      religionId: this.character.religionId,
      floodRisk: (this.city as CityData & { floodRisk?: number }).floodRisk ?? 0,
      month: p.month,
    };
  }

  private onRandomEvent(events: SimEvent[]): void {
    if (this.pendingEvent || this.current) return;
    if (this.rng() >= this.cfg.events.dailyChance) return;
    const luck = this.character.ethnicities.includes('chindo') ? this.fengShui().score : 0;
    const e = pickEvent(this.data.events, this.eventContext(), this.rng(), luck);
    if (!e) return;
    this.pendingEvent = { id: e.id, titleKey: e.titleKey, textKey: e.textKey, choices: e.choices };
    events.push({ kind: 'lifeEvent' });
  }

  /** Whether today is Nyepi for this (Hindu) character: stay home, lights off. */
  isNyepi(): boolean {
    const p = toParts(this.clock.minutes);
    const key = `${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    return traditionsToday(this.data.traditions, key, this.character.religionId, this.character.ethnicities).some((t) => t.nyepi);
  }

  private onTraditions(t: number, events: SimEvent[]): void {
    const p = toParts(t);
    const key = `${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    for (const tr of traditionsToday(this.data.traditions, key, this.character.religionId, this.character.ethnicities)) {
      if (tr.angpao) {
        const e = this.cfg.events;
        if (this.character.married) {
          this.wallet.add(t, -e.angpaoGive, 'other', 'tx.angpaoGive');
          events.push({ kind: 'tradition', textKey: 'trad.angpaoGive', params: { amount: e.angpaoGive } });
        } else {
          this.wallet.add(t, e.angpaoReceive, 'other', 'tx.angpao');
          events.push({ kind: 'tradition', textKey: 'trad.angpaoReceive', params: { amount: e.angpaoReceive } });
        }
        continue;
      }
      if (tr.choices && !this.pendingEvent) {
        this.pendingEvent = { id: tr.id, titleKey: `trad.${tr.id}.title`, textKey: `trad.${tr.id}.text`, choices: tr.choices };
        events.push({ kind: 'lifeEvent' });
        continue;
      }
      if (tr.effects) this.applyEffects(tr.effects);
      events.push({ kind: 'tradition', textKey: `trad.${tr.id}.text` });
    }
  }

  private addBuff(id: string): void {
    const b = this.cfg.buffs[id];
    if (!b) return;
    const c = this.character;
    c.buffs = c.buffs.filter((x) => x.id !== id);
    c.buffs.push({ id, mood: b.mood, until: this.clock.minutes + b.hours * MINUTES_PER_HOUR });
  }

  private applyEffects(e: Effects): void {
    applyNeedEffects(this.character.vitals, e);
    if (e.money) this.wallet.add(this.clock.minutes, e.money, e.money > 0 ? 'other' : 'other', e.money > 0 ? 'tx.eventIn' : 'tx.eventOut');
    if (e.buff) this.addBuff(e.buff);
    if (e.arisan) this.arisanMember = true;
    if (e.investment && e.money) this.investments.push({ amount: -e.money, due: this.clock.minutes + this.cfg.events.investmentDays * 24 * 60 });
    this.character.mood = this.currentMood();
  }

  /** The player picked an answer to the pending event. */
  chooseEvent(index: number): void {
    const p = this.pendingEvent;
    if (!p) return;
    const choice = p.choices[index];
    this.pendingEvent = null;
    if (p.id === 'banjir') this.floodDay = dayIndex(this.clock.minutes);
    if (!choice) return;
    if ((choice.effects.money ?? 0) < 0 && this.wallet.balance < -(choice.effects.money ?? 0)) {
      // Not enough money: the cheapest other answer happens instead.
      const fallback = p.choices.find((c) => (c.effects.money ?? 0) >= 0);
      if (fallback) this.applyEffects(fallback.effects);
      return;
    }
    this.applyEffects(choice.effects);
  }

  private payInvestments(t: number, events: SimEvent[]): void {
    const due = this.investments.filter((i) => i.due <= t);
    this.investments = this.investments.filter((i) => i.due > t);
    const e = this.cfg.events;
    for (const i of due) {
      if (this.rng() < e.investmentSuccess) {
        const back = Math.round(i.amount * e.investmentReturn);
        this.wallet.add(t, back, 'other', 'tx.investment');
        events.push({ kind: 'tradition', textKey: 'toast.investWin', params: { amount: back } });
      } else {
        events.push({ kind: 'tradition', textKey: 'toast.investLoss', params: { amount: i.amount } });
      }
    }
  }

  // --- Social life -------------------------------------------------------------------------------

  /** Maybe meet someone new at a social place (cafe, park, gym, place of worship, office). */
  meetSomeone(role: 'kenalan' | 'rekan' = 'kenalan', always = false): Npc | null {
    if (!always && this.rng() >= this.cfg.social.meetChance) return null;
    const n = makeNpc(`p${this.npcs.length + 1}-${Math.floor(this.clock.minutes)}`, this.data.names, this.rng, role, 15, this.clock.minutes);
    this.npcs.push(n);
    return n;
  }

  partner(): Npc | undefined {
    return this.npcs.find((n) => n.spouse || n.datingSince !== null);
  }

  socialBlock(npcId: string, a: SocialAction): ReturnType<typeof socialBlock> | 'unknown' {
    const n = this.npcs.find((x) => x.id === npcId);
    if (!n) return 'unknown';
    const p = this.partner();
    return socialBlock(n, a, this.cfg.social, this.clock.minutes, { balance: this.wallet.balance, hasPartner: !!p && p.id !== n.id });
  }

  /** Talks to someone on the phone or meets them; time passes. Returns what happened. */
  social(npcId: string, a: SocialAction): SimEvent[] {
    const n = this.npcs.find((x) => x.id === npcId);
    if (!n || this.socialBlock(npcId, a)) return [];
    const cfg = this.cfg.social;
    const ramah = this.character.traits.includes('ramah') ? 1.5 : 1;
    const v = this.character.vitals;
    const out: SimEvent[] = [];
    let minutes = 10;
    n.lastContact = this.clock.minutes;
    if (a === 'chat') {
      this.bump(n, cfg.chatGain * ramah, out);
      applyNeedEffects(v, { sosial: 12 });
    } else if (a === 'call') {
      minutes = 20;
      this.bump(n, cfg.callGain * ramah, out);
      applyNeedEffects(v, { sosial: 20, kangen: n.role === 'keluarga' ? -25 : 0 });
    } else if (a === 'hangout') {
      minutes = 120;
      this.wallet.add(this.clock.minutes, -cfg.hangoutCost, 'other', 'tx.hangout');
      this.bump(n, cfg.hangoutGain * ramah, out);
      applyNeedEffects(v, { sosial: 35, hiburan: 20 });
    } else if (a === 'confess') {
      if (this.rng() < n.relationship / 100) {
        n.datingSince = this.clock.minutes;
        n.relationship = Math.min(100, n.relationship + 5);
        this.addBuff('senang');
        out.push({ kind: 'social', textKey: 'soc.confessYes', params: { name: n.name } });
      } else {
        n.relationship = Math.max(0, n.relationship - 10);
        v.stress = Math.min(100, v.stress + 10);
        out.push({ kind: 'social', textKey: 'soc.confessNo', params: { name: n.name } });
      }
    } else if (a === 'propose') {
      if (this.rng() < 0.85) {
        n.engaged = true;
        this.addBuff('senang');
        out.push({ kind: 'social', textKey: 'soc.proposeYes', params: { name: n.name } });
      } else {
        n.relationship = Math.max(0, n.relationship - 8);
        out.push({ kind: 'social', textKey: 'soc.proposeNo', params: { name: n.name } });
      }
    }
    out.push(...this.simulate(minutes));
    return out;
  }

  /** Changes closeness and reports when it crosses a level. */
  private bump(n: Npc, delta: number, out: SimEvent[]): void {
    const before = relLevel(n.relationship);
    n.relationship = Math.max(0, Math.min(100, n.relationship + delta));
    const after = relLevel(n.relationship);
    if (after !== before) out.push({ kind: 'relLevel', name: n.name, level: after, up: after > before });
  }

  /** Talks about a topic face to face: liked topics bring people closer, disliked ones push them away. */
  talkTopic(npcId: string, topicId: string): { reaction: TopicReaction; events: SimEvent[] } {
    const n = this.npcs.find((x) => x.id === npcId);
    if (!n) return { reaction: 'neutral', events: [] };
    const cfg = this.cfg.social;
    ensureTopics(n, cfg.topics);
    const reaction = reactionTo(n, topicId);
    const ramah = this.character.traits.includes('ramah') ? 1.5 : 1;
    const out: SimEvent[] = [];
    const delta = reaction === 'like' ? cfg.topicLike * ramah : reaction === 'dislike' ? cfg.topicDislike : cfg.topicNeutral * ramah;
    this.bump(n, delta, out);
    n.known = { ...n.known, [topicId]: reaction };
    n.lastContact = this.clock.minutes;
    applyNeedEffects(this.character.vitals, { sosial: reaction === 'dislike' ? 3 : 8, hiburan: reaction === 'like' ? 4 : 0 });
    out.push(...this.simulate(10));
    return { reaction, events: out };
  }

  /** Three topics to offer in a conversation: known likes first, then ones not tried yet. */
  topicChoices(npcId: string): string[] {
    const n = this.npcs.find((x) => x.id === npcId);
    const all = this.cfg.social.topics.map((t) => t.id);
    if (!n) return all.slice(0, 3);
    const known = n.known ?? {};
    const liked = all.filter((id) => known[id] === 'like');
    const fresh = all.filter((id) => !(id in known));
    for (let i = fresh.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
    }
    const neutral = all.filter((id) => known[id] === 'neutral');
    return [...liked.slice(0, 1), ...fresh, ...neutral].slice(0, 3);
  }

  /** In the late afternoon, a neighbour or friend sometimes comes by. */
  private onVisitHour(t: number, events: SimEvent[]): void {
    const cfg = this.cfg.social;
    if (this.pendingVisit || this.current?.def.animation === 'away' || this.rng() >= cfg.visitChance) return;
    const pool = this.npcs.filter((n) => !n.spouse && n.relationship >= cfg.visitMinRelationship && n.role !== 'keluarga');
    if (pool.length === 0) return;
    const total = pool.reduce((sum, n) => sum + n.relationship, 0);
    let r = this.rng() * total;
    const n = pool.find((x) => (r -= x.relationship) < 0) ?? pool[pool.length - 1];
    this.pendingVisit = { npcId: n.id, until: t + cfg.visitWaitMinutes, inside: false };
    events.push({ kind: 'visit', npcId: n.id, name: n.name });
  }

  /** Lets the visitor in. */
  acceptVisit(): Npc | null {
    const v = this.pendingVisit;
    if (!v) return null;
    v.inside = true;
    return this.npcs.find((n) => n.id === v.npcId) ?? null;
  }

  /** Sends the visitor away (a little awkward). */
  declineVisit(): SimEvent[] {
    const v = this.pendingVisit;
    this.pendingVisit = null;
    const n = v && this.npcs.find((x) => x.id === v.npcId);
    const out: SimEvent[] = [];
    if (n) this.bump(n, -2, out);
    return out;
  }

  /** The visitor says goodbye. */
  endVisit(): void {
    this.pendingVisit = null;
  }

  /** Name of the traditional wedding ceremony of the character's (father's) ethnicity. */
  adatCeremony(): string {
    const id = this.character.ethnicities[0];
    return this.data.ethnicities.find((e) => e.id === id)?.weddingCeremony ?? 'Adat';
  }

  /** Holds the wedding: simple at the KUA/civil registry, or a full traditional ceremony. */
  wedding(npcId: string, kind: 'kua' | 'adat'): boolean {
    const n = this.npcs.find((x) => x.id === npcId);
    if (!n || !n.engaged) return false;
    const cost = kind === 'kua' ? this.cfg.social.weddingKuaCost : this.cfg.social.weddingAdatCost;
    if (this.wallet.balance < cost) return false;
    this.wallet.add(this.clock.minutes, -cost, 'other', 'tx.wedding');
    n.engaged = false;
    n.spouse = true;
    n.relationship = 100;
    this.character.married = true;
    this.addBuff('menikah');
    applyNeedEffects(this.character.vitals, { sosial: 60, hiburan: 40 });
    return true;
  }

  // --- Trips: mudik and holidays ---------------------------------------------------------------

  /** Mudik ticket price and destination (the father's side of the family). */
  mudikInfo(): { cost: number; region: string; days: number } {
    const eth = this.data.ethnicities.find((e) => e.id === this.character.ethnicities[0]);
    return { cost: eth?.mudikTicketCost ?? 700000, region: eth?.hometownRegion ?? '-', days: 4 };
  }

  /** An away action for a trip; leave days are used for work days when it starts. */
  tripAction(kind: 'mudik' | number): ActionDef {
    if (kind === 'mudik') {
      const m = this.mudikInfo();
      return { id: 'trip_mudik', labelKey: 'act.mudik', durationMinutes: m.days * 24 * 60, cost: m.cost, fastForward: true, animation: 'away', needsPerHour: { sosial: 3, hiburan: 2, kenyang: 3, energi: 2 }, kangenPerHour: -10, stressPerHour: -1, buff: { id: 'pulang', mood: this.cfg.buffs.pulang.mood, hours: this.cfg.buffs.pulang.hours } };
    }
    const trip = this.data.trips[kind];
    return { id: `trip_${kind}`, labelKey: 'act.trip', durationMinutes: trip.days * 24 * 60, cost: trip.cost, fastForward: true, animation: 'away', needsPerHour: { hiburan: 4, sosial: 2, kenyang: 3, energi: 2 }, stressPerHour: -2, buff: { id: 'liburan', mood: this.cfg.buffs.liburan.mood, hours: this.cfg.buffs.liburan.hours } };
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

  /** What an action costs right now (city prices, BPJS). */
  costOf(def: ActionDef): number {
    if (def.bpjsCovered && this.career.job) return 0;
    if (def.costKey === 'streetMeal') return this.city.streetMealPrice;
    return def.cost ?? 0;
  }

  /** Why an action cannot start right now, or null if it can. */
  actionBlock(def: ActionDef, placeReligion?: string): ActionBlock {
    if (def.requires?.startsWith('business:') && this.business?.typeId !== def.requires.slice('business:'.length)) return 'business';
    if (def.isEating && !this.canEat()) return 'fasting';
    if (def.requiresMotorbike && !this.character.ownsMotorbike) return 'motorbike';
    if (def.religionOnly && placeReligion && placeReligion !== this.character.religionId) return 'religion';
    if (def.id === 'skck' && skckBlocked(this.crime, this.clock.minutes, this.cfg.crime)) return 'record';
    const cost = this.costOf(def);
    if (cost > 0 && this.wallet.balance < cost) return 'money';
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
    const cost = purchase ? this.inventory.priceOf(purchase) : this.costOf(def);
    if (purchase && this.wallet.balance < cost) return false;
    if (cost) this.wallet.add(this.clock.minutes, -cost, purchase || def.isEating ? 'food' : 'other', def.labelKey);
    this.earnedFraction = 0;
    const usedItems = def.consumes ? this.inventory.take(def.consumes.category, def.consumes.qty) ?? [] : [];
    if (def.id.startsWith('trip_')) this.career.useLeaveFor(this.clock.minutes, Math.ceil(def.durationMinutes / (24 * 60)));
    if (def.id === 'go_work' || def.id === 'work_here') {
      const out: CareerEvent[] = [];
      this.career.startShift(this.clock.minutes, out, def.id === 'work_here' ? 0 : undefined);
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
      return { actionId: a.def.id, labelKey: a.def.labelKey, fraction: Math.min(1, (done + stepDone) / Math.max(1, plannedTotal)), minutesLeft: left + later };
    }
    let later = 0;
    for (let i = a.stepIndex + 1; i < a.steps.length; i++) later += a.steps[i].durationMinutes;
    return { actionId: a.def.id, labelKey: a.def.labelKey, fraction: Math.min(1, (done + stepDone) / Math.max(1, total)), minutesLeft: stepLeft + later };
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

  private earnedFraction = 0;

  private finishAction(): void {
    const done = this.current;
    if (!done) return;
    if (done.def.cures) {
      this.character.vitals.sick = false;
      this.character.vitals.health = Math.max(this.character.vitals.health, 65);
    }
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
    this.tagDone(done.def, done.steps, !!done.purchase);
    this.cancelAction();
    this.pendingActionEvents.push({ kind: 'actionDone', actionId: done.def.id, objectInstanceId: done.objectInstanceId });
  }

  private tagDone(def: ActionDef, steps: readonly ActionStep[], purchased: boolean): void {
    const anim = (a: string): boolean => def.animation === a || steps.some((st) => st.animation === a);
    if (def.isEating || anim('eat')) this.markDone('makan');
    if (anim('shower')) this.markDone('mandi');
    if (anim('worship') || def.id.startsWith('worship') || def.id === 'pray_place') this.markDone('ibadah');
    if (def.activity === 'working') this.markDone('kerja');
    if (def.activity === 'exercising') this.markDone('olahraga');
    if (def.activity === 'sleeping') this.markDone('tidur');
    if (purchased) this.markDone('belanja');
    // SKCK (police certificate of good conduct): needed for many job applications.
    if (def.id === 'skck') this.character.skck = true;
    if (def.requires?.startsWith('business:') && this.business) this.business.workedDay = dayIndex(this.clock.minutes);
    if (def.crime) this.commitCrime(def.crime, 1.3);
  }

  /** Continuous rules over `minutes` of game time. */
  private integrate(minutes: number): void {
    const c = this.character;
    const fasting = c.religionId === 'islam' && c.fastingEnabled && this.calendar.isFastingTime(this.clock.minutes);
    updateVitals(c.vitals, minutes / MINUTES_PER_HOUR, {
      sleeping: c.activity === 'sleeping',
      working: c.activity === 'working',
      hotRoom: this.city.hotClimate && !c.hasCooling && !this.hasCoolingAppliance(),
      fasting,
      traits: c.traits,
    }, this.cfg.needs);
    if (c.activity === 'exercising') this.exerciseMinutesToday += minutes;
    const action = this.current;
    if (action && !action.waiting) {
      const step = action.steps[action.stepIndex];
      applyActionEffects(c.vitals, step, minutes / MINUTES_PER_HOUR);
      if (action.def.incomePerHour) {
        // Pay out whole rupiah as they are earned.
        this.earnedFraction += (action.def.incomePerHour * minutes) / MINUTES_PER_HOUR;
        const whole = Math.floor(this.earnedFraction / 1000) * 1000;
        if (whole > 0) {
          this.earnedFraction -= whole;
          this.wallet.add(this.clock.minutes, whole, 'salary', 'tx.ojolIncome');
        }
      }
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
    fadeWanted(this.crime, t, this.cfg.crime);
    if (p.hour === 0) this.onNewDay(t, events);
    if (p.hour === this.cfg.events.traditionHour) this.onTraditions(t, events);
    if (p.hour === this.cfg.events.eventHour) this.onRandomEvent(events);
    if (this.pendingVisit && !this.pendingVisit.inside && t >= this.pendingVisit.until) this.pendingVisit = null;
    if (p.hour === this.cfg.social.visitHour) this.onVisitHour(t, events);
    this.onWeatherHour(events);
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
    this.doneToday.clear();
    if (c.perantau) c.vitals.kangen = Math.min(100, c.vitals.kangen + this.cfg.needs.kangenPerDay);
    if (rollSickness(c.vitals, this.cfg.needs, this.rng())) events.push({ kind: 'sick' });

    decaySocial(this.npcs, this.cfg.social, t);
    this.closeBusinessDay(t, events);
    this.checkConstruction(t, events);
    this.payInvestments(t, events);
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
      const rent = this.rentOf(this.home.layoutId);
      if (rent > 0) {
        this.wallet.add(t, -rent, 'rent', 'tx.rent');
        events.push({ kind: 'bill', amount: rent, labelKey: 'tx.rent' });
      }
      // Health cover: self-paid BPJS (when not employed) and private insurance.
      if (c.bpjsMandiri && !this.career.job) {
        this.wallet.add(t, -this.cfg.health.bpjsMandiriMonthly, 'bill', 'tx.bpjsMandiri');
        events.push({ kind: 'bill', amount: this.cfg.health.bpjsMandiriMonthly, labelKey: 'tx.bpjsMandiri' });
      }
      if (c.asuransi) {
        this.wallet.add(t, -this.cfg.health.insuranceMonthly, 'bill', 'tx.insurance');
        events.push({ kind: 'bill', amount: this.cfg.health.insuranceMonthly, labelKey: 'tx.insurance' });
      }
      for (const d of this.home.debts) {
        this.wallet.add(t, -d.monthly, 'bill', d.labelKey);
        events.push({ kind: 'bill', amount: d.monthly, labelKey: d.labelKey });
        d.monthsLeft -= 1;
      }
      this.home.debts = this.home.debts.filter((d) => d.monthsLeft > 0);
      if (this.arisanMember) {
        const e = this.cfg.events;
        this.wallet.add(t, -e.arisanFee, 'bill', 'tx.arisan');
        if (this.rng() < e.arisanWinChance) {
          this.wallet.add(t, e.arisanWin, 'other', 'tx.arisanWin');
          events.push({ kind: 'tradition', textKey: 'toast.arisanWin', params: { amount: e.arisanWin } });
        }
      }
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

  get cfgTravel(): SimConfig['travel'] {
    return this.cfg.travel;
  }

  get trips(): SimData['trips'] {
    return this.data.trips;
  }

  get cfgSocial(): SocialConfig {
    return this.cfg.social;
  }

  get cfgCareerStress(): number {
    return this.cfg.career.stressPerWorkHour;
  }

  get cfgFinance(): FinanceConfig {
    return this.cfg.finance;
  }

  get cfgAutonomy(): SimConfig['autonomy'] {
    return this.cfg.autonomy;
  }

  /** Buys groceries on the spot (minimarket, market): paid now, straight into the bag/fridge. */
  buyNow(list: Record<string, number>, priceFactor = 1): boolean {
    const price = Math.round((this.inventory.priceOf(list) * priceFactor) / 100) * 100;
    if (price <= 0 || this.wallet.balance < price) return false;
    this.wallet.add(this.clock.minutes, -price, 'food', 'tx.groceries');
    for (const [id, n] of Object.entries(list)) if (n > 0) this.inventory.add(id, n);
    return true;
  }

  /** Ojol fare and minutes for a trip of `metres` on the neighborhood map. */
  travelQuote(metres: number): { cost: number; minutes: number } {
    const t = this.cfg.travel;
    const slow = travelFactor(this.weatherNow(), this.cfg.weather);
    const fare = t.baseFare + (metres / 10) * t.farePer10m;
    // Own car: fuel and parking instead of the ojol fare.
    const cost = this.character.ownsCar ? fare * t.carFuelShare + t.carParking : fare;
    return { cost: Math.round(cost / 500) * 500, minutes: Math.round((t.baseMinutes + (metres / 10) * t.minutesPer10m) * slow) };
  }

  businessType(id: string) {
    return this.cfg.business.types.find((b) => b.id === id) ?? null;
  }

  /** Starts a side business (one at a time), paying its capital. */
  startBusiness(typeId: string): boolean {
    const type = this.businessType(typeId);
    if (!type || this.business || this.wallet.balance < type.capital) return false;
    if (type.capital > 0) this.wallet.add(this.clock.minutes, -type.capital, 'other', 'tx.business');
    const day = dayIndex(this.clock.minutes);
    this.business = { typeId, reputation: 20, workedDay: -1, startedDay: day, totalProfit: -type.capital, lastProfit: 0 };
    return true;
  }

  closeBusiness(): void {
    this.business = null;
  }

  /** At midnight: the finished day's sales minus costs go to the bank account. */
  private closeBusinessDay(t: number, events: SimEvent[]): void {
    const b = this.business;
    if (!b) return;
    const yesterday = dayIndex(t) - 1;
    if (yesterday < b.startedDay) return;
    const type = this.businessType(b.typeId);
    if (!type) return;
    const worked = b.workedDay === yesterday;
    const profit = dayProfit(b, type, worked, this.character.skills[type.skill] ?? 0, this.rng());
    b.reputation = nextReputation(b, worked, this.cfg.business);
    b.lastProfit = profit;
    b.totalProfit += profit;
    if (profit !== 0) this.wallet.add(t, profit, 'other', 'tx.business');
    events.push({ kind: 'business', nameKey: type.nameKey, profit });
  }

  /** Price of a food order: dishes, delivery fee and a rain surcharge while it rains. */
  deliveryQuote(items: Record<string, number>): { food: number; fee: number; rainFee: number; total: number; minutes: number } {
    const cfg = this.cfg.delivery;
    let food = 0;
    for (const [id, n] of Object.entries(items)) food += (this.data.items.find((i) => i.id === id)?.price ?? 0) * Math.max(0, n);
    const raining = this.weatherNow().raining;
    const rainFee = raining ? cfg.rainFee : 0;
    const minutes = Math.round((cfg.minMinutes + cfg.maxMinutes) / 2 + (raining ? cfg.rainExtraMinutes : 0));
    return { food, fee: cfg.fee, rainFee, total: food + cfg.fee + rainFee, minutes };
  }

  /** Orders food to the door; it arrives after the delivery time. */
  orderDelivery(items: Record<string, number>): number | null {
    const q = this.deliveryQuote(items);
    if (q.food <= 0 || this.wallet.balance < q.total) return null;
    const cfg = this.cfg.delivery;
    const minutes = cfg.minMinutes + this.rng() * (cfg.maxMinutes - cfg.minMinutes) + (q.rainFee > 0 ? cfg.rainExtraMinutes : 0);
    this.wallet.add(this.clock.minutes, -q.total, 'food', 'tx.delivery');
    this.deliveries.push({ items: { ...items }, arriveAt: this.clock.minutes + minutes });
    return Math.round(minutes);
  }

  private checkDeliveries(events: SimEvent[]): void {
    const now = this.clock.minutes;
    const due = this.deliveries.filter((d) => d.arriveAt <= now);
    if (!due.length) return;
    this.deliveries = this.deliveries.filter((d) => d.arriveAt > now);
    for (const d of due) {
      for (const [id, n] of Object.entries(d.items)) if (n > 0) this.inventory.add(id, n);
      events.push({ kind: 'delivery', items: d.items });
    }
  }

  /** Today's weather plan (the same after loading a save). */
  todayWeather(): DayWeather {
    const t = this.clock.minutes;
    const w = dayWeather(dayIndex(t), toParts(t).month, this.city.id, (this.city as CityData & { floodRisk?: number }).floodRisk ?? 0, this.cfg.weather);
    if (this.floodDay === dayIndex(t)) return { ...w, rain: true, startHour: w.rain ? w.startHour : 5, endHour: w.rain ? w.endHour : 8, intensity: Math.max(w.intensity, 0.8), flood: true };
    return w;
  }

  weatherNow(): WeatherNow {
    return weatherAt(this.todayWeather(), toParts(this.clock.minutes).hour);
  }

  /** Every hour: announce rain and floods; out in the rain the character gets wet. */
  private onWeatherHour(events: SimEvent[]): void {
    const now = this.weatherNow();
    if (now.raining !== this.lastWeather.raining || now.flooded !== this.lastWeather.flooded) events.push({ kind: 'weather', raining: now.raining, flooded: now.flooded });
    this.lastWeather = now;
    if (now.raining && this.outdoors && !this.character.buffs.some((b) => b.id === 'kehujanan')) {
      this.addBuff('kehujanan');
      applyNeedEffects(this.character.vitals, { bersih: -15 });
    }
  }

  /** Fast travel: pays the fare and lets the travel time pass. */
  travel(metres: number): SimEvent[] | null {
    const q = this.travelQuote(metres);
    if (this.wallet.balance < q.cost) return null;
    this.wallet.add(this.clock.minutes, -q.cost, 'transport', 'tx.ojol');
    return this.simulate(q.minutes);
  }

  /** Buys a car (used or new); fast travel then costs only fuel and parking. */
  buyCar(kind: 'bekas' | 'baru'): boolean {
    const price = kind === 'baru' ? this.cfg.travel.carPriceNew : this.cfg.travel.carPriceUsed;
    if (this.character.ownsCar || this.wallet.balance < price) return false;
    this.wallet.add(this.clock.minutes, -price, 'transport', 'tx.car');
    this.character.ownsCar = true;
    this.character.carColor = kind === 'baru' ? '#ecf0f1' : '#7b241c';
    return true;
  }

  buyMotorbike(): boolean {
    const price = this.cfg.travel.motorbikePrice;
    if (this.character.ownsMotorbike || this.wallet.balance < price) return false;
    this.wallet.add(this.clock.minutes, -price, 'transport', 'tx.motor');
    this.character.ownsMotorbike = true;
    return true;
  }

  /** Whether the character may eat right now (Ramadan fasting hours). */
  canEat(): boolean {
    const c = this.character;
    return this.calendar.canEat(this.clock.minutes, c.religionId, c.fastingEnabled);
  }
}
