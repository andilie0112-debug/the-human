import { describe, expect, it } from 'vitest';
import { GameSession, defaultCharacter } from '../../src/sim/session';
import { simData } from '../../src/sim/gameData';
import { decodeSave, encodeSave } from '../../src/save/saveCodec';
import { MemoryStorage } from '../../src/save/saveStorage';

function played(): GameSession {
  const c = defaultCharacter();
  c.name = 'Bimo Ñandi';
  const s = new GameSession(simData, c, 42);
  s.simulate(3 * 24 * 60 + 123);
  s.inventory.add('susu', 2);
  const l = s.career.listings[0];
  s.career.apply(l.id);
  return s;
}

describe('save and load', () => {
  it('round-trips the whole game and continues identically', () => {
    const a = played();
    const save = JSON.parse(JSON.stringify(a.toSave()));
    const b = GameSession.fromSave(simData, save);
    expect(b.clock.minutes).toBe(a.clock.minutes);
    expect(b.wallet.balance).toBe(a.wallet.balance);
    expect(b.inventory.list()).toEqual(a.inventory.list());
    expect(b.character).toEqual({ ...a.character, activity: 'idle' });
    expect(b.career.applications).toEqual(a.career.applications);
    // Same random state: the next week plays out the same.
    const ea = a.simulate(7 * 24 * 60);
    const eb = b.simulate(7 * 24 * 60);
    expect(eb).toEqual(ea);
    expect(b.wallet.balance).toBe(a.wallet.balance);
  });

  it('export code round-trips, including non-ASCII names', () => {
    const save = played().toSave();
    const code = encodeSave(save);
    expect(code.startsWith('TH1:')).toBe(true);
    expect(decodeSave(code).character.name).toBe('Bimo Ñandi');
  });

  it('rejects text that is not a save code', () => {
    expect(() => decodeSave('hello')).toThrow('not-a-save-code');
    expect(() => decodeSave('TH1:%%%')).toThrow('corrupt-save-code');
  });

  it('never saves the character undressed', () => {
    const s = played();
    s.character.outfit = 'none';
    expect(s.toSave().character.outfit).toBe('towel');
  });

  it('storage keeps slots', async () => {
    const st = new MemoryStorage();
    await st.save('slot1', played().toSave());
    expect((await st.list()).map((x) => x.slot)).toEqual(['slot1']);
    expect((await st.load('slot1'))?.character.name).toBe('Bimo Ñandi');
    await st.remove('slot1');
    expect(await st.load('slot1')).toBeNull();
  });
});
