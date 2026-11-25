import { describe, expect, it } from 'vitest';
import { computeMood, freshVitals, isBurnedOut, rollSickness, updateVitals, type Conditions } from '../../../src/sim/needs';
import sim from '../../../src/data/sim.json';

const cfg = sim.needs;
const awake: Conditions = { sleeping: false, working: false, hotRoom: false, fasting: false, traits: [] };

describe('needs decay', () => {
  it('decays each need at its hourly rate', () => {
    const v = freshVitals();
    updateVitals(v, 2, awake, cfg);
    expect(v.needs.kenyang).toBeCloseTo(80 - 2 * cfg.decayPerHour.kenyang);
    expect(v.needs.energi).toBeCloseTo(85 - 2 * cfg.decayPerHour.energi);
    expect(v.needs.bersih).toBeCloseTo(80 - 2 * cfg.decayPerHour.bersih);
  });

  it('decays slower while sleeping and faster while working or in a hot room', () => {
    const asleep = freshVitals();
    updateVitals(asleep, 1, { ...awake, sleeping: true }, cfg);
    expect(asleep.needs.kenyang).toBeCloseTo(80 - cfg.decayPerHour.kenyang * cfg.sleepingDecayFactor.kenyang);
    expect(asleep.needs.energi).toBe(85);

    const working = freshVitals();
    updateVitals(working, 1, { ...awake, working: true }, cfg);
    expect(working.needs.kenyang).toBeCloseTo(80 - cfg.decayPerHour.kenyang * cfg.workingDecayFactor);

    const hot = freshVitals();
    updateVitals(hot, 1, { ...awake, hotRoom: true }, cfg);
    expect(hot.needs.kenyang).toBeCloseTo(80 - cfg.decayPerHour.kenyang * cfg.hotRoomDecayFactor);
  });

  it('hunger decays slower while fasting', () => {
    const v = freshVitals();
    updateVitals(v, 1, { ...awake, fasting: true }, cfg);
    expect(v.needs.kenyang).toBeCloseTo(80 - cfg.decayPerHour.kenyang * cfg.fastingHungerFactor);
  });

  it('never goes below 0', () => {
    const v = freshVitals();
    updateVitals(v, 100, awake, cfg);
    expect(v.needs.kenyang).toBe(0);
  });
});

describe('stress and health', () => {
  it('low needs raise stress; the Santai trait raises it slower', () => {
    const v = freshVitals();
    v.needs.kenyang = 10;
    v.needs.energi = 10;
    updateVitals(v, 1, awake, cfg);
    const plain = v.stress;
    expect(plain).toBeGreaterThan(10);

    const s = freshVitals();
    s.needs.kenyang = 10;
    s.needs.energi = 10;
    updateVitals(s, 1, { ...awake, traits: ['santai'] }, cfg);
    expect(s.stress - 10).toBeCloseTo((plain - 10) * cfg.traitSantaiStressFactor);
  });

  it('stress recovers when all needs are comfortable', () => {
    const v = freshVitals();
    v.stress = 50;
    updateVitals(v, 1, awake, cfg);
    expect(v.stress).toBeCloseTo(50 - cfg.stressRecoveryPerHour);
  });

  it('burnout at stress 95+', () => {
    const v = freshVitals();
    v.stress = 95;
    expect(isBurnedOut(v, cfg)).toBe(true);
  });

  it('starving and exhaustion hurt health; good needs recover it', () => {
    const v = freshVitals();
    v.needs.kenyang = 0;
    v.needs.energi = 0;
    v.health = 80;
    updateVitals(v, 1, awake, cfg);
    expect(v.health).toBeCloseTo(80 - cfg.healthLossStarvingPerHour - cfg.healthLossExhaustedPerHour);

    const ok = freshVitals();
    ok.health = 80;
    updateVitals(ok, 2, awake, cfg);
    expect(ok.health).toBeCloseTo(80 + 2 * cfg.healthRecoveryPerHour);
  });

  it('may fall sick only when health is below 30', () => {
    const v = freshVitals();
    expect(rollSickness(v, cfg, 0)).toBe(false);
    v.health = 20;
    expect(rollSickness(v, cfg, 0.99)).toBe(false);
    expect(rollSickness(v, cfg, 0.1)).toBe(true);
    expect(v.sick).toBe(true);
  });
});

describe('mood', () => {
  it('is high when everything is fine and drops with penalties', () => {
    const v = freshVitals();
    const base = computeMood(v, sim.mood, { negativeBalance: false });
    expect(base).toBeGreaterThan(70);
    v.sick = true;
    expect(computeMood(v, sim.mood, { negativeBalance: true })).toBeCloseTo(base - sim.mood.sickPenalty - sim.mood.negativeBalancePenalty);
  });
});
