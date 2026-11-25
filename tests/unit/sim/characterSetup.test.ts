import { describe, expect, it } from 'vitest';
import { createCharacter, isPerantau, traditionsOf, validateSetup, type CharacterSetup } from '../../../src/sim/characterSetup';
import { GameSession } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import ethnicities from '../../../src/data/ethnicities.json';

const base: CharacterSetup = {
  name: 'Sari',
  gender: 'female',
  startAge: 22,
  religionId: 'hindu',
  fatherEthnicityId: 'bali',
  motherEthnicityId: 'jawa',
  cityId: 'dps',
  traits: ['rajin', 'ramah'],
  fastingEnabled: true,
  muscle: 0.1,
  fat: 0.3,
  appearance: { skinTone: '#ddb08c', hair: 'Hair_Long', hairColor: '#1a1310', beard: true, hijab: false, shirtColor: '#fff', longSleeve: true, pantsColor: '#333', shorts: false, shoesColor: '#000' },
};

describe('character setup', () => {
  it('perantau when the city is home to neither parent', () => {
    expect(isPerantau('dps', 'bali', 'jawa', ethnicities)).toBe(false);
    expect(isPerantau('jkt', 'bali', 'jawa', ethnicities)).toBe(true);
    expect(isPerantau('smg', 'bali', 'jawa', ethnicities)).toBe(false); // mother's side
    expect(isPerantau('jkt', 'minang', 'minang', ethnicities)).toBe(true);
  });

  it('mixed parentage keeps both traditions', () => {
    expect(traditionsOf(base)).toEqual(['bali', 'jawa']);
    expect(traditionsOf({ fatherEthnicityId: 'sunda', motherEthnicityId: 'sunda' })).toEqual(['sunda']);
  });

  it('start age sets savings, education and experience', () => {
    const c = createCharacter({ ...base, startAge: 30 }, simData.config.startOptions, ethnicities);
    expect(c.savings).toBe(20000000);
    expect(c.character.education).toBe('S1');
    expect(c.character.experienceYears).toBe(5);
    expect(c.character.ownsMotorbike).toBe(true);
    const young = createCharacter({ ...base, startAge: 18 }, simData.config.startOptions, ethnicities);
    expect(young.savings).toBe(2500000);
    expect(young.character.education).toBe('SMA/SMK');
  });

  it('only Muslim characters fast; beards and hijab follow gender', () => {
    const c = createCharacter(base, simData.config.startOptions, ethnicities).character;
    expect(c.fastingEnabled).toBe(false);
    expect(c.appearance.beard).toBe(false);
    const m = createCharacter({ ...base, religionId: 'islam' }, simData.config.startOptions, ethnicities).character;
    expect(m.fastingEnabled).toBe(true);
  });

  it('the session starts with the chosen savings and city rent', () => {
    const made = createCharacter(base, simData.config.startOptions, ethnicities);
    const s = new GameSession(simData, made.character, 1, made.savings);
    expect(s.wallet.balance).toBe(3500000);
    expect(s.city.boardingRoomRentMonthly).toBe(1300000);
  });

  it('requires a name and two different traits', () => {
    expect(validateSetup(base)).toEqual([]);
    expect(validateSetup({ ...base, name: '  ', traits: ['rajin'] })).toEqual(['name', 'traits']);
  });
});
