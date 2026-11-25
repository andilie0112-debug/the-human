import { describe, expect, it } from 'vitest';
import { absenceDeduction, computePayslip, monthlyIncomeTax, progressiveTax, thrAmount } from '../../../src/sim/payroll';
import sim from '../../../src/data/sim.json';

const cfg = sim.payroll;

describe('payslip', () => {
  it('Jakarta minimum wage: 4% BPJS and a small PPh 21', () => {
    const p = computePayslip(5729876, cfg);
    expect(p.bpjsKesehatan).toBe(57299);
    expect(p.jht).toBe(114598);
    expect(p.jp).toBe(57299);
    expect(p.bpjs).toBe(229196);
    expect(p.tax).toBe(38571);
    expect(p.net).toBe(5729876 - 229196 - 38571);
  });

  it('no income tax below the PTKP threshold', () => {
    expect(monthlyIncomeTax(3500000, cfg)).toBe(0);
  });

  it('applies BPJS wage caps and higher tax brackets', () => {
    const p = computePayslip(30000000, cfg);
    expect(p.bpjsKesehatan).toBe(120000);
    expect(p.jp).toBe(105474);
    expect(p.tax).toBe(3490292);
  });

  it('progressive brackets', () => {
    expect(progressiveTax(60000000, cfg.taxBrackets)).toBe(3000000);
    expect(progressiveTax(100000000, cfg.taxBrackets)).toBe(3000000 + 6000000);
  });

  it('deducts a day of pay per unexcused absence', () => {
    expect(absenceDeduction(5200000, 26, 2)).toBe(400000);
    const p = computePayslip(5200000, cfg, { workDays: 26, absentDays: 2 });
    expect(p.absenceDeduction).toBe(400000);
  });
});

describe('THR', () => {
  it('one month salary after 12 months, prorated before, nothing under a month', () => {
    expect(thrAmount(6000000, 12)).toBe(6000000);
    expect(thrAmount(6000000, 30)).toBe(6000000);
    expect(thrAmount(6000000, 3)).toBe(1500000);
    expect(thrAmount(6000000, 0)).toBe(0);
  });
});
