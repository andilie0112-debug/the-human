// Food and groceries the character owns (kept in the fridge). Item data: src/data/items.json.

export interface ItemDef {
  id: string;
  nameKey: string;
  /** bahan = cooking ingredients, siapMakan = ready meals, camilan = snacks, minuman = drinks. */
  category: string;
  price: number;
  color: string;
  shape: string;
}

export class Inventory {
  private readonly counts = new Map<string, number>();

  constructor(private readonly items: readonly ItemDef[], initial: Record<string, number> = {}) {
    for (const [id, n] of Object.entries(initial)) this.add(id, n);
  }

  add(id: string, qty: number): void {
    if (!this.items.some((i) => i.id === id)) throw new Error(`unknown item ${id}`);
    this.counts.set(id, (this.counts.get(id) ?? 0) + qty);
  }

  count(id: string): number {
    return this.counts.get(id) ?? 0;
  }

  countCategory(category: string): number {
    let n = 0;
    for (const [id, qty] of this.counts) if (this.items.find((i) => i.id === id)?.category === category) n += qty;
    return n;
  }

  /** Removes `qty` items of a category, the ones you have most of first. Returns the item ids taken, or null if not enough. */
  take(category: string, qty: number): string[] | null {
    if (this.countCategory(category) < qty) return null;
    const taken: string[] = [];
    for (let i = 0; i < qty; i++) {
      let best: string | null = null;
      for (const [id, n] of this.counts) {
        if (n <= 0 || this.items.find((x) => x.id === id)?.category !== category) continue;
        if (best === null || n > (this.counts.get(best) ?? 0)) best = id;
      }
      if (best === null) return null;
      this.counts.set(best, (this.counts.get(best) ?? 0) - 1);
      taken.push(best);
    }
    return taken;
  }

  /** All owned items as [id, qty] with qty > 0, in data order (stable for rendering the fridge). */
  list(): [string, number][] {
    return this.items.map((i) => [i.id, this.count(i.id)] as [string, number]).filter(([, n]) => n > 0);
  }

  /** Total price of a shopping list. */
  priceOf(list: Record<string, number>): number {
    return Object.entries(list).reduce((sum, [id, n]) => sum + (this.items.find((i) => i.id === id)?.price ?? 0) * n, 0);
  }
}
