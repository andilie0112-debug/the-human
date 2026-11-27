import { describe, expect, it } from 'vitest';
import { expressionFor } from '../../src/characters/expression';

const base = { mood: 60, stress: 20, energy: 70, sick: false };

describe('expressionFor', () => {
  it('is calm in an ordinary state', () => expect(expressionFor(base)).toBe('neutral'));
  it('smiles when the mood is high', () => expect(expressionFor({ ...base, mood: 85 })).toBe('happy'));
  it('looks sad when the mood is low or the character is sick', () => {
    expect(expressionFor({ ...base, mood: 20 })).toBe('sad');
    expect(expressionFor({ ...base, sick: true })).toBe('sad');
  });
  it('frowns when stressed, even if the mood is fine', () => expect(expressionFor({ ...base, mood: 80, stress: 85 })).toBe('angry'));
  it('looks sleepy when out of energy before anything else', () => expect(expressionFor({ ...base, energy: 10, stress: 90 })).toBe('sleepy'));
});
