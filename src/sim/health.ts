// A hospital visit: the doctor's diagnosis from how the character really is, the treatments
// offered with their price, and what BPJS (national health insurance) or a private insurer
// pays. Prices and coverage are simplified game values.

export type Payer = 'bpjs' | 'umum' | 'asuransi';

export interface Treatment {
  id: string;
  labelKey: string;
  cost: number;
  /** Paid by BPJS (with a referral where needed). */
  bpjs: boolean;
  /** Paid by a private insurance policy. */
  insurance: boolean;
  cure?: boolean;
  health?: number;
  stress?: number;
  /** Doctor's letter: excused work days (no absence, no leave used). */
  sickLeaveDays?: number;
  /** Days in hospital (inpatient). */
  inpatientDays?: number;
}

export interface Diagnosis {
  id: 'tipes' | 'flu' | 'stres' | 'kelelahan' | 'sehat';
  /** What the doctor says (strings key). */
  textKey: string;
  treatments: Treatment[];
}

export interface HealthState {
  sick: boolean;
  health: number;
  stress: number;
  energi: number;
}

export function diagnose(h: HealthState): Diagnosis {
  if (h.sick && h.health < 40)
    return {
      id: 'tipes',
      textKey: 'doc.tipes',
      treatments: [
        { id: 'rawat_inap', labelKey: 'treat.inpatient', cost: 3500000, bpjs: true, insurance: true, cure: true, health: 40, inpatientDays: 3, sickLeaveDays: 5 },
        { id: 'obat_jalan', labelKey: 'treat.outpatient', cost: 250000, bpjs: true, insurance: true, health: 15, sickLeaveDays: 3 },
      ],
    };
  if (h.sick)
    return {
      id: 'flu',
      textKey: 'doc.flu',
      treatments: [
        { id: 'resep', labelKey: 'treat.prescription', cost: 75000, bpjs: true, insurance: true, cure: true, health: 15, sickLeaveDays: 2 },
        { id: 'istirahat', labelKey: 'treat.rest', cost: 0, bpjs: true, insurance: true, health: 5, sickLeaveDays: 2 },
      ],
    };
  if (h.stress >= 70)
    return {
      id: 'stres',
      textKey: 'doc.stres',
      treatments: [
        { id: 'psikolog', labelKey: 'treat.counselling', cost: 300000, bpjs: true, insurance: true, stress: -45 },
        { id: 'cuti', labelKey: 'treat.restLetter', cost: 0, bpjs: true, insurance: true, stress: -15, sickLeaveDays: 1 },
      ],
    };
  if (h.energi < 25 || h.health < 60)
    return {
      id: 'kelelahan',
      textKey: 'doc.kelelahan',
      treatments: [
        { id: 'cek_darah', labelKey: 'treat.bloodTest', cost: 150000, bpjs: true, insurance: true, health: 10 },
        { id: 'vitamin', labelKey: 'treat.vitamins', cost: 60000, bpjs: false, insurance: false, health: 8 },
      ],
    };
  return {
    id: 'sehat',
    textKey: 'doc.sehat',
    treatments: [{ id: 'mcu', labelKey: 'treat.checkup', cost: 350000, bpjs: false, insurance: true, health: 5, stress: -5 }],
  };
}

/** Admin fee at registration (BPJS and insurance patients pay none). */
export function registrationFee(payer: Payer): number {
  return payer === 'umum' ? 50000 : 0;
}

/** Minutes in the waiting room before your number is called (BPJS queues are longer). */
export function waitMinutes(payer: Payer): number {
  return payer === 'bpjs' ? 90 : payer === 'umum' ? 35 : 20;
}

/** What the patient pays for a treatment. */
export function patientPays(t: Treatment, payer: Payer): number {
  if (payer === 'bpjs' && t.bpjs) return 0;
  if (payer === 'asuransi' && t.insurance) return 0;
  return t.cost;
}
