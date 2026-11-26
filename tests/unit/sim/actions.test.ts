import { describe, expect, it } from 'vitest';
import { GameSession, defaultCharacter, type SimEvent } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import { fromDate } from '../../../src/sim/time';
import { objectById, OBJECTS } from '../../../src/data/objectCatalog';
import type { ActionDef } from '../../../src/sim/actions';

/** Finishes the current step and arrives at the next one. */
function runToEndOfStep(s: GameSession): void {
  const idx = s.current!.stepIndex;
  for (let i = 0; i < 2000 && s.current && s.current.stepIndex === idx; i++) s.simulate(1);
  if (s.current?.waiting) s.continueAction();
}

/** Runs the current action to its end, "arriving" at each step's object immediately. */
function runToEnd(s: GameSession): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < 5000 && s.current; i++) {
    if (s.current.waiting) s.continueAction();
    events.push(...s.simulate(1));
  }
  return events;
}

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
    runToEndOfStep(s); // pyjamas on at the wardrobe, now in bed
    expect(s.character.activity).toBe('sleeping');
    const events = runToEnd(s);
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
    runToEnd(s);
    const hours = (s.clock.minutes - start) / 60;
    expect(hours).toBeGreaterThan(5.5);
    expect(hours).toBeLessThan(7);
  });

  it('cooking uses ingredients and runs as steps: fridge, stove, then eating at the desk', () => {
    const s = new GameSession(simData);
    s.character.vitals.needs.kenyang = 30;
    const bahan = s.inventory.countCategory('bahan');
    expect(s.startAction(action('stove_counter', 'cook'), 'stove')).toBe(true);
    expect(s.inventory.countCategory('bahan')).toBe(bahan - 2);
    expect(s.current!.usedItems).toHaveLength(2);

    // Step 1 (fridge, 3 min) ends; the sim waits while the character walks to the counter.
    const e1 = s.simulate(3);
    expect(e1).toContainEqual({ kind: 'actionStep', actionId: 'cook', objectInstanceId: 'stove', stepIndex: 1 });
    expect(s.current!.waiting).toBe(true);
    const kenyang = s.character.vitals.needs.kenyang;
    s.simulate(10); // walking: no action effects, needs keep decaying
    expect(s.current!.stepIndex).toBe(1);
    expect(s.character.vitals.needs.kenyang).toBeLessThan(kenyang);

    s.continueAction(); // arrived at the cutting board
    const events = runToEnd(s);
    expect(events).toContainEqual({ kind: 'actionDone', actionId: 'cook', objectInstanceId: 'stove' });
    expect(s.character.vitals.needs.kenyang).toBeGreaterThan(95);
  });

  it('eating is blocked during fasting hours and when the fridge is empty', () => {
    const s = new GameSession(simData);
    s.clock.minutes = fromDate(2027, 2, 15, 12);
    expect(s.actionBlock(action('fridge', 'snack'))).toBe('fasting');
    expect(s.startAction(action('fridge', 'snack'), 'fridge')).toBe(false);
    s.clock.minutes = fromDate(2027, 2, 15, 19);
    expect(s.actionBlock(action('fridge', 'snack'))).toBeNull();
    while (s.inventory.countCategory('camilan') > 0) s.inventory.take('camilan', 1);
    expect(s.actionBlock(action('fridge', 'snack'))).toBe('noFood');
  });

  it('shopping costs the basket price and fills the fridge when back home', () => {
    const s = new GameSession(simData);
    const before = s.wallet.balance;
    const list = { tempe: 2, susu: 1 };
    expect(s.startAction(action('front_door', 'go_shopping'), 'door', list)).toBe(true);
    expect(s.wallet.balance).toBe(before - 2 * 6000 - 7000);
    expect(s.inventory.count('tempe')).toBe(0);
    const events = runToEnd(s);
    expect(events).toContainEqual({ kind: 'shoppingDone', items: list });
    expect(s.inventory.count('tempe')).toBe(2);
    expect(s.inventory.count('susu')).toBe(1);
  });

  it('shopping is refused when the basket costs more than the balance', () => {
    const s = new GameSession(simData);
    s.wallet.balance = 5000;
    expect(s.startAction(action('front_door', 'go_shopping'), 'door', { ayam: 1 })).toBe(false);
    expect(s.current).toBeNull();
  });

  it('reports progress and time left for the progress bar', () => {
    const s = new GameSession(simData);
    s.startAction(action('desk_laptop', 'browse'), 'desk');
    expect(s.progress()).toEqual({ actionId: 'browse', labelKey: 'act.browse', fraction: 0, minutesLeft: 60 });
    s.simulate(15);
    const p = s.progress()!;
    expect(p.fraction).toBeCloseTo(0.25);
    expect(p.minutesLeft).toBeCloseTo(45);
  });

  it('estimates time left for actions that end when a need is full', () => {
    const s = new GameSession(simData);
    s.character.vitals.needs.energi = 35;
    s.startAction(action('bed_single', 'nap'), 'bed');
    expect(s.progress()!.minutesLeft).toBeCloseTo(60, 0);
    s.startAction(action('bed_single', 'sleep'), 'bed');
    // 3 minutes changing into pyjamas, then sleep until energy is full.
    expect(s.progress()!.minutesLeft).toBeCloseTo(3 + 600, 0);
    runToEndOfStep(s);
    expect(s.progress()!.minutesLeft).toBeLessThan(6 * 60);
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
    runToEnd(s);
    expect(s.character.vitals.needs.bersih).toBeGreaterThan(97);
    expect(s.character.outfit).toBe('daily');
  });

  it('worship lowers stress and gives a calm mood buff, never a penalty for skipping', () => {
    const s = new GameSession(simData);
    s.character.vitals.stress = 40;
    const moodBefore = s.character.mood;
    s.startAction(action('worship_islam', 'worship'), 'worship');
    s.simulate(30);
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

  it('the shower routine undresses, dries with a towel and dresses again', () => {
    const s = new GameSession(simData);
    s.character.vitals.needs.bersih = 20;
    s.startAction(action('shower', 'shower'), 'shower');
    const outfits: string[] = [];
    for (let i = 0; i < 5000 && s.current; i++) {
      if (s.current.waiting) s.continueAction();
      if (outfits[outfits.length - 1] !== s.character.outfit) outfits.push(s.character.outfit);
      s.simulate(1);
    }
    expect(outfits).toEqual(['daily', 'none', 'towel', 'daily']);
  });

  it('never leaves the character undressed when a shower is cancelled', () => {
    const s = new GameSession(simData);
    s.startAction(action('shower', 'shower'), 'shower');
    runToEndOfStep(s); // towel taken
    runToEndOfStep(s); // undressed
    expect(s.character.outfit).toBe('none');
    s.cancelAction();
    expect(s.character.outfit).toBe('towel');
  });

  it('going to bed changes into pyjamas first', () => {
    const s = new GameSession(simData);
    s.startAction(action('bed_single', 'sleep'), 'bed');
    runToEndOfStep(s);
    expect(s.character.outfit).toBe('sleep');
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
