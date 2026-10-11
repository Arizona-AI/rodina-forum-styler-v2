/**
 * Settings store: load / validate / persist / subscribe.
 *
 * - All values pass through schema-aware validation on load and save, so a
 *   corrupted or outdated storage entry can never break the UI or the forum.
 * - Changes are written to chrome.storage.local; every extension context and
 *   every forum tab reacts through onStorageChange (live sync).
 */
import type { Settings, CustomNavItem } from "../types/settings";
import { DEFAULT_SETTINGS } from "./defaults";
import { SETTINGS_SCHEMA, type SettingDef } from "./schema";
import { deepClone, getAtPath, setAtPath } from "../shared/paths";
import { sanitizeColor, sanitizeGradient, sanitizeText, sanitizeUrl, sanitizeFontFamily, sanitizeLabel, sanitizeId, isPlainObject } from "../shared/validators";
import { storageGet, storageSet, storageRemove, onStorageChange } from "../shared/browser";
import { logger } from "../shared/logger";

export const SETTINGS_KEY = "rfs.settings";
export const META_KEY = "rfs.meta";
export const CUSTOM_THEMES_KEY = "rfs.customThemes";
export const EDITOR_DRAFT_KEY = "rfs.editorDraft";
export const AI_SECRETS_KEY = "rfs.aiSecrets";

export interface ExtensionMeta {
  schemaVersion: number;
  onboardingDone: boolean;
  installedAt: number;
  lastLaunchedAt: number;
}

/** Current storage schema version — bump when migrations change. */
export const CURRENT_SCHEMA_VERSION = 1;

const SCHEMA_BY_KEY = new Map<string, SettingDef>(SETTINGS_SCHEMA.map((d) => [d.key, d]));

/** Every dotted path present in the schema (used for validation sweeps). */
export function schemaKeys(): string[] {
  return SETTINGS_SCHEMA.map((d) => d.key);
}

/** Coerce a raw value to the type/limits declared in the schema. */
export function coerceValue(def: SettingDef, raw: unknown): unknown {
  switch (def.control) {
    case "toggle": {
      if (typeof raw === "boolean") return raw;
      if (raw === "true" || raw === 1 || raw === "1") return true;
      if (raw === "false" || raw === 0 || raw === "0") return false;
      return undefined;
    }
    case "slider": {
      const num = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(num)) return undefined;
      const min = def.min ?? 0;
      const max = def.max ?? 100;
      const clamped = Math.min(max, Math.max(min, num));
      const step = def.step ?? 1;
      const snapped = def.step && step < 1 ? Math.round(clamped / step) * step : Math.round(clamped / step) * step;
      return Number(snapped.toFixed(4));
    }
    case "select": {
      if (!def.options) return undefined;
      const valid = def.options.some((o) => o.value === raw);
      return valid ? raw : undefined;
    }
    case "color":
      return sanitizeColor(raw) ?? undefined;
    case "url":
      return sanitizeUrl(raw) ?? (raw === "" ? "" : undefined);
    case "text": {
      const text = sanitizeText(raw, 500);
      return text;
    }
    default:
      return undefined;
  }
}

/** Validate/coerce a settings-like object against the schema. */
export function validateSettings(raw: unknown): Settings {
  const result = deepClone(DEFAULT_SETTINGS) as unknown as Record<string, unknown>;
  if (raw === null || typeof raw !== "object") return result as unknown as Settings;
  for (const def of SETTINGS_SCHEMA) {
    const incoming = getAtPath(raw, def.key);
    if (incoming === undefined) continue;
    const coerced = coerceValue(def, incoming);
    if (coerced !== undefined) setAtPath(result, def.key, coerced);
  }
  // Non-schema fields with dedicated sanitizers.
  const gradient = getAtPath(raw, "background.gradient");
  if (typeof gradient === "string") {
    const clean = sanitizeGradient(gradient);
    setAtPath(result, "background.gradient", clean ?? "");
  }
  const customFamily = getAtPath(raw, "font.customFamily");
  if (typeof customFamily === "string") {
    setAtPath(result, "font.customFamily", sanitizeFontFamily(customFamily) ?? "");
  }
  const customSource = getAtPath(raw, "font.customSource");
  if (typeof customSource === "string") {
    setAtPath(result, "font.customSource", sanitizeUrl(customSource) ?? "");
  }
  const cursorUrl = getAtPath(raw, "cursor.customUrl");
  if (typeof cursorUrl === "string") {
    setAtPath(result, "cursor.customUrl", sanitizeUrl(cursorUrl) ?? "");
  }
  // Active theme id: a non-schema slug that must survive every validation
  // pass — without this the active theme silently reverts to the default on
  // each load/save (the «themes don't apply» bug).
  const activeId = getAtPath(raw, "theme.activeId");
  if (typeof activeId === "string") {
    const clean = sanitizeId(activeId);
    if (clean) setAtPath(result, "theme.activeId", clean);
  }
  // String arrays: favorites / recent (bounded, slug-validated).
  for (const listKey of ["theme.favorites", "theme.recent"] as const) {
    const list = getAtPath(raw, listKey);
    if (Array.isArray(list)) {
      const clean = list
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().toLowerCase())
        .filter((v) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(v))
        .slice(0, listKey === "theme.recent" ? 8 : 50);
      setAtPath(result, listKey, [...new Set(clean)]);
    }
  }
  // Navbar ids hidden by the user (bounded, markup-hostile chars rejected).
  const hiddenNav = getAtPath(raw, "tweaks.hiddenNavIds");
  if (Array.isArray(hiddenNav)) {
    const clean = hiddenNav
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && v.length <= 120 && !/[\r\n<>"'`\\]/.test(v))
      .slice(0, 40);
    setAtPath(result, "tweaks.hiddenNavIds", [...new Set(clean)]);
  }
  // User-defined navbar links (name/url validated, count capped at 10).
  const customNav = getAtPath(raw, "tweaks.customNavItems");
  if (Array.isArray(customNav)) {
    const clean: CustomNavItem[] = [];
    const seenIds = new Set<string>();
    for (const entry of customNav) {
      if (clean.length >= 10) break;
      if (!isPlainObject(entry)) continue;
      const name = sanitizeLabel(entry.name, 40);
      const url = sanitizeUrl(entry.url);
      if (!name || !url) continue;
      let id = typeof entry.id === "string" ? entry.id.trim().toLowerCase() : "";
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) id = `item-${clean.length + 1}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      clean.push({ id, name, url, newTab: entry.newTab === true });
    }
    setAtPath(result, "tweaks.customNavItems", clean);
  }
  return result as unknown as Settings;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await storageGet<unknown>(SETTINGS_KEY);
    if (stored === null) return deepClone(DEFAULT_SETTINGS);
    return validateSettings(stored);
  } catch (err) {
    logger.error("store", `loadSettings failed, using defaults: ${String(err)}`);
    return deepClone(DEFAULT_SETTINGS);
  }
}

/** Persist a full settings object (validated). Throws user-readable errors. */
export async function saveSettings(settings: Settings): Promise<void> {
  const valid = validateSettings(settings);
  await storageSet(SETTINGS_KEY, valid);
}

/** Update a single setting by dotted path. Returns the new full object. */
export async function updateSetting(key: string, value: unknown): Promise<Settings> {
  const def = SCHEMA_BY_KEY.get(key);
  const current = await loadSettings();
  let nextValue = value;
  if (def) {
    const coerced = coerceValue(def, value);
    if (coerced === undefined) {
      throw new Error(`Недопустимое значение для ${key}`);
    }
    nextValue = coerced;
  }
  setAtPath(current as unknown as Record<string, unknown>, key, nextValue);
  await saveSettings(current);
  return current;
}

/** Reset a single setting to its default. */
export async function resetSetting(key: string): Promise<Settings> {
  const current = await loadSettings();
  setAtPath(current as unknown as Record<string, unknown>, key, deepClone(getAtPath(DEFAULT_SETTINGS, key)));
  await saveSettings(current);
  return current;
}

/**
 * Settings that live outside the schema (no scalar control renders them)
 * but must still reset with their group — edited by dedicated panels.
 */
const NON_SCHEMA_RESETS: Record<string, readonly string[]> = {
  tweaks: ["tweaks.hiddenNavIds", "tweaks.customNavItems"],
};

/** Reset every setting belonging to a schema group. */
export async function resetGroup(group: string): Promise<Settings> {
  const current = await loadSettings();
  for (const def of SETTINGS_SCHEMA) {
    if (def.group !== group) continue;
    setAtPath(current as unknown as Record<string, unknown>, def.key, deepClone(getAtPath(DEFAULT_SETTINGS, def.key)));
  }
  for (const key of NON_SCHEMA_RESETS[group] ?? []) {
    setAtPath(current as unknown as Record<string, unknown>, key, deepClone(getAtPath(DEFAULT_SETTINGS, key)));
  }
  await saveSettings(current);
  return current;
}

/** Reset everything (keeps custom themes unless `keepThemes` is false). */
export async function resetAll(keepThemes = true): Promise<Settings> {
  const fresh = deepClone(DEFAULT_SETTINGS);
  await saveSettings(fresh);
  if (!keepThemes) {
    await storageSet(CUSTOM_THEMES_KEY, []);
  }
  return fresh;
}

/** Subscribe to settings changes from any context. */
export function subscribeSettings(handler: (settings: Settings) => void): () => void {
  try {
    return onStorageChange(SETTINGS_KEY, (value) => {
      handler(validateSettings(value));
    });
  } catch (err) {
    // No extension storage here (plain-page smoke test): nothing to sync
    // with, and writes are already reported by loadSettings/saveSettings.
    logger.warn("store", `subscribeSettings unavailable: ${String(err)}`);
    return () => undefined;
  }
}

/* ------------------------------- meta ------------------------------- */

export async function loadMeta(): Promise<ExtensionMeta> {
  const stored = await storageGet<Partial<ExtensionMeta>>(META_KEY);
  const meta: ExtensionMeta = {
    schemaVersion: stored?.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    onboardingDone: stored?.onboardingDone ?? false,
    installedAt: stored?.installedAt ?? Date.now(),
    lastLaunchedAt: Date.now(),
  };
  return meta;
}

export async function saveMeta(meta: ExtensionMeta): Promise<void> {
  await storageSet(META_KEY, meta);
}

/* --------------------------- editor draft --------------------------- */

export interface EditorDraft {
  /** Loose token bag — validated by theme/validate before use. */
  tokens: Record<string, unknown>;
  baseThemeId: string;
  updatedAt: number;
  /**
   * When true the content script renders these tokens instead of the active
   * theme (live preview from the dashboard editor).
   */
  previewOnly?: boolean;
}

export async function loadDraft(): Promise<EditorDraft | null> {
  return storageGet<EditorDraft>(EDITOR_DRAFT_KEY);
}

export async function saveDraft(draft: EditorDraft): Promise<void> {
  await storageSet(EDITOR_DRAFT_KEY, draft);
}

export async function clearDraft(): Promise<void> {
  try {
    await storageRemove(EDITOR_DRAFT_KEY);
  } catch (err) {
    logger.warn("store", `clearDraft: ${String(err)}`);
  }
}
