import { describe, expect, it } from 'vitest';
import { diagnose, patientPays, registrationFee, waitMinutes } from '../../../src/sim/health';

const fine = { sick: false, health: 90, stress: 10, energi: 80 };

describe('hospital visit', () => {
  it('the diagnosis follows how the character really is', () => {
    expect(diagnose({ ...fine, sick: true, health: 30 }).id).toBe('tipes');
    expect(diagnose({ ...fine, sick: true }).id).toBe('flu');
    expect(diagnose({ ...fine, stress: 80 }).id).toBe('stres');
    expect(diagnose({ ...fine, energi: 10 }).id).toBe('kelelahan');
    expect(diagnose(fine).id).toBe('sehat');
  });

  it('BPJS pays covered treatments; vitamins and check-ups are not covered', () => {
    const flu = diagnose({ ...fine, sick: true }).treatments[0];
    expect(patientPays(flu, 'bpjs')).toBe(0);
    expect(patientPays(flu, 'umum')).toBe(flu.cost);
    const vit = diagnose({ ...fine, energi: 10 }).treatments.find((t) => t.id === 'vitamin')!;
    expect(patientPays(vit, 'bpjs')).toBe(vit.cost);
    const mcu = diagnose(fine).treatments[0];
    expect(patientPays(mcu, 'bpjs')).toBe(mcu.cost);
    expect(patientPays(mcu, 'asuransi')).toBe(0);
  });

  it('BPJS: no admin fee but a longer queue', () => {
    expect(registrationFee('bpjs')).toBe(0);
    expect(registrationFee('umum')).toBeGreaterThan(0);
    expect(waitMinutes('bpjs')).toBeGreaterThan(waitMinutes('umum'));
  });
});

describe('health care in the session', () => {
  it('no job: only "umum" until you join BPJS Mandiri; premiums are billed monthly', async () => {
    const { GameSession } = await import('../../../src/sim/session');
    const { simData } = await import('../../../src/sim/gameData');
    const s = new GameSession(simData, undefined, 1, 10000000);
    expect(s.payerOptions()).toEqual(['umum']);
    s.registerBpjsMandiri();
    s.buyInsurance();
    expect(s.payerOptions()).toEqual(['bpjs', 'asuransi', 'umum']);
    const before = s.wallet.balance;
    // Run to the 1st of February: rent plus both premiums.
    s.simulate(32 * 24 * 60);
    const bills = s.wallet.history.filter((h) => h.labelKey === 'tx.bpjsMandiri' || h.labelKey === 'tx.insurance');
    expect(bills.length).toBeGreaterThanOrEqual(2);
    expect(s.wallet.balance).toBeLessThan(before);
  });

  it('a flu treated with BPJS is free, cures, and the doctor letter excuses work days', async () => {
    const { GameSession, defaultCharacter } = await import('../../../src/sim/session');
    const { simData } = await import('../../../src/sim/gameData');
    const c = defaultCharacter();
    c.employment = { jobId: 'adm', monthlyGross: 5000000, startMinute: 0, workDaysThisMonth: 21, absentDaysThisMonth: 0 };
    const s = new GameSession(simData, c);
    s.character.vitals.sick = true;
    s.character.vitals.health = 55;
    const d = s.diagnosis();
    expect(d.id).toBe('flu');
    const before = s.wallet.balance;
    const r = s.treat(d.treatments[0], 'bpjs')!;
    expect(r.paid).toBe(0);
    expect(s.wallet.balance).toBe(before);
    expect(s.character.vitals.sick).toBe(false);
    expect(s.career.job!.excusedDays.length).toBeGreaterThanOrEqual(2);
  });

  it('typhoid needs a hospital stay', async () => {
    const { GameSession } = await import('../../../src/sim/session');
    const { simData } = await import('../../../src/sim/gameData');
    const s = new GameSession(simData, undefined, 1, 10000000);
    s.character.vitals.sick = true;
    s.character.vitals.health = 20;
    const d = s.diagnosis();
    expect(d.id).toBe('tipes');
    const r = s.treat(d.treatments[0], 'umum')!;
    expect(r.paid).toBe(3500000);
    expect(r.stay?.durationMinutes).toBe(3 * 24 * 60);
  });
});
