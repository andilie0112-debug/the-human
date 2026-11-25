// Home layout rules (pure): where furniture may stand, feng shui, paylater and mortgages.

export interface Placement {
  id: string;
  /** Object id, or "worship:{religion}". */
  objectId: string;
  x: number;
  z: number;
  /** Degrees around Y, multiples of 90. */
  rot: number;
}

export interface Footprinted {
  footprint: [number, number];
  walkOn?: boolean;
  againstWall?: boolean;
}

export interface LayoutShape {
  width: number;
  depth: number;
  bathroom: { x0: number; z0: number; x1: number; z1: number; doorX0: number; doorX1: number };
  frontDoorX: [number, number];
}

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Axis-aligned rectangle of a placed object (rotations are multiples of 90 degrees). */
export function rectOf(p: Placement, def: Footprinted): Rect {
  const quarter = Math.round(((p.rot % 360) + 360) % 360 / 90) % 2 === 1;
  const w = quarter ? def.footprint[1] : def.footprint[0];
  const d = quarter ? def.footprint[0] : def.footprint[1];
  return { x0: p.x - w / 2, z0: p.z - d / 2, x1: p.x + w / 2, z1: p.z + d / 2 };
}

function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return a.x0 < b.x1 + gap && a.x1 > b.x0 - gap && a.z0 < b.z1 + gap && a.z1 > b.z0 - gap;
}

function inside(a: Rect, b: Rect): boolean {
  return a.x0 >= b.x0 - 1e-6 && a.x1 <= b.x1 + 1e-6 && a.z0 >= b.z0 - 1e-6 && a.z1 <= b.z1 + 1e-6;
}

export type PlacementProblem = 'outside' | 'overlap' | 'wall' | 'door' | null;

/**
 * Whether an object can stand at a placement: inside the room, not across the bathroom wall,
 * not overlapping other furniture (walk-on mats and rugs may overlap) and not blocking a door.
 */
export function checkPlacement(p: Placement, def: Footprinted, others: { p: Placement; def: Footprinted }[], layout: LayoutShape): PlacementProblem {
  const r = rectOf(p, def);
  const room: Rect = { x0: -layout.width / 2, z0: -layout.depth / 2, x1: layout.width / 2, z1: layout.depth / 2 };
  if (!inside(r, room)) return 'outside';
  const b = layout.bathroom;
  const bath: Rect = { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 };
  const wallT = 0.06;
  if (overlaps(r, bath) && !inside(r, { x0: bath.x0 + wallT, z0: bath.z0, x1: bath.x1, z1: bath.z1 - wallT })) return 'wall';
  // Keep the doorways clear.
  const frontDoor: Rect = { x0: layout.frontDoorX[0], z0: layout.depth / 2 - 0.8, x1: layout.frontDoorX[1], z1: layout.depth / 2 };
  const bathDoor: Rect = { x0: b.doorX0, z0: b.z1 - 0.6, x1: b.doorX1, z1: b.z1 + 0.6 };
  if (!def.walkOn && (overlaps(r, frontDoor) || overlaps(r, bathDoor))) return 'door';
  for (const o of others) {
    if (o.p.id === p.id) continue;
    if (def.walkOn || o.def.walkOn) continue;
    if (overlaps(r, rectOf(o.p, o.def), -0.01)) return 'overlap';
  }
  return null;
}

// --- Feng shui (Chindo characters) ----------------------------------------------------------

export interface FengShuiResult {
  score: number;
  rules: { key: string; ok: boolean }[];
}

/** Unit vector of an object's local +z (its front) for a rotation in degrees. */
function front(rotDeg: number): [number, number] {
  const a = (rotDeg * Math.PI) / 180;
  return [Math.sin(a), Math.cos(a)];
}

function nearWall(x: number, z: number, layout: LayoutShape, tol = 0.25): boolean {
  const hw = layout.width / 2;
  const hd = layout.depth / 2;
  const b = layout.bathroom;
  if (Math.abs(Math.abs(x) - hw) < tol || Math.abs(Math.abs(z) - hd) < tol) return true;
  // Bathroom walls (seen from the main room).
  if (Math.abs(z - b.z1) < tol && x > b.x0 - tol && x < b.x1 + tol) return true;
  if (Math.abs(x - b.x0) < tol && z > b.z0 - tol && z < b.z1 + tol) return true;
  return false;
}

/**
 * Five classic rules, one point each: bed head against a wall, bed not in line with the door,
 * mirror not facing the bed, a plant in a corner, desk not with its back to the door.
 */
export function fengShui(items: { p: Placement; def: Footprinted; model: string }[], layout: LayoutShape): FengShuiResult {
  const bed = items.find((i) => i.model === 'bed');
  const desk = items.find((i) => i.model === 'desk');
  const mirror = items.find((i) => i.model === 'mirror');
  const doorX = (layout.frontDoorX[0] + layout.frontDoorX[1]) / 2;
  const doorZ = layout.depth / 2;
  const rules: { key: string; ok: boolean }[] = [];

  // 1. Bed head (local -z end) against a wall.
  if (bed) {
    const [fx, fz] = front(bed.p.rot);
    const len = bed.def.footprint[1] / 2;
    rules.push({ key: 'fs.bedWall', ok: nearWall(bed.p.x - fx * len, bed.p.z - fz * len, layout) });
    // 2. Bed not in line with the door: the line straight in from the door misses the bed.
    const r = rectOf(bed.p, bed.def);
    rules.push({ key: 'fs.bedDoor', ok: !(doorX > r.x0 && doorX < r.x1) });
  } else {
    rules.push({ key: 'fs.bedWall', ok: false }, { key: 'fs.bedDoor', ok: false });
  }

  // 3. Mirror not facing the bed (no mirror is fine).
  if (mirror && bed) {
    const [fx, fz] = front(mirror.p.rot);
    const r = rectOf(bed.p, bed.def);
    let hits = false;
    for (let s = 0.2; s < 8; s += 0.1) {
      const x = mirror.p.x + fx * s;
      const z = mirror.p.z + fz * s;
      if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) hits = true;
    }
    rules.push({ key: 'fs.mirror', ok: !hits });
  } else {
    rules.push({ key: 'fs.mirror', ok: true });
  }

  // 4. A plant in a corner.
  const hw = layout.width / 2;
  const hd = layout.depth / 2;
  const corner = items.some((i) => i.model === 'plant' && Math.abs(Math.abs(i.p.x) - hw) < 0.7 && Math.abs(Math.abs(i.p.z) - hd) < 0.7);
  rules.push({ key: 'fs.plant', ok: corner });

  // 5. Desk not with its back to the door: whoever sits faces the desk (local -z), so their
  // back points to local +z; the door must not be behind them.
  if (desk) {
    const [fx, fz] = front(desk.p.rot);
    const toDoorX = doorX - desk.p.x;
    const toDoorZ = doorZ - desk.p.z;
    const len = Math.hypot(toDoorX, toDoorZ) || 1;
    rules.push({ key: 'fs.desk', ok: (fx * toDoorX + fz * toDoorZ) / len < 0.5 });
  } else {
    rules.push({ key: 'fs.desk', ok: true });
  }

  return { score: rules.filter((r) => r.ok).length, rules };
}

// --- Paylater and mortgage --------------------------------------------------------------------

export interface Debt {
  id: string;
  labelKey: string;
  monthly: number;
  monthsLeft: number;
}

export interface FinanceConfig {
  paylaterMonths: number;
  paylaterInterestPerMonth: number;
  mortgageYears: number;
  mortgageInterestPerYear: number;
  mortgageDownPayment: number;
  mortgageMinMonthsEmployed: number;
  mortgageIncomeRatio: number;
  sellBackShare: number;
  kontrakanRentFactor: number;
  movingCost: number;
}

/** Monthly paylater instalment: price plus flat monthly interest, split evenly. */
export function paylaterInstalment(price: number, cfg: FinanceConfig): number {
  return Math.ceil((price * (1 + cfg.paylaterInterestPerMonth * cfg.paylaterMonths)) / cfg.paylaterMonths / 100) * 100;
}

/** Annuity instalment for a loan. */
export function annuity(principal: number, yearlyRate: number, years: number): number {
  const r = yearlyRate / 12;
  const n = years * 12;
  return Math.round((principal * r) / (1 - (1 + r) ** -n));
}

export interface MortgageQuote {
  downPayment: number;
  principal: number;
  monthly: number;
}

export function mortgageQuote(housePrice: number, cfg: FinanceConfig): MortgageQuote {
  const downPayment = Math.round(housePrice * cfg.mortgageDownPayment);
  const principal = housePrice - downPayment;
  return { downPayment, principal, monthly: annuity(principal, cfg.mortgageInterestPerYear, cfg.mortgageYears) };
}

export type MortgageBlock = 'noJob' | 'tooNew' | 'income' | 'downPayment' | null;

export function mortgageBlock(q: MortgageQuote, opts: { monthsEmployed: number | null; monthlyGross: number; balance: number }, cfg: FinanceConfig): MortgageBlock {
  if (opts.monthsEmployed === null) return 'noJob';
  if (opts.monthsEmployed < cfg.mortgageMinMonthsEmployed) return 'tooNew';
  if (opts.monthlyGross < q.monthly * cfg.mortgageIncomeRatio) return 'income';
  if (opts.balance < q.downPayment) return 'downPayment';
  return null;
}
