import { describe, expect, it } from 'vitest';
import { Inventory } from '../../../src/sim/inventory';
import items from '../../../src/data/items.json';

describe('Inventory', () => {
  it('counts per item and per category', () => {
    const inv = new Inventory(items, { telur: 4, mi_instan: 2, susu: 1 });
    expect(inv.count('telur')).toBe(4);
    expect(inv.countCategory('bahan')).toBe(6);
    expect(inv.countCategory('minuman')).toBe(1);
  });

  it('takes from the item you have most of', () => {
    const inv = new Inventory(items, { telur: 4, mi_instan: 1 });
    expect(inv.take('bahan', 2)).toEqual(['telur', 'telur']);
    expect(inv.count('telur')).toBe(2);
  });

  it('refuses to take more than available', () => {
    const inv = new Inventory(items, { pisang: 1 });
    expect(inv.take('camilan', 2)).toBeNull();
    expect(inv.count('pisang')).toBe(1);
  });

  it('prices a shopping list', () => {
    const inv = new Inventory(items);
    expect(inv.priceOf({ telur: 10, susu: 2 })).toBe(10 * 2500 + 2 * 7000);
  });

  it('rejects unknown items', () => {
    expect(() => new Inventory(items, { durian: 1 })).toThrow();
  });
});
