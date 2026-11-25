import { describe, expect, it } from 'vitest';
import { needStatus, type Vitals } from '../../../src/sim/needs';

const fine = (): Vitals => ({ needs: { kenyang: 80, energi: 80, bersih: 80, sosial: 80, hiburan: 80 }, stress: 10, health: 100, sick: false, kangen: 0 });

describe('need status marker', () => {
  it('green when all needs are fine', () => {
    expect(needStatus(fine())).toBe('ok');
  });
  it('orange when a need is low, stress is high or the character is sick', () => {
    const a = fine();
    a.needs.kenyang = 30;
    expect(needStatus(a)).toBe('low');
    const b = fine();
    b.stress = 75;
    expect(needStatus(b)).toBe('low');
    const c = fine();
    c.sick = true;
    expect(needStatus(c)).toBe('low');
  });
  it('red when a need has run out or health is critical', () => {
    const a = fine();
    a.needs.energi = 5;
    expect(needStatus(a)).toBe('empty');
    const b = fine();
    b.health = 10;
    expect(needStatus(b)).toBe('empty');
  });
});
