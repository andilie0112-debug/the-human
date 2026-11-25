import type { SaveData } from '../sim/session';

// Versioned saves in IndexedDB behind a small interface (cloud saves can implement it later).

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const SLOTS: SlotId[] = ['auto', 'slot1', 'slot2', 'slot3'];

export interface SlotInfo {
  slot: SlotId;
  name: string;
  gameMinutes: number;
  savedAt: number;
}

export interface SaveStorage {
  list(): Promise<SlotInfo[]>;
  load(slot: SlotId): Promise<SaveData | null>;
  save(slot: SlotId, data: SaveData): Promise<void>;
  remove(slot: SlotId): Promise<void>;
}

export function slotInfo(slot: SlotId, d: SaveData): SlotInfo {
  return { slot, name: d.character.name, gameMinutes: d.clock.minutes, savedAt: d.savedAt };
}

/** In-memory storage (tests, or browsers where IndexedDB is unavailable). */
export class MemoryStorage implements SaveStorage {
  private readonly map = new Map<SlotId, SaveData>();
  async list(): Promise<SlotInfo[]> {
    return [...this.map.entries()].map(([s, d]) => slotInfo(s, d));
  }
  async load(slot: SlotId): Promise<SaveData | null> {
    return this.map.get(slot) ?? null;
  }
  async save(slot: SlotId, data: SaveData): Promise<void> {
    this.map.set(slot, structuredClone(data));
  }
  async remove(slot: SlotId): Promise<void> {
    this.map.delete(slot);
  }
}

const DB = 'the-human';
const STORE = 'saves';

export class IndexedDbStorage implements SaveStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private async tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async list(): Promise<SlotInfo[]> {
    const out: SlotInfo[] = [];
    for (const slot of SLOTS) {
      const d = await this.load(slot);
      if (d) out.push(slotInfo(slot, d));
    }
    return out;
  }

  async load(slot: SlotId): Promise<SaveData | null> {
    return ((await this.tx('readonly', (s) => s.get(slot))) as SaveData | undefined) ?? null;
  }

  async save(slot: SlotId, data: SaveData): Promise<void> {
    await this.tx('readwrite', (s) => s.put(data, slot));
  }

  async remove(slot: SlotId): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(slot));
  }
}

/** IndexedDB when available, otherwise memory (saves then last only for this visit). */
export function createStorage(): SaveStorage {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbStorage();
  } catch {
    // Private mode on some browsers throws; fall back to memory.
  }
  return new MemoryStorage();
}
