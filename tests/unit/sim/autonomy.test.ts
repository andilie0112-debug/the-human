import { describe, expect, it } from 'vitest';
import { chooseAction, urgency, type Candidate } from '../../../src/sim/autonomy';
import { GameSession } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import { fromDate } from '../../../src/sim/time';
import { OBJECTS } from '../../../src/data/objectCatalog';

const cfg = simData.config.autonomy;

/** Every action of every object, one instance each, 2 m away. */
function allCandidates(): Candidate[] {
  return OBJECTS.filter((o) => !o.religion || o.religion === 'islam').flatMap((o) => o.actions.map((action) => ({ instanceId: o.id, action, distance: 2 })));
}

function fresh(): GameSession {
  const s = new GameSession(simData);
  for (const k of ['kenyang', 'energi', 'bersih', 'sosial', 'hiburan'] as const) s.character.vitals.needs[k] = 90;
  s.character.vitals.stress = 5;
  return s;
}

describe('autonomy', () => {
  it('urgency grows sharply as a need empties', () => {
    expect(urgency(100)).toBeLessThan(0.1);
    expect(urgency(10)).toBeGreaterThan(urgency(50) * 3);
  });

  it('a hungry character goes for food', () => {
    const s = fresh();
    s.character.vitals.needs.kenyang = 15;
    const c = chooseAction(s, allCandidates(), 'full', cfg, 0);
    expect(c?.reason).toBe('kenyang');
  });

  it('an exhausted character goes to bed', () => {
    const s = fresh();
    s.character.vitals.needs.energi = 8;
    expect(chooseAction(s, allCandidates(), 'full', cfg, 0)?.action.id).toMatch(/sleep|nap/);
  });

  it('a dirty character showers', () => {
    const s = fresh();
    s.character.vitals.needs.bersih = 10;
    expect(chooseAction(s, allCandidates(), 'full', cfg, 0)?.action.id).toBe('shower');
  });

  it('a bored character looks for fun', () => {
    const s = fresh();
    s.character.vitals.needs.hiburan = 15;
    expect(chooseAction(s, allCandidates(), 'full', cfg, 0)?.reason).toBe('hiburan');
  });

  it('does nothing when autonomy is off, and only acts on urgent needs when low', () => {
    const s = fresh();
    s.character.vitals.needs.hiburan = 50;
    expect(chooseAction(s, allCandidates(), 'off', cfg, 0)).toBeNull();
    expect(chooseAction(s, allCandidates(), 'low', cfg, 0)).toBeNull();
    s.character.vitals.needs.kenyang = 10;
    expect(chooseAction(s, allCandidates(), 'low', cfg, 0)?.reason).toBe('kenyang');
  });

  it('does not try to eat during fasting hours', () => {
    const s = fresh();
    s.clock.minutes = fromDate(2027, 2, 15, 12);
    s.character.vitals.needs.kenyang = 10;
    const c = chooseAction(s, allCandidates(), 'full', cfg, 0);
    expect(c?.action.isEating ?? false).toBe(false);
  });

  it('goes shopping when hungry and the fridge is empty', () => {
    const s = fresh();
    s.character.vitals.needs.kenyang = 10;
    for (const cat of ['bahan', 'siapMakan', 'camilan', 'minuman']) while (s.inventory.take(cat, 1));
    expect(chooseAction(s, allCandidates(), 'full', cfg, 0)?.reason).toBe('belanja');
  });

  it('prefers the closer of two equal options', () => {
    const s = fresh();
    s.character.vitals.needs.hiburan = 20;
    const tv = OBJECTS.find((o) => o.id === 'tv_set')!.actions[0];
    const near: Candidate = { instanceId: 'near', action: tv, distance: 1 };
    const far: Candidate = { instanceId: 'far', action: tv, distance: 9 };
    expect(chooseAction(s, [far, near], 'full', cfg, 0)?.instanceId).toBe('near');
  });
});
