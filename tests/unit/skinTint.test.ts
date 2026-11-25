import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { HUMAN_SKIN_TONES, skinTint } from '../../src/characters/humanModel';

describe('skinTint', () => {
  it('maps the texture average onto each target tone', () => {
    for (const tone of HUMAN_SKIN_TONES) {
      const tint = skinTint('female', tone);
      const avg = new Color('#a97956');
      const result = new Color(avg.r * tint.r, avg.g * tint.g, avg.b * tint.b);
      expect(result.getHexString()).toBe(new Color(tone).getHexString());
    }
  });

  it('brightens for light tones and darkens for deep tones', () => {
    expect(skinTint('male', HUMAN_SKIN_TONES[0]).g).toBeGreaterThan(1);
    expect(skinTint('male', HUMAN_SKIN_TONES[4]).g).toBeLessThan(1);
  });
});
