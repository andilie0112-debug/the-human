import { describe, expect, it } from 'vitest';
import { gameData, validateGameData } from '../../src/data';
import { validateIdList, validateKeys } from '../../src/data/validate';

describe('game data', () => {
  it('passes validation', () => {
    expect(validateGameData()).toEqual([]);
  });

  it('has all six religions and ten cities', () => {
    expect(gameData.religions.map((r) => r.id)).toHaveLength(6);
    expect(gameData.cities).toHaveLength(10);
  });
});

describe('validators', () => {
  it('flags missing and duplicate ids', () => {
    expect(validateIdList('x', [{ id: 'a' }, { id: 'a' }, {}])).toEqual(['x: duplicate id "a"', 'x[2]: missing string "id"']);
    expect(validateIdList('x', [])).toEqual(['x: expected a non-empty array']);
  });

  it('flags missing keys', () => {
    expect(validateKeys('y', [{ a: 1 }], ['a', 'b'])).toEqual(['y[0]: missing "b"']);
  });
});
