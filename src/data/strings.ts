import strings from './strings.id.json';

export type StringKey = keyof typeof strings;

/** Looks up player-facing Indonesian text by key. */
export function t(key: StringKey): string {
  return strings[key];
}

/** Looks up a key built at runtime (for example `day.${n}`); falls back to the key itself. */
export function tDynamic(key: string): string {
  return (strings as Record<string, string>)[key] ?? key;
}

/** Fills {placeholders} in a string. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`));
}
