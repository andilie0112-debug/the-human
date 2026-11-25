// Payslip and THR rules (2026-style Indonesian payroll, simplified; see sim.json notes).

export interface TaxBracket {
  upTo: number | null;
  rate: number;
}

export interface PayrollConfig {
  salaryDay: number;
  paymentHour: number;
  bpjsKesehatanRate: number;
  bpjsKesehatanWageCap: number;
  jhtRate: number;
  jpRate: number;
  jpWageCap: number;
  biayaJabatanRate: number;
  biayaJabatanAnnualCap: number;
  ptkpAnnual: number;
  taxBrackets: TaxBracket[];
}

export interface Payslip {
  gross: number;
  bpjsKesehatan: number;
  jht: number;
  jp: number;
  /** Sum of the three employee BPJS contributions. */
  bpjs: number;
  tax: number;
  absenceDeduction: number;
  net: number;
}

/** Employee BPJS contributions on the monthly gross. */
export function bpjsContributions(gross: number, cfg: PayrollConfig): { kesehatan: number; jht: number; jp: number } {
  return {
    kesehatan: Math.round(Math.min(gross, cfg.bpjsKesehatanWageCap) * cfg.bpjsKesehatanRate),
    jht: Math.round(gross * cfg.jhtRate),
    jp: Math.round(Math.min(gross, cfg.jpWageCap) * cfg.jpRate),
  };
}

/** Progressive tax on annual taxable income. */
export function progressiveTax(pkp: number, brackets: TaxBracket[]): number {
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upTo ?? Infinity;
    if (pkp <= lower) break;
    tax += (Math.min(pkp, upper) - lower) * b.rate;
    lower = upper;
  }
  return tax;
}

/**
 * Estimated monthly PPh 21: annualize, subtract biaya jabatan, JHT and JP, and PTKP (single, no
 * dependants), round PKP down to the thousand, apply the progressive brackets, divide by 12.
 */
export function monthlyIncomeTax(gross: number, cfg: PayrollConfig): number {
  const annual = gross * 12;
  const b = bpjsContributions(gross, cfg);
  const biayaJabatan = Math.min(annual * cfg.biayaJabatanRate, cfg.biayaJabatanAnnualCap);
  const netto = annual - biayaJabatan - (b.jht + b.jp) * 12;
  const pkp = Math.floor(Math.max(0, netto - cfg.ptkpAnnual) / 1000) * 1000;
  return Math.round(progressiveTax(pkp, cfg.taxBrackets) / 12);
}

/** Absence deduction: a day's pay (gross / scheduled work days) per unexcused absence. */
export function absenceDeduction(gross: number, workDaysInMonth: number, absentDays: number): number {
  if (workDaysInMonth <= 0 || absentDays <= 0) return 0;
  return Math.round((gross / workDaysInMonth) * Math.min(absentDays, workDaysInMonth));
}

export function computePayslip(gross: number, cfg: PayrollConfig, absence = { workDays: 0, absentDays: 0 }): Payslip {
  const b = bpjsContributions(gross, cfg);
  const bpjs = b.kesehatan + b.jht + b.jp;
  const tax = monthlyIncomeTax(gross, cfg);
  const absenceCut = absenceDeduction(gross, absence.workDays, absence.absentDays);
  return {
    gross,
    bpjsKesehatan: b.kesehatan,
    jht: b.jht,
    jp: b.jp,
    bpjs,
    tax,
    absenceDeduction: absenceCut,
    net: gross - bpjs - tax - absenceCut,
  };
}

/** THR: one month's gross after 12 months of service, prorated (months/12) from 1 month, else 0. */
export function thrAmount(gross: number, monthsOfService: number): number {
  if (monthsOfService < 1) return 0;
  return Math.round((gross * Math.min(12, monthsOfService)) / 12);
}
