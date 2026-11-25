import strings from './strings.id.json';

export type StringKey = keyof typeof strings;

/** Looks up player-facing Indonesian text by key. */
export function t(key: StringKey): string {
  return strings[key];
}
