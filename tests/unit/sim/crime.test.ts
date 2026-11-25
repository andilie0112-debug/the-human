import { describe, expect, it } from 'vitest';
import { commitOffence, fadeWanted, fineFor, jailDaysFor, newCrimeState, settleArrest, skckBlocked, type CrimeConfig } from '../../../src/sim/crime';
import { simData } from '../../../src/sim/gameData';

const cfg = simData.config.crime as CrimeConfig;

describe('crime and the law', () => {
  it('a noticed offence makes you wanted and goes on the record; an unnoticed one does not', () => {
    const s = newCrimeState();
    expect(commitOffence(s, 'mencuri', 0, 0.99, cfg)).toBe(false);
    expect(s.wanted).toBe(0);
    expect(commitOffence(s, 'copet', 10, 0.01, cfg)).toBe(true);
    expect(s.wanted).toBe(2);
    expect(s.record.map((e) => e.outcome)).toEqual(['lolos', 'buron']);
  });

  it('wanted stars fade over time when nobody catches you', () => {
    const s = newCrimeState();
    commitOffence(s, 'mencuri', 0, 0, cfg);
    fadeWanted(s, cfg.starFadeHours * 60 + 1, cfg);
    expect(s.wanted).toBe(0);
    expect(s.record[0].outcome).toBe('lolos');
  });

  it('fines and jail grow with the stars; an arrest closes the case', () => {
    const s = newCrimeState();
    commitOffence(s, 'copet', 0, 0, cfg);
    commitOffence(s, 'mencuri', 5, 0, cfg);
    expect(s.wanted).toBe(3);
    expect(fineFor(s, cfg)).toBe(3 * cfg.finePerStar);
    expect(jailDaysFor(s, cfg)).toBe(3 * cfg.jailDaysPerStar);
    settleArrest(s, 'penjara', 100, 3 * 24 * 60);
    expect(s.wanted).toBe(0);
    expect(s.jailUntil).toBe(100 + 3 * 24 * 60);
    expect(s.record.every((e) => e.outcome === 'penjara')).toBe(true);
  });

  it('a recent conviction blocks the SKCK; after a year it is fine again', () => {
    const s = newCrimeState();
    expect(skckBlocked(s, 0, cfg)).toBe(false);
    commitOffence(s, 'kabur', 0, 0, cfg);
    settleArrest(s, 'denda', 0, 0);
    expect(skckBlocked(s, 1000, cfg)).toBe(true);
    expect(skckBlocked(s, 366 * 24 * 60, cfg)).toBe(false);
  });
});
