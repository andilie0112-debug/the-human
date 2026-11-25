import { describe, expect, it } from 'vitest';
import { annuity, checkPlacement, fengShui, mortgageBlock, mortgageQuote, paylaterInstalment, rectOf, type LayoutShape, type Placement } from '../../../src/sim/home';
import kos from '../../../src/data/rooms/kos.json';
import sim from '../../../src/data/sim.json';

const layout = kos as unknown as LayoutShape;
const bedDef = { footprint: [1.1, 2.05] as [number, number] };
const plantDef = { footprint: [0.4, 0.4] as [number, number] };
const deskDef = { footprint: [1.2, 0.6] as [number, number] };
const matDef = { footprint: [0.7, 1.6] as [number, number], walkOn: true };
const p = (id: string, x: number, z: number, rot = 0): Placement => ({ id, objectId: id, x, z, rot });

describe('placement rules', () => {
  it('rotated footprints swap width and depth', () => {
    expect(rectOf(p('bed', 0, 0, 90), bedDef)).toEqual({ x0: -1.025, z0: -0.55, x1: 1.025, z1: 0.55 });
  });

  it('must stay inside the room', () => {
    expect(checkPlacement(p('bed', 2.8, 0), bedDef, [], layout)).toBe('outside');
    expect(checkPlacement(p('bed', 0, 0), bedDef, [], layout)).toBeNull();
  });

  it('cannot overlap other furniture, but mats may', () => {
    const others = [{ p: p('desk', 0, 0), def: deskDef }];
    expect(checkPlacement(p('plant', 0.2, 0.1), plantDef, others, layout)).toBe('overlap');
    expect(checkPlacement(p('mat', 0.2, 0.1), matDef, others, layout)).toBeNull();
  });

  it('cannot stand across the bathroom wall or block a doorway', () => {
    expect(checkPlacement(p('plant', 1.6, -1.5), plantDef, [], layout)).toBe('wall');
    expect(checkPlacement(p('plant', 2.3, -1.4), plantDef, [], layout)).toBe('door');
    expect(checkPlacement(p('plant', -0.45, 2.2), plantDef, [], layout)).toBe('door');
    expect(checkPlacement(p('plant', 2.4, -2.2), plantDef, [], layout)).toBeNull(); // fully inside the bathroom
  });
});

describe('feng shui', () => {
  const item = (id: string, model: string, x: number, z: number, rot: number, footprint: [number, number]) => ({ p: p(id, x, z, rot), def: { footprint }, model });

  it('scores the default kos and improves with a plant in a corner', () => {
    const base = [item('bed', 'bed', -2.4, -1.45, 0, [1.1, 2.05]), item('desk', 'desk', -0.3, -2.15, 0, [1.2, 0.6])];
    const r = fengShui(base, layout);
    expect(r.rules.find((x) => x.key === 'fs.bedWall')?.ok).toBe(true);
    expect(r.rules.find((x) => x.key === 'fs.bedDoor')?.ok).toBe(true);
    expect(r.rules.find((x) => x.key === 'fs.plant')?.ok).toBe(false);
    const withPlant = fengShui([...base, item('plant', 'plant', 2.65, 2.15, 0, [0.4, 0.4])], layout);
    expect(withPlant.score).toBe(r.score + 1);
  });

  it('a bed in line with the door, or a mirror facing the bed, costs points', () => {
    const bedInLine = [item('bed', 'bed', -0.45, 0, 0, [1.1, 2.05])];
    expect(fengShui(bedInLine, layout).rules.find((x) => x.key === 'fs.bedDoor')?.ok).toBe(false);
    const mirror = [item('bed', 'bed', -2.4, -1.45, 0, [1.1, 2.05]), item('m', 'mirror', -2.4, 1.5, 180, [0.5, 0.1])];
    expect(fengShui(mirror, layout).rules.find((x) => x.key === 'fs.mirror')?.ok).toBe(false);
  });

  it('a desk with its back to the door costs a point', () => {
    const facingWall = [item('desk', 'desk', -0.3, -2.15, 0, [1.2, 0.6])];
    const backToDoor = [item('desk', 'desk', -0.45, 0, 0, [1.2, 0.6])];
    expect(fengShui(facingWall, layout).rules.find((x) => x.key === 'fs.desk')?.ok).toBe(false);
    expect(fengShui([item('desk', 'desk', -0.45, 1.0, 180, [1.2, 0.6])], layout).rules.find((x) => x.key === 'fs.desk')?.ok).toBe(true);
    void backToDoor;
  });
});

describe('paylater and mortgage', () => {
  const cfg = sim.finance;
  it('paylater adds flat monthly interest', () => {
    expect(paylaterInstalment(1200000, cfg)).toBe(Math.ceil((1200000 * (1 + 0.025 * 3)) / 3 / 100) * 100);
  });

  it('mortgage: 10% down payment, 8% for 15 years', () => {
    const q = mortgageQuote(500000000, cfg);
    expect(q.downPayment).toBe(50000000);
    expect(q.monthly).toBe(annuity(450000000, 0.08, 15));
    expect(q.monthly).toBeGreaterThan(4200000);
    expect(q.monthly).toBeLessThan(4400000);
  });

  it('mortgage needs 6 months of work, income of 3x the instalment and the down payment', () => {
    const q = mortgageQuote(500000000, cfg);
    expect(mortgageBlock(q, { monthsEmployed: null, monthlyGross: 0, balance: 0 }, cfg)).toBe('noJob');
    expect(mortgageBlock(q, { monthsEmployed: 3, monthlyGross: 20000000, balance: 1e9 }, cfg)).toBe('tooNew');
    expect(mortgageBlock(q, { monthsEmployed: 12, monthlyGross: 6000000, balance: 1e9 }, cfg)).toBe('income');
    expect(mortgageBlock(q, { monthsEmployed: 12, monthlyGross: 20000000, balance: 1000 }, cfg)).toBe('downPayment');
    expect(mortgageBlock(q, { monthsEmployed: 12, monthlyGross: 20000000, balance: 1e9 }, cfg)).toBeNull();
  });
});
