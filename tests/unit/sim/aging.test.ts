import { describe, expect, it } from 'vitest';
import { GameSession, defaultCharacter } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import { energyFactor, jhtPayout, lifeStage } from '../../../src/sim/aging';

const cfg = simData.config.aging;

describe('aging', () => {
  it('life stages and tiredness by age', () => {
    expect(lifeStage(22)).toBe('muda');
    expect(lifeStage(35)).toBe('dewasa');
    expect(lifeStage(55)).toBe('paruhBaya');
    expect(lifeStage(62)).toBe('lansia');
    expect(energyFactor(25, cfg)).toBe(1);
    expect(energyFactor(60, cfg)).toBeGreaterThan(1.2);
  });

  it('a birthday comes after a game year of days (by the chosen speed) with a party mood', () => {
    const s = new GameSession(simData, { ...defaultCharacter(), age: 22, ageSpeed: 'cepat' });
    let ev = s.simulate(27 * 24 * 60);
    expect(s.character.age).toBe(22);
    ev = s.simulate(24 * 60 + 1);
    expect(s.character.age).toBe(23);
    expect(ev.some((e) => e.kind === 'birthday' && e.age === 23)).toBe(true);
    expect(s.character.buffs.map((b) => b.id)).toContain('ultah');
  });

  it('retiring at the retirement age pays out the JHT and ends the job; hair greys with age', () => {
    expect(jhtPayout(5000000, 10, cfg)).toBe(5000000 * 7);
    expect(jhtPayout(5000000, 100, cfg)).toBe(5000000 * cfg.jhtMaxMonths);
    const c = { ...defaultCharacter(), age: cfg.retireAge - 1, ageSpeed: 'cepat' as const, ageDays: 27 };
    const s = new GameSession(simData, c);
    s.career.job = { jobId: 'adm', company: 'PT A', monthlyGross: 5000000, startMinute: s.clock.minutes - 10 * 365 * 24 * 60, level: 0, levelSinceMinute: 0, performance: 50, warnings: 0, absencesSinceWarning: 0, absentDaysThisMonth: 0, leaveDaysLeft: 12, excusedDays: [], lastJudgedDay: -1 };
    const ev = s.simulate(24 * 60);
    expect(s.character.age).toBe(cfg.retireAge);
    expect(s.career.job).toBeNull();
    expect(ev.some((e) => e.kind === 'retired')).toBe(true);
    expect(s.character.appearance.greyHair).toBeGreaterThan(0);
  });
});
