/**
 * Import / export.
 *
 * Formats:
 *  1. Full JSON backup  — settings + custom themes + flags (pretty JSON).
 *  2. Compact share code — base64url of a compressed bundle (like a "theme code").
 *
 * Every import goes through schema validation + versioned migration +
 * sanitization; nothing reaches storage raw. Secrets (AI key) are never
 * exported and are never accepted from a file.
 */
import type { Settings } from "../types/settings";
import type { CustomTheme } from "../types/theme";
import {
  validateSettings,
  loadSettings,
  saveSettings,
  SETTINGS_KEY,
  CUSTOM_THEMES_KEY,
  CURRENT_SCHEMA_VERSION,
} from "../settings/store";
import { sanitizeTheme, MAX_CUSTOM_THEMES } from "../theme/validate";
import { storageGet, storageSet } from "../shared/browser";
import { isPlainObject, sanitizeText, MAX_IMPORT_LENGTH } from "../shared/validators";
import { logger } from "../shared/logger";

export const BUNDLE_SCHEMA = "rodina-forum-styler";
/** Bundle format version — bump when the export shape changes. */
export const BUNDLE_VERSION = 1;

export interface ExportBundle {
  schema: typeof BUNDLE_SCHEMA;
  /** Bundle format version. */
  version: number;
  /** Settings storage schema version (for migration). */
  settingsVersion: number;
  exportedAt: string;
  settings?: Settings;
  customThemes?: CustomTheme[];
  onboardingDone?: boolean;
}

export type ImportMode = "merge" | "replace";

export interface ImportSuccess {
  ok: true;
  bundle: ExportBundle;
  warnings: string[];
}

export interface ImportFailure {
  ok: false;
  errors: string[];
}

export type ImportResult = ImportSuccess | ImportFailure;

/** Assemble the current state into an exportable bundle. */
export async function buildBundle(): Promise<ExportBundle> {
  const settings = await loadSettings();
  const customThemes = (await storageGet<CustomTheme[]>(CUSTOM_THEMES_KEY)) ?? [];
  const bundle: ExportBundle = {
    schema: BUNDLE_SCHEMA,
    version: BUNDLE_VERSION,
    settingsVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    customThemes: sanitizeThemeList(customThemes),
  };
  return bundle;
}

export function serializeBundle(bundle: ExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/* --------------------------- share codes --------------------------- */

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Encode a bundle as a paste-able share code. */
export function encodeShareCode(bundle: ExportBundle): string {
  return toBase64Url(JSON.stringify(bundle));
}

/* ---------------------------- migration ---------------------------- */

type Migration = (bundle: Record<string, unknown>) => Record<string, unknown>;

/** Versioned migrations: MIGRATIONS[n] upgrades from version n to n+1. */
const MIGRATIONS: Migration[] = [];

function migrate(bundle: Record<string, unknown>): Record<string, unknown> {
  let version = typeof bundle.version === "number" ? bundle.version : 1;
  let data = bundle;
  while (version < BUNDLE_VERSION) {
    const step = MIGRATIONS[version - 1];
    if (!step) break;
    data = step(data);
    version++;
    data.version = version;
  }
  return data;
}

/* ------------------------------ parse ------------------------------ */

/** Parse + validate a JSON import (no storage side effects). */
export function parseBundle(raw: string): ImportResult {
  if (raw.length > MAX_IMPORT_LENGTH) {
    return { ok: false, errors: ["Файл слишком большой (максимум 512 КБ)."] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ["Не удалось разобрать JSON — проверьте, что скопирован целиком."] };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, errors: ["Ожидается JSON-объект экспорта Rodina Forum Styler."] };
  }
  if (parsed.schema !== BUNDLE_SCHEMA) {
    return {
      ok: false,
      errors: [`Неизвестная схема "${sanitizeText(parsed.schema, 40) || "?"}" — это не файл Rodina Forum Styler.`],
    };
  }
  const migrated = migrate(parsed);
  const version = typeof migrated.version === "number" ? migrated.version : 0;
  if (version > BUNDLE_VERSION) {
    return {
      ok: false,
      errors: [`Файл создан более новой версией расширения (v${version}) — обновите расширение.`],
    };
  }

  const warnings: string[] = [];
  const bundle: ExportBundle = {
    schema: BUNDLE_SCHEMA,
    version: BUNDLE_VERSION,
    settingsVersion:
      typeof migrated.settingsVersion === "number" ? migrated.settingsVersion : CURRENT_SCHEMA_VERSION,
    exportedAt: typeof migrated.exportedAt === "string" ? migrated.exportedAt : new Date().toISOString(),
  };

  if (migrated.settings !== undefined) {
    if (!isPlainObject(migrated.settings)) {
      return { ok: false, errors: ["Поле settings должно быть объектом."] };
    }
    bundle.settings = validateSettings(migrated.settings);
    warnings.push("Настройки проверены и приведены к текущей схеме.");
  } else {
    warnings.push("Файл не содержит настроек.");
  }

  if (migrated.customThemes !== undefined) {
    if (!Array.isArray(migrated.customThemes)) {
      return { ok: false, errors: ["Поле customThemes должно быть массивом."] };
    }
    const validThemes = sanitizeThemeList(migrated.customThemes);
    const invalidCount = migrated.customThemes.length - validThemes.length;
    if (invalidCount > 0) {
      warnings.push(`Пропущено некорректных тем: ${invalidCount}.`);
    }
    bundle.customThemes = validThemes.slice(0, MAX_CUSTOM_THEMES);
    if (validThemes.length > MAX_CUSTOM_THEMES) {
      warnings.push(`Тем больше лимита — импортировано первых ${MAX_CUSTOM_THEMES}.`);
    }
  }

  if (migrated.onboardingDone === true) bundle.onboardingDone = true;

  return { ok: true, bundle, warnings };
}

/** Accept an arbitrary payload (share code or JSON) and return a bundle. */
export function parseShareCode(code: string): ImportResult {
  const trimmed = code.trim();
  if (trimmed.startsWith("{")) return parseBundle(trimmed);
  if (trimmed.length === 0 || trimmed.length > MAX_IMPORT_LENGTH) {
    return { ok: false, errors: ["Код пуст или слишком большой."] };
  }
  try {
    return parseBundle(fromBase64Url(trimmed));
  } catch {
    return { ok: false, errors: ["Код не читается — убедитесьесь, что он скопирован без изменений."] };
  }
}

/* ----------------------------- apply ------------------------------ */

function sanitizeThemeList(list: unknown[]): CustomTheme[] {
  const out: CustomTheme[] = [];
  for (const item of list) {
    const theme = sanitizeTheme(item);
    if (!theme) continue;
    const now = Date.now();
    out.push({
      ...theme,
      createdAt: typeof (item as { createdAt?: unknown })?.createdAt === "number" ? (item as { createdAt: number }).createdAt : now,
      updatedAt: typeof (item as { updatedAt?: unknown })?.updatedAt === "number" ? (item as { updatedAt: number }).updatedAt : now,
      basedOn: typeof (item as { basedOn?: unknown })?.basedOn === "string" ? (item as { basedOn: string }).basedOn : undefined,
    });
  }
  // No limit here: callers slice to MAX_CUSTOM_THEMES so the "invalid" and
  // "over the limit" warnings can be counted independently and truthfully.
  return out;
}

/**
 * Apply a parsed bundle to storage.
 * `merge` keeps current data and adds/overwrites imported pieces,
 * `replace` overwrites settings and themes entirely.
 */
export async function applyBundle(bundle: ExportBundle, mode: ImportMode): Promise<string[]> {
  const warnings: string[] = [];
  const existingThemes = (await storageGet<CustomTheme[]>(CUSTOM_THEMES_KEY)) ?? [];
  const importedThemes = bundle.customThemes ?? [];

  if (mode === "replace") {
    if (bundle.settings) await saveSettings(bundle.settings);
    await storageSet(CUSTOM_THEMES_KEY, dedupeThemes(importedThemes));
  } else {
    if (bundle.settings) {
      const current = await loadSettings();
      // Merge section-wise: imported sections overwrite, everything else kept.
      const merged = { ...current, ...bundle.settings } as Settings;
      // Theme selection/favorites merge explicitly to avoid losing picks.
      merged.theme = {
        ...current.theme,
        ...bundle.settings.theme,
        favorites: [...new Set([...current.theme.favorites, ...(bundle.settings.theme?.favorites ?? [])])].slice(0, 50),
        recent: [...new Set([...bundle.settings.theme?.recent ?? [], ...current.theme.recent])].slice(0, 8),
      };
      await saveSettings(merged);
      warnings.push("Настройки объединены с текущими.");
    }
    await storageSet(CUSTOM_THEMES_KEY, dedupeThemes([...existingThemes, ...importedThemes]));
    if (importedThemes.length > 0) {
      warnings.push(`Добавлено тем: ${importedThemes.length}.`);
    }
  }
  logger.info("io", `bundle applied (${mode})`);
  return warnings;
}

function dedupeThemes(themes: CustomTheme[]): CustomTheme[] {
  const byId = new Map<string, CustomTheme>();
  for (const theme of themes) {
    const existing = byId.get(theme.id);
    if (!existing || theme.updatedAt >= existing.updatedAt) byId.set(theme.id, theme);
  }
  return [...byId.values()].slice(0, MAX_CUSTOM_THEMES);
}

/** Convenience: raw text -> validated + applied. */
export async function importFromText(raw: string, mode: ImportMode): Promise<ImportResult> {
  const parsed = parseBundle(raw);
  if (!parsed.ok) return parsed;
  const warnings = await applyBundle(parsed.bundle, mode);
  return { ok: true, bundle: parsed.bundle, warnings: [...parsed.warnings, ...warnings] };
}

/** Reset helper re-export so the UI has a single import surface. */
export { SETTINGS_KEY, CUSTOM_THEMES_KEY };
