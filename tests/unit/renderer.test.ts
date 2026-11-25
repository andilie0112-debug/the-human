import { describe, expect, it } from 'vitest';
import { maxPixelRatio } from '../../src/engine/renderer';

describe('maxPixelRatio', () => {
  it('caps phones at 1.5 and PCs at 2', () => {
    expect(maxPixelRatio(true, 3)).toBe(1.5);
    expect(maxPixelRatio(false, 3)).toBe(2);
    expect(maxPixelRatio(true, 1)).toBe(1);
  });
});
