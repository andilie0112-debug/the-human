import { describe, expect, it } from 'vitest';
import { GameSession } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import type { ActionDef } from '../../../src/sim/actions';
import objects from '../../../src/data/objects.json';

const stove = (objects as unknown as { id: string; actions: ActionDef[] }[]).find((o) => o.id === 'stove_counter')!;
const recipe = (id: string): ActionDef => stove.actions.find((a) => a.id === id)!;

describe('recipes', () => {
  it('a simple dish needs its exact ingredients and uses them up', () => {
    const s = new GameSession(simData);
    const nasi = recipe('cook_nasi_goreng');
    expect(s.actionBlock(nasi)).toBeNull(); // starting groceries: rice, eggs, spices
    const eggs = s.inventory.count('telur');
    expect(s.startAction(nasi, 'stove_counter')).toBe(true);
    expect(s.inventory.count('telur')).toBe(eggs - 1);
    expect(s.inventory.count('beras')).toBe(simData.config.start.groceries.beras - 1);
  });

  it('missing ingredients block a dish', () => {
    const s = new GameSession(simData);
    expect(s.actionBlock(recipe('cook_sayur_asem'))).toBe('skill'); // needs cooking skill 1 first
    s.character.skills.masak = 1;
    expect(s.actionBlock(recipe('cook_sayur_asem'))).toBe('noFood'); // no vegetables yet
    s.inventory.add('sayur', 2);
    expect(s.actionBlock(recipe('cook_sayur_asem'))).toBeNull();
  });

  it('harder dishes need more skill and lift the mood more', () => {
    const r = recipe('cook_rendang');
    const m = recipe('cook_nasi_goreng');
    expect(r.minSkill?.masak).toBeGreaterThanOrEqual(5);
    expect(r.buff!.mood).toBeGreaterThan(m.buff!.mood);
    expect(r.durationMinutes).toBeGreaterThan(m.durationMinutes);
    const s = new GameSession(simData);
    s.inventory.add('daging_sapi', 1);
    s.inventory.add('santan', 1);
    s.inventory.add('bumbu', 2);
    expect(s.actionBlock(r)).toBe('skill');
  });
});
