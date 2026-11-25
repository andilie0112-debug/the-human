import objectsJson from './objects.json';
import kosJson from './rooms/kos.json';
import type { ActionDef } from '../sim/actions';
import type { NeedKey } from '../sim/needs';
import { NEED_KEYS } from '../sim/needs';

// Typed, validated access to smart-object and room data.

export interface ObjectDef {
  id: string;
  nameKey: string;
  /** Procedural model builder id (see src/home/objectModels.ts). */
  model: string;
  religion?: string;
  /** Width (x) and depth (z) in metres, before rotation. */
  footprint: [number, number];
  /** Where the character stands to use it, in object space (x, z); +z is the object's front. */
  spot: [number, number];
  /** Flat objects (mats, shower tray) the character walks onto; not an obstacle. */
  walkOn?: boolean;
  /** Placed flush against the back wall (worship shelves and altars). */
  againstWall?: boolean;
  actions: ActionDef[];
}

export interface RoomObjectPlacement {
  id: string;
  /** Object id, or "worship:{religion}" for the character's worship object. */
  objectId: string;
  x: number;
  z: number;
  rot: number;
}

export interface RoomLayout {
  width: number;
  depth: number;
  bathroom: { x0: number; z0: number; x1: number; z1: number; doorX0: number; doorX1: number };
  frontDoorX: [number, number];
  objects: RoomObjectPlacement[];
}

const ANIMATIONS = new Set(['stand', 'interact', 'sit', 'lie', 'exercise', 'worship']);
const ACTIVITIES = new Set(['idle', 'sleeping', 'working', 'exercising']);

export function validateObjects(list: unknown[]): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const raw of list) {
    const o = raw as Partial<ObjectDef>;
    const name = `objects.${o.id ?? '?'}`;
    if (typeof o.id !== 'string') issues.push(`${name}: missing id`);
    else if (ids.has(o.id)) issues.push(`${name}: duplicate id`);
    else ids.add(o.id);
    if (!Array.isArray(o.footprint) || o.footprint.length !== 2) issues.push(`${name}: footprint must be [w, d]`);
    if (!Array.isArray(o.spot) || o.spot.length !== 2) issues.push(`${name}: spot must be [x, z]`);
    if (!Array.isArray(o.actions) || o.actions.length === 0) {
      issues.push(`${name}: needs at least one action`);
      continue;
    }
    for (const a of o.actions) {
      const an = `${name}.${a.id}`;
      if (!(a.durationMinutes > 0)) issues.push(`${an}: durationMinutes must be > 0`);
      if (!ANIMATIONS.has(a.animation)) issues.push(`${an}: unknown animation ${a.animation}`);
      if (a.activity && !ACTIVITIES.has(a.activity)) issues.push(`${an}: unknown activity ${a.activity}`);
      for (const k of Object.keys(a.needsPerHour ?? {})) if (!NEED_KEYS.includes(k as NeedKey)) issues.push(`${an}: unknown need ${k}`);
      if (a.endWhenFull && !NEED_KEYS.includes(a.endWhenFull)) issues.push(`${an}: unknown endWhenFull ${a.endWhenFull}`);
    }
  }
  return issues;
}

// JSON string fields are widened to `string`; validateObjects checks them at load time.
export const OBJECTS = objectsJson as unknown as ObjectDef[];
export const KOS_LAYOUT = kosJson as unknown as RoomLayout;

export function objectById(id: string): ObjectDef | undefined {
  return OBJECTS.find((o) => o.id === id);
}

/** Resolves "worship:{religion}" to the worship object of the character's religion. */
export function resolveObjectId(objectId: string, religionId: string): string {
  return objectId === 'worship:{religion}' ? `worship_${religionId}` : objectId;
}
