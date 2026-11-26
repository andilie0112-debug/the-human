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
