// Load-time validation for the JSON content in src/data. Pure TS, no DOM.

export type DataIssue = string;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Checks that a file is a non-empty array of objects, each with a unique string id. */
export function validateIdList(name: string, data: unknown): DataIssue[] {
  if (!Array.isArray(data) || data.length === 0) return [`${name}: expected a non-empty array`];
  const issues: DataIssue[] = [];
  const seen = new Set<string>();
  data.forEach((item, i) => {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id === '') {
      issues.push(`${name}[${i}]: missing string "id"`);
      return;
    }
    if (seen.has(item.id)) issues.push(`${name}: duplicate id "${item.id}"`);
    seen.add(item.id);
  });
  return issues;
}

/** Checks that a file is a non-empty array of objects that all have the given keys. */
export function validateKeys(name: string, data: unknown, keys: readonly string[]): DataIssue[] {
  if (!Array.isArray(data) || data.length === 0) return [`${name}: expected a non-empty array`];
  const issues: DataIssue[] = [];
  data.forEach((item, i) => {
    if (!isRecord(item)) {
      issues.push(`${name}[${i}]: expected an object`);
      return;
    }
    for (const k of keys) if (!(k in item)) issues.push(`${name}[${i}]: missing "${k}"`);
  });
  return issues;
}
