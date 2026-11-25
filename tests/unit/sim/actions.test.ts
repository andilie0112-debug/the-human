import { describe, expect, it } from 'vitest';
import { GameSession, defaultCharacter } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import { fromDate } from '../../../src/sim/time';
import { objectById, OBJECTS } from '../../../src/data/objectCatalog';
import type { ActionDef } from '../../../src/sim/actions';

function action(objectId: string, actionId: string): ActionDef {
  const a = objectById(objectId)?.actions.find((x) => x.id === actionId);
  if (!a) throw new Error(`no action ${objectId}.${actionId}`);
  return a;
}

describe('smart object actions', () => {
  it('every religion has a worship object with a calming action', () => {
    for (const r of simData.religions) {
      const w = objectById(`worship_${r.id}`);
      expect(w, r.id).toBeDefined();
      expect(w!.actions[0].stressPerHour).toBeLessThan(0);
    }
  });

  it('sleeping restores energy, fast-forwards time and ends when energy is full', () => {
    const s = new GameSession(simData);
    s.character.vitals.needs.energi = 20;
    expect(s.startAction(action('bed_single', 'sleep'), 'bed')).toBe(true);
    expect(s.clock.fastForward).toBe(true);
    expect(s.character.activity).toBe('sleeping');
    const events = [];
    while (s.current) events.push(...s.simulate(1));
    expect(events).toContainEqual({ kind: 'actionDone', actionId: 'sleep', objectInstanceId: 'bed' });
    expect(s.character.vitals.needs.energi).toBeGreaterThan(99.5);
    expect(s.clock.fastForward).toBe(false);
    expect(s.current).toBeNull();
  });

  it('a full night of sleep takes about 6-7 hours from 20 energy', () => {
    const s = new GameSession(simData);
    s.character.vitals.needs.energi = 20;
    const start = s.clock.minutes;
    s.startAction(action('bed_single', 'sleep'), 'bed');
    while (s.current) s.simulate(5);
    const hours = (s.clock.minutes - start) / 60;
    expect(hours).toBeGreaterThan(5.5);
    expect(hours).toBeLessThan(7);
  });

  it('eating costs money and fills hunger', () => {
    const s = new GameSession(simData);
    s.character.vitals.needs.kenyang = 30;
    const before = s.wallet.balance;
    s.startAction(action('stove_counter', 'cook'), 'stove');
    expect(s.wallet.balance).toBe(before - 20000);
    s.simulate(60);
    expect(s.character.vitals.needs.kenyang).toBeGreaterThan(90);
  });

  it('eating is blocked during fasting hours and without enough money', () => {
    const s = new GameSession(simData);
    s.clock.minutes = fromDate(2027, 2, 15, 12);
    expect(s.actionBlock(action('fridge', 'snack'))).toBe('fasting');
    expect(s.startAction(action('fridge', 'snack'), 'fridge')).toBe(false);
    s.clock.minutes = fromDate(2027, 2, 15, 19);
    expect(s.actionBlock(action('fridge', 'snack'))).toBeNull();
    s.wallet.balance = 1000;
    expect(s.actionBlock(action('fridge', 'snack'))).toBe('money');
  });

  it('non-Muslim characters can eat during Ramadan daytime', () => {
    const s = new GameSession(simData, { ...defaultCharacter(), religionId: 'buddha' });
    s.clock.minutes = fromDate(2027, 2, 15, 12);
    expect(s.actionBlock(action('fridge', 'snack'))).toBeNull();
  });

  it('showering makes the character clean', () => {
    const s = new GameSession(simData);
    s.character.vitals.needs.bersih = 10;
    s.startAction(action('shower', 'shower'), 'shower');
    while (s.current) s.simulate(1);
    expect(s.character.vitals.needs.bersih).toBeGreaterThan(99.5);
  });

  it('worship lowers stress and gives a calm mood buff, never a penalty for skipping', () => {
    const s = new GameSession(simData);
    s.character.vitals.stress = 40;
    const moodBefore = s.character.mood;
    s.startAction(action('worship_islam', 'worship'), 'worship');
    s.simulate(20);
    expect(s.character.vitals.stress).toBeLessThan(40);
    expect(s.character.buffs.map((b) => b.id)).toEqual(['tenang']);
    expect(s.character.mood).toBeGreaterThan(moodBefore);
    s.simulate(5 * 60);
    expect(s.character.buffs).toEqual([]);

    const skipper = new GameSession(simData);
    skipper.simulate(5 * 60);
    expect(skipper.character.buffs).toEqual([]);
  });

  it('working out counts as exercise for the body overnight', () => {
    const s = new GameSession(simData);
    const m0 = s.character.body.muscle;
    s.clock.minutes = fromDate(2027, 1, 1, 22);
    s.startAction(action('exercise_mat', 'workout'), 'mat');
    s.simulate(3 * 60);
    expect(s.character.body.muscle).toBeGreaterThan(m0);
  });

  it('video calls with family ease homesickness', () => {
    const s = new GameSession(simData, { ...defaultCharacter(), perantau: true });
    s.character.vitals.kangen = 60;
    s.startAction(action('desk_laptop', 'video_call'), 'desk');
    s.simulate(30);
    expect(s.character.vitals.kangen).toBe(30);
  });

  it('cancelling stops the action without its buff', () => {
    const s = new GameSession(simData);
    s.startAction(action('worship_hindu', 'worship'), 'worship');
    s.simulate(5);
    s.cancelAction();
    expect(s.current).toBeNull();
    s.simulate(20);
    expect(s.character.buffs).toEqual([]);
  });

  it('object data is valid', async () => {
    const { validateObjects } = await import('../../../src/data/objectCatalog');
    expect(validateObjects(OBJECTS)).toEqual([]);
  });
});
