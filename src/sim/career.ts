import type { ActionDef } from './actions';
import { MINUTES_PER_DAY, dayIndex, fromDate, minuteOfDay, toParts } from './time';

// Job hunting and work (GDD section 6): weekly listings, CV, waiting, ghosting, interviews,
// offers, shifts, lateness, absences and warning letters (SP1-SP3), sick and annual leave,
// promotions and rare layoffs. Pure simulation; the phone UI reads and drives it.

export type SkillId = 'logika' | 'karisma' | 'kreatif' | 'masak' | 'fisik';
export const SKILLS: SkillId[] = ['logika', 'karisma', 'kreatif', 'masak', 'fisik'];

export interface JobData {
  id: string;
  title: string;
  industry: string;
  minEducation: string;
  requiredSkills: Partial<Record<SkillId, number>>;
  salaryMultiplierOfMinimumWage: number;
  shiftStart: number;
  shiftEnd: number;
  /** 0 = Sunday .. 6 = Saturday */
  workDays: number[];
  stressFactor: number;
  companies: string[];
}

export interface InterviewQuestion {
  question: string;
  answers: { text: string; score: number }[];
}

export interface CareerConfig {
  listingsPerWeek: number;
  ghostChance: number;
  replyDaysMin: number;
  replyDaysMax: number;
  experienceBonusPerYear: number;
  passScore: number;
  commuteMinutes: number;
  transportCostPerTrip: number;
  lateGraceMinutes: number;
  absentAfterMinutes: number;
  absencesPerWarning: number;
  annualLeaveDays: number;
  promotionPerformance: number;
  promotionMonths: number;
  promotionRaise: number;
  layoffChancePerMonth: number;
  stressPerWorkHour: number;
}

export interface Listing {
  id: string;
  jobId: string;
  company: string;
  salary: number;
  postedDay: number;
}

export type ApplicationStatus = 'sent' | 'rejected' | 'ghosted' | 'interview' | 'interviewed' | 'offer' | 'declined' | 'accepted' | 'failed';

export interface Application {
  id: string;
  listingId: string;
  jobId: string;
  company: string;
  salary: number;
  status: ApplicationStatus;
  /** Game minute when the company replies (or the interview result arrives). */
  replyAt: number;
  interviewAt?: number;
  reason?: 'education' | 'score' | 'missed';
  score?: number;
}

export interface Job {
  jobId: string;
  company: string;
  monthlyGross: number;
  startMinute: number;
  /** 0 = staff, 1 = senior, 2 = supervisor, 3 = manager */
  level: number;
  levelSinceMinute: number;
  performance: number;
  warnings: number;
  absencesSinceWarning: number;
  absentDaysThisMonth: number;
  leaveDaysLeft: number;
  /** Day indices excused from work (leave, sick leave, holidays are automatic). */
  excusedDays: number[];
  /** Day index of the last shift worked or missed (so each day is judged once). */
  lastJudgedDay: number;
}

export interface Message {
  time: number;
  from: string;
  textKey: string;
  params: Record<string, string | number>;
}

export interface CareerSave {
  listings: Listing[];
  applications: Application[];
  job: Job | null;
  inbox: Message[];
  pendingStart: { offer: Application; startAt: number } | null;
  nextId: number;
  lastListingWeek: number;
}

export type CareerEvent =
  | { kind: 'message'; message: Message }
  | { kind: 'hired'; job: Job }
  | { kind: 'fired'; reason: 'warnings' | 'layoff'; severance: number };

/** What the career needs from the session (avoids an import cycle). */
export interface CareerHost {
  now: () => number;
  rng: () => number;
  cityMinimumWage: () => number;
  education: () => string;
  experienceYears: () => number;
  skills: () => Record<SkillId, number>;
  traits: () => string[];
  /** 0..100 impression at the interview: hygiene, mood, clothes. */
  presentation: () => number;
  pay: (amount: number, labelKey: string) => void;
  isPublicHoliday: (t: number) => boolean;
}

const EDUCATION_RANK: Record<string, number> = { 'SMA/SMK': 0, D3: 1, S1: 2, S2: 3 };
const LEVEL_KEYS = ['level.0', 'level.1', 'level.2', 'level.3'];

export class Career {
  listings: Listing[] = [];
  applications: Application[] = [];
  job: Job | null = null;
  inbox: Message[] = [];
  /** Game minute when the next job begins (accepted offer). */
  pendingStart: { offer: Application; startAt: number } | null = null;
  private nextId = 1;
  private lastListingWeek = -1;

  constructor(
    private readonly host: CareerHost,
    private readonly jobs: readonly JobData[],
    private readonly cfg: CareerConfig,
    private readonly cityIndustries: () => string[],
  ) {}

  jobData(id: string): JobData {
    const j = this.jobs.find((x) => x.id === id);
    if (!j) throw new Error(`unknown job ${id}`);
    return j;
  }

  /** Monthly gross for a job in this city, with an experience bonus. */
  salaryFor(job: JobData): number {
    const base = this.host.cityMinimumWage() * job.salaryMultiplierOfMinimumWage;
    return Math.round((base * (1 + this.cfg.experienceBonusPerYear * this.host.experienceYears())) / 1000) * 1000;
  }

  private send(out: CareerEvent[], from: string, textKey: string, params: Record<string, string | number> = {}): void {
    const message: Message = { time: this.host.now(), from, textKey, params };
    this.inbox.push(message);
    if (this.inbox.length > 200) this.inbox.shift();
    out.push({ kind: 'message', message });
  }

  /** New listings every Monday (and on the very first day). */
  refreshListings(t: number): void {
    const week = Math.floor((dayIndex(t) + 4) / 7); // weeks start on Monday (1 Jan 2027 is a Friday)
    if (week === this.lastListingWeek) return;
    this.lastListingWeek = week;
    const industries = new Set(this.cityIndustries());
    const pool = this.jobs.filter((j) => industries.has(j.industry));
    const listings: Listing[] = [];
    for (let i = 0; i < this.cfg.listingsPerWeek && pool.length > 0; i++) {
      const job = pool[Math.floor(this.host.rng() * pool.length)];
      const company = job.companies[Math.floor(this.host.rng() * job.companies.length)];
      if (listings.some((l) => l.jobId === job.id && l.company === company)) continue;
      listings.push({ id: `L${this.nextId++}`, jobId: job.id, company, salary: this.salaryFor(job), postedDay: dayIndex(t) });
    }
    this.listings = listings;
  }

  meetsEducation(job: JobData): boolean {
    return (EDUCATION_RANK[this.host.education()] ?? 0) >= (EDUCATION_RANK[job.minEducation] ?? 0);
  }

  hasApplied(listingId: string): boolean {
    return this.applications.some((a) => a.listingId === listingId);
  }

  /** Called after a CV is sent (the session ticks off today's task). */
  onApplied: (() => void) | null = null;

  /** Sends a CV. The company answers in a few days (or never: ghosting). */
  apply(listingId: string): Application | null {
    const l = this.listings.find((x) => x.id === listingId);
    if (!l || this.hasApplied(listingId)) return null;
    const now = this.host.now();
    const days = this.cfg.replyDaysMin + Math.floor(this.host.rng() * (this.cfg.replyDaysMax - this.cfg.replyDaysMin + 1));
    const app: Application = { id: `A${this.nextId++}`, listingId, jobId: l.jobId, company: l.company, salary: l.salary, status: 'sent', replyAt: now + days * MINUTES_PER_DAY };
    this.applications.push(app);
    this.onApplied?.();
    return app;
  }

  /** Interview score 0..100 from answers (0..1 share of the best answers), presentation, experience and skills. */
  interviewScore(answerShare: number, jobId: string): number {
    const job = this.jobData(jobId);
    const skills = this.host.skills();
    let missing = 0;
    for (const [k, need] of Object.entries(job.requiredSkills) as [SkillId, number][]) missing += Math.max(0, need - (skills[k] ?? 0));
    const score = answerShare * 60 + this.host.presentation() * 0.3 + Math.min(10, this.host.experienceYears() * 2) - Math.min(20, missing * 5);
    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /** Called when the character attends an interview and answers the questions. */
  attendInterview(appId: string, answerShare: number): void {
    const app = this.applications.find((a) => a.id === appId);
    if (!app || app.status !== 'interview') return;
    app.score = this.interviewScore(answerShare, app.jobId);
    app.status = 'interviewed';
    app.replyAt = this.host.now() + MINUTES_PER_DAY;
  }

  /** The interview the character can go to right now (from 2 hours before until 1 hour after). */
  interviewNow(): Application | null {
    const now = this.host.now();
    return this.applications.find((a) => a.status === 'interview' && a.interviewAt !== undefined && now >= a.interviewAt - 120 && now <= a.interviewAt + 60) ?? null;
  }

  acceptOffer(appId: string, out: CareerEvent[] = []): boolean {
    const app = this.applications.find((a) => a.id === appId);
    if (!app || app.status !== 'offer') return false;
    for (const a of this.applications) if (a.status === 'offer' && a.id !== appId) a.status = 'declined';
    app.status = 'accepted';
    // Starts next Monday at 00:00.
    const now = this.host.now();
    const p = toParts(now);
    const daysToMonday = ((8 - p.weekday) % 7) || 7;
    const startAt = fromDate(p.year, p.month, p.day) + daysToMonday * MINUTES_PER_DAY;
    this.pendingStart = { offer: app, startAt };
    this.send(out, app.company, 'msg.welcome', { company: app.company, date: `${toParts(startAt).day}/${toParts(startAt).month}` });
    return true;
  }

  declineOffer(appId: string): void {
    const app = this.applications.find((a) => a.id === appId);
    if (app?.status === 'offer') app.status = 'declined';
  }

  isWorkDay(t: number): boolean {
    if (!this.job) return false;
    const data = this.jobData(this.job.jobId);
    return data.workDays.includes(toParts(t).weekday) && !this.host.isPublicHoliday(t);
  }

  /** Scheduled work days of a job in the month containing t (for the absence deduction). */
  workDaysInMonth(t: number): number {
    if (!this.job) return 0;
    const data = this.jobData(this.job.jobId);
    const p = toParts(t);
    let n = 0;
    for (let d = 1; d <= 31; d++) {
      const day = fromDate(p.year, p.month, d);
      if (toParts(day).month !== p.month) break;
      if (data.workDays.includes(toParts(day).weekday)) n++;
    }
    return n;
  }

  /** Whether the character can leave for work now (from 90 minutes before the shift until it ends). */
  canGoToWork(t: number): boolean {
    if (!this.job || !this.isWorkDay(t) || this.job.lastJudgedDay === dayIndex(t)) return false;
    const data = this.jobData(this.job.jobId);
    const m = minuteOfDay(t);
    return m >= data.shiftStart * 60 - 90 && m < data.shiftEnd * 60 - 60;
  }

  /** An away action lasting the commute, the rest of the shift and the way home. */
  workAction(t: number): ActionDef | null {
    if (!this.job || !this.canGoToWork(t)) return null;
    const data = this.jobData(this.job.jobId);
    const arrive = minuteOfDay(t) + this.cfg.commuteMinutes;
    const shiftEnd = data.shiftEnd * 60;
    const duration = Math.max(60, shiftEnd - arrive) + 2 * this.cfg.commuteMinutes;
    const stress = this.cfg.stressPerWorkHour * data.stressFactor;
    return {
      id: 'go_work',
      labelKey: 'act.goWork',
      durationMinutes: duration,
      cost: this.cfg.transportCostPerTrip * 2,
      activity: 'working',
      fastForward: true,
      animation: 'away',
      needsPerHour: { kenyang: 4, sosial: 6, hiburan: -1 },
      stressPerHour: stress,
    };
  }

  /** The character arrives at work: lateness and performance are judged now. */
  startShift(t: number, out: CareerEvent[], commuteMinutes = this.cfg.commuteMinutes): void {
    if (!this.job) return;
    const data = this.jobData(this.job.jobId);
    const arrive = minuteOfDay(t) + commuteMinutes;
    const late = arrive - data.shiftStart * 60 > this.cfg.lateGraceMinutes;
    this.job.lastJudgedDay = dayIndex(t);
    const rajin = this.host.traits().includes('rajin') ? 1 : 0;
    this.job.performance = clamp(this.job.performance + (late ? -3 : 2 + rajin));
    if (late) this.send(out, this.job.company, 'msg.late', {});
  }

  /** Hourly check: absences after the shift has started without the character. */
  checkAbsence(t: number, out: CareerEvent[]): void {
    const job = this.job;
    if (!job || !this.isWorkDay(t) || job.lastJudgedDay === dayIndex(t)) return;
    const data = this.jobData(job.jobId);
    if (minuteOfDay(t) < data.shiftStart * 60 + this.cfg.absentAfterMinutes) return;
    job.lastJudgedDay = dayIndex(t);
    if (job.excusedDays.includes(dayIndex(t))) return;
    job.absentDaysThisMonth += 1;
    job.absencesSinceWarning += 1;
    job.performance = clamp(job.performance - 8);
    if (job.absencesSinceWarning >= this.cfg.absencesPerWarning) {
      job.absencesSinceWarning = 0;
      job.warnings += 1;
      if (job.warnings > 3) {
        this.fire(out, 'warnings', 0);
        return;
      }
      this.send(out, job.company, `msg.sp${job.warnings}`, {});
    } else {
      this.send(out, job.company, 'msg.absent', {});
    }
  }

  /** Sick leave for today (only when actually sick): excused, no deduction. */
  requestSickLeave(t: number, sick: boolean, out: CareerEvent[] = []): boolean {
    if (!this.job || !sick) return false;
    const d = dayIndex(t);
    if (!this.job.excusedDays.includes(d)) this.job.excusedDays.push(d);
    this.send(out, this.job.company, 'msg.sickOk', {});
    return true;
  }

  /** A trip of `days` days starting now: work days use annual leave while it lasts. */
  useLeaveFor(t: number, days: number): number {
    if (!this.job) return 0;
    let used = 0;
    for (let i = 0; i < days; i++) {
      const day = t + i * MINUTES_PER_DAY;
      const d = dayIndex(day);
      if (!this.isWorkDay(day) || this.job.excusedDays.includes(d) || this.job.leaveDaysLeft <= 0) continue;
      this.job.excusedDays.push(d);
      this.job.leaveDaysLeft -= 1;
      used++;
    }
    return used;
  }

  /** Annual leave for tomorrow, if days are left. */
  requestLeave(t: number, out: CareerEvent[] = []): boolean {
    if (!this.job || this.job.leaveDaysLeft <= 0) return false;
    const d = dayIndex(t) + 1;
    if (this.job.excusedDays.includes(d)) return false;
    this.job.excusedDays.push(d);
    this.job.leaveDaysLeft -= 1;
    this.send(out, this.job.company, 'msg.leaveOk', { left: this.job.leaveDaysLeft });
    return true;
  }

  private fire(out: CareerEvent[], reason: 'warnings' | 'layoff', severance: number): void {
    if (!this.job) return;
    const company = this.job.company;
    this.job = null;
    if (severance > 0) this.host.pay(severance, 'tx.severance');
    this.send(out, company, reason === 'layoff' ? 'msg.layoff' : 'msg.fired', { amount: severance });
    out.push({ kind: 'fired', reason, severance });
  }

  /** Daily rules at midnight. */
  onNewDay(t: number, out: CareerEvent[]): void {
    this.refreshListings(t);
    const now = t;
    // Replies from companies.
    for (const a of this.applications) {
      if (a.replyAt > now) continue;
      if (a.status === 'sent') {
        const job = this.jobData(a.jobId);
        if (!this.meetsEducation(job)) {
          a.status = 'rejected';
          a.reason = 'education';
          this.send(out, a.company, 'msg.rejectEducation', { job: job.title, edu: job.minEducation });
        } else if (this.host.rng() < this.cfg.ghostChance) {
          a.status = 'ghosted';
        } else {
          a.status = 'interview';
          const day = dayIndex(now) + 2 + Math.floor(this.host.rng() * 2);
          const hour = 9 + Math.floor(this.host.rng() * 6);
          a.interviewAt = day * MINUTES_PER_DAY + hour * 60;
          const ip = toParts(a.interviewAt);
          this.send(out, a.company, 'msg.interview', { job: job.title, date: `${ip.day}/${ip.month}`, time: `${String(ip.hour).padStart(2, '0')}:00` });
        }
      } else if (a.status === 'interviewed') {
        const job = this.jobData(a.jobId);
        if ((a.score ?? 0) >= this.cfg.passScore) {
          a.status = 'offer';
          this.send(out, a.company, 'msg.offer', { job: job.title, salary: a.salary });
        } else {
          a.status = 'rejected';
          a.reason = 'score';
          this.send(out, a.company, 'msg.rejectInterview', { job: job.title });
        }
      }
    }
    // Missed interviews.
    for (const a of this.applications) {
      if (a.status === 'interview' && a.interviewAt !== undefined && now > a.interviewAt + 60) {
        a.status = 'failed';
        a.reason = 'missed';
        this.send(out, a.company, 'msg.missedInterview', {});
      }
    }
    // A new job begins.
    if (this.pendingStart && now >= this.pendingStart.startAt) {
      const o = this.pendingStart.offer;
      this.pendingStart = null;
      this.job = {
        jobId: o.jobId,
        company: o.company,
        monthlyGross: o.salary,
        startMinute: now,
        level: 0,
        levelSinceMinute: now,
        performance: 50,
        warnings: 0,
        absencesSinceWarning: 0,
        absentDaysThisMonth: 0,
        leaveDaysLeft: this.cfg.annualLeaveDays,
        excusedDays: [],
        lastJudgedDay: -1,
      };
      out.push({ kind: 'hired', job: this.job });
    }
    // Monthly review on the 1st: promotion or (rarely) layoff.
    const p = toParts(t);
    const job = this.job;
    if (job && p.day === 1 && now > job.startMinute) {
      job.excusedDays = job.excusedDays.filter((d) => d >= dayIndex(now));
      const months = (now - job.levelSinceMinute) / (30 * MINUTES_PER_DAY);
      if (this.host.rng() < this.cfg.layoffChancePerMonth) {
        const years = Math.max(1, Math.floor((now - job.startMinute) / (365 * MINUTES_PER_DAY)));
        this.fire(out, 'layoff', job.monthlyGross * years);
      } else if (job.performance >= this.cfg.promotionPerformance && months >= this.cfg.promotionMonths && job.level < 3) {
        job.level += 1;
        job.levelSinceMinute = now;
        job.monthlyGross = Math.round((job.monthlyGross * (1 + this.cfg.promotionRaise)) / 1000) * 1000;
        this.send(out, job.company, 'msg.promoted', { level: LEVEL_KEYS[job.level], salary: job.monthlyGross });
      }
    }
  }

  /** Plain data for saving. */
  toSave(): CareerSave {
    return { listings: this.listings, applications: this.applications, job: this.job, inbox: this.inbox, pendingStart: this.pendingStart, nextId: this.nextId, lastListingWeek: this.lastListingWeek };
  }

  restore(d: CareerSave): void {
    this.listings = d.listings;
    this.applications = d.applications;
    this.job = d.job;
    this.inbox = d.inbox;
    this.pendingStart = d.pendingStart;
    this.nextId = d.nextId;
    this.lastListingWeek = d.lastListingWeek;
  }

  /** Resets the monthly absence count after payday. */
  afterPayday(): void {
    if (this.job) this.job.absentDaysThisMonth = 0;
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}
