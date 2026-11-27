// Keeping house: the floor gets dusty, the table sticky, dishes pile up after cooking and eating,
// worn clothes fill the laundry basket. Sweeping and mopping, wiping the table, washing the dishes
// and the laundry (wash, hang out to dry, fold away, iron) put it right. A tidy home lifts the mood a
// little; a messy one weighs on it.

export interface Chores {
  /** 0 (dirty) .. 100 (clean). */
  floor: number;
  table: number;
  /** Counts. */
  dishes: number;
  dirtyClothes: number;
  /** Clothes washed and hanging out; dry from this game minute. */
  hanging: number;
  dryAt: number;
  /** Dry clothes waiting to be folded. */
  dryClothes: number;
  /** Folded clothes still wrinkled, waiting for the iron. */
  toIron?: number;
}

export interface HouseworkConfig {
  floorDirtPerDay: number;
  tableDirtPerDay: number;
  dirtyClothesPerDay: number;
  dryingHours: number;
  /** Drying takes this much longer while it rains. */
  rainDryingFactor: number;
  messyBelow: number;
  tidyAbove: number;
}

export function freshChores(): Chores {
  return { floor: 80, table: 80, dishes: 0, dirtyClothes: 2, hanging: 0, dryAt: 0, dryClothes: 0, toIron: 0 };
}

/** Overall tidiness 0..100 (floor, table, dishes and laundry together). */
export function tidiness(c: Chores): number {
  const dishes = Math.max(0, 100 - c.dishes * 15);
  const laundry = Math.max(0, 100 - c.dirtyClothes * 10 - (c.toIron ?? 0) * 3);
  return Math.round((c.floor * 0.35 + c.table * 0.2 + dishes * 0.25 + laundry * 0.2));
}

/** A day passes: dust, crumbs and worn clothes (more with children at home). */
export function choresDay(c: Chores, cfg: HouseworkConfig, people: number): void {
  c.floor = Math.max(0, c.floor - cfg.floorDirtPerDay * people);
  c.table = Math.max(0, c.table - cfg.tableDirtPerDay * people);
  c.dirtyClothes += cfg.dirtyClothesPerDay * people;
}

export type Chore = 'sapu' | 'pel' | 'lap' | 'cuciPiring' | 'cuciBaju' | 'jemur' | 'lipat' | 'setrika';

/** Whether a chore can be done now (something to wash, something dry to fold...). */
export function choreAvailable(c: Chores, chore: Chore, now: number): boolean {
  switch (chore) {
    case 'cuciPiring':
      return c.dishes > 0;
    case 'cuciBaju':
      return c.dirtyClothes > 0 && c.hanging === 0;
    case 'jemur':
      return c.hanging > 0 && c.dryAt === 0;
    case 'lipat':
      return c.dryClothes > 0 || (c.hanging > 0 && c.dryAt > 0 && now >= c.dryAt);
    case 'setrika':
      return (c.toIron ?? 0) > 0;
    default:
      return true;
  }
}

/** Does a chore (at the end of its action). */
export function doChore(c: Chores, chore: Chore, now: number, cfg: HouseworkConfig, raining: boolean): void {
  switch (chore) {
    case 'sapu':
      c.floor = Math.min(100, c.floor + 45);
      break;
    case 'pel':
      c.floor = 100;
      break;
    case 'lap':
      c.table = 100;
      break;
    case 'cuciPiring':
      c.dishes = 0;
      break;
    case 'cuciBaju':
      // Washed and wet: waiting to be hung out.
      c.hanging = c.dirtyClothes;
      c.dirtyClothes = 0;
      c.dryAt = 0;
      break;
    case 'jemur':
      c.dryAt = now + cfg.dryingHours * 60 * (raining ? cfg.rainDryingFactor : 1);
      break;
    case 'lipat':
      if (c.hanging > 0 && c.dryAt > 0 && now >= c.dryAt) {
        c.dryClothes += c.hanging;
        c.hanging = 0;
        c.dryAt = 0;
      }
      // Folded, but still wrinkled until ironed.
      c.toIron = (c.toIron ?? 0) + c.dryClothes;
      c.dryClothes = 0;
      break;
    case 'setrika':
      c.toIron = 0;
      break;
  }
}
