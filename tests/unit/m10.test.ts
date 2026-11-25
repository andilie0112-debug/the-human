import { describe, expect, it } from 'vitest';
import { defaultQuality, pixelRatioFor } from '../../src/engine/graphics';
import { cityLabels } from '../../src/world/cityLook';
import cities from '../../src/data/cities.json';

describe('graphics setting', () => {
  it('phones default to Medium, PCs to High', () => {
    expect(defaultQuality(true)).toBe('medium');
    expect(defaultQuality(false)).toBe('high');
  });

  it('pixel ratio: phones never above 1.5, Low is lowest', () => {
    for (const q of ['low', 'medium', 'high'] as const) expect(pixelRatioFor(q, true, 3)).toBeLessThanOrEqual(1.5);
    expect(pixelRatioFor('low', true, 3)).toBeLessThan(pixelRatioFor('medium', true, 3));
    expect(pixelRatioFor('high', false, 2)).toBe(2);
    expect(pixelRatioFor('high', false, 1)).toBe(1);
  });
});

describe('city variants', () => {
  it('signs follow the city: its transport and its food', () => {
    const jkt = cityLabels(cities.find((c) => c.id === 'jkt')!);
    expect(jkt.halte).toBe('Halte TransJakarta');
    expect(jkt.warung).toBe('Warung Soto Betawi');
    expect(jkt.polsek).toBe('Polsek Tebet');
    expect(jkt.minimarket).toBe('Indoapril');
    for (const c of cities) {
      const l = cityLabels(c);
      expect(l.halte).not.toContain('Ojol');
      expect(l.kos).toContain(c.name);
      expect(l.rs).toContain(c.name);
      expect(l.gerobak1).toBe(c.cart[0]);
    }
  });
});
