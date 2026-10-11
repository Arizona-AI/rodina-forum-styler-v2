/** Dotted-path helpers for the flat settings tree ("effects.snow"). */

export type PlainObject = Record<string, unknown>;

export function getAtPath(source: unknown, path: string): unknown {
  let node: unknown = source;
  for (const part of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as PlainObject)[part];
  }
  return node;
}

export function setAtPath(target: PlainObject, path: string, value: unknown): void {
  const parts = path.split(".");
  let node: PlainObject = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = node[key];
    if (next === null || typeof next !== "object" || Array.isArray(next)) {
      node[key] = {};
    }
    node = node[key] as PlainObject;
  }
  node[parts[parts.length - 1]!] = value;
}

/** Structured deep clone for JSON-compatible data (settings, themes). */
export function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => deepClone(v)) as unknown as T;
  if (value !== null && typeof value === "object") {
    const out: PlainObject = {};
    for (const [k, v] of Object.entries(value as PlainObject)) out[k] = deepClone(v);
    return out as T;
  }
  return value;
}

/** Merge `patch` into `base` recursively; arrays are replaced, not merged. */
export function deepMerge<T extends PlainObject>(base: T, patch: PlainObject): T {
  const out = deepClone(base) as PlainObject;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const existing = out[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing !== null &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      out[key] = deepMerge(existing as PlainObject, value as PlainObject);
    } else {
      out[key] = deepClone(value);
    }
  }
  return out as T;
}
