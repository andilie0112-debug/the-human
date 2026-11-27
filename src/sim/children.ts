// Children: a married couple can try for a baby or adopt. A child grows on the same game years as
// the character (bayi, balita, anak, remaja, dewasa), costs money every month (milk and nappies,
// then school fees) and is happier with time spent together. Grown-up children move out.

export type ChildStage = 'bayi' | 'balita' | 'anak' | 'remaja' | 'dewasa';

export interface ChildrenConfig {
  /** Chance per try (once a day at most) that a baby is on the way. */
  conceiveChance: number;
  /** Pregnancy length as a share of a game year. */
  pregnancyShareOfYear: number;
  adoptionCost: number;
  /** Adoption paperwork as a share of a game year. */
  adoptionShareOfYear: number;
  /** Monthly cost per child by stage. */
  monthlyCost: Record<ChildStage, number>;
  /** Happiness lost per day without time together; gained per activity. */
  happinessDecayPerDay: number;
  playGain: number;
  studyGain: number;
  school: SchoolConfig;
}

export interface Child {
  id: string;
  name: string;
  gender: 'male' | 'female';
  age: number;
  ageDays: number;
  /** 0..100 */
  happiness: number;
  /** Learning (0..10): helps later school results. */
  study: number;
}

export interface Expecting {
  /** Game day the baby arrives. */
  dueDay: number;
  adopted: boolean;
}

export function childStage(age: number): ChildStage {
  if (age < 2) return 'bayi';
  if (age < 6) return 'balita';
  if (age < 13) return 'anak';
  if (age < 18) return 'remaja';
  return 'dewasa';
}

/** Total monthly cost of the children living at home. */
export function monthlyChildCost(children: readonly Child[], cfg: ChildrenConfig): number {
  return children.reduce((sum, c) => sum + cfg.monthlyCost[childStage(c.age)], 0);
}

// --- School --------------------------------------------------------------------------------
// Children go to school on weekdays: SD (6-12), SMP (13-15) and SMA (16-17). They put on their
// uniform at six, leave at half past, and come home after lessons (SD earliest, SMA latest). No
// school on public holidays or in the semester holidays. Lessons add to what they have learned,
// and twice a year the report card (rapor) comes home.

export type SchoolLevel = 'SD' | 'SMP' | 'SMA';

export interface SchoolConfig {
  /** School days (0 = Sunday). */
  days: number[];
  /** Hour the uniform goes on, hour they leave. */
  dressHour: number;
  leaveHour: number;
  /** Hour lessons end, per level (they are home about half an hour later). */
  endHour: Record<SchoolLevel, number>;
  /** Learning gained per school day. */
  studyPerDay: number;
  /** Semester holidays: [month, day] from and to (inclusive). */
  holidays: [[number, number], [number, number]][];
  /** Report card days: [month, day]. */
  raporDays: [number, number][];
}

export function schoolLevel(age: number): SchoolLevel | null {
  if (age >= 6 && age <= 12) return 'SD';
  if (age >= 13 && age <= 15) return 'SMP';
  if (age >= 16 && age <= 17) return 'SMA';
  return null;
}

export interface SchoolDay {
  month: number;
  day: number;
  weekday: number;
  /** A public holiday today. */
  holiday: boolean;
}

/** Whether there is school today for children (school day, not a holiday). */
export function isSchoolDay(d: SchoolDay, cfg: SchoolConfig): boolean {
  if (d.holiday || !cfg.days.includes(d.weekday)) return false;
  const md = d.month * 100 + d.day;
  return !cfg.holidays.some(([[m1, d1], [m2, d2]]) => md >= m1 * 100 + d1 && md <= m2 * 100 + d2);
}

export type SchoolState = 'home' | 'uniform' | 'away';

/** Where a child is at this hour: at home, at home in uniform about to leave, or away at school. */
export function schoolState(age: number, d: SchoolDay, hour: number, cfg: SchoolConfig): SchoolState {
  const level = schoolLevel(age);
  if (!level || !isSchoolDay(d, cfg)) return 'home';
  if (hour >= cfg.dressHour && hour < cfg.leaveHour) return 'uniform';
  if (hour >= cfg.leaveHour && hour < cfg.endHour[level] + 0.5) return 'away';
  return 'home';
}

/** Report card grade from what the child learned and how happy they are at home. */
export function raporGrade(child: Pick<Child, 'study' | 'happiness'>): 'A' | 'B' | 'C' | 'D' {
  const score = Math.min(10, child.study) * 7 + child.happiness * 0.3;
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 45) return 'C';
  return 'D';
}
