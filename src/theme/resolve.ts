/**
 * Theme resolution: pick the active theme definition from the built-in
 * catalog, user themes and (optionally) the editor preview override.
 */
import type { Settings } from "../types/settings";
import type { CustomTheme, ThemeDefinition, ThemeTokens } from "../types/theme";
import { BUILTIN_THEMES } from "./library";
import { DEFAULT_THEME_TOKENS, sanitizeTheme, sanitizeTokens } from "./validate";
import { storageGet, storageSet } from "../shared/browser";
import { CUSTOM_THEMES_KEY, EDITOR_DRAFT_KEY, type EditorDraft } from "../settings/store";
import { sanitizeId, sanitizeLabel } from "../shared/validators";
import { logger } from "../shared/logger";

export { BUILTIN_THEMES };

/** Built-in theme lookup. */
export function findBuiltin(id: string): ThemeDefinition | null {
  return BUILTIN_THEMES.find((t) => t.id === id) ?? null;
}

export async function loadCustomThemes(): Promise<CustomTheme[]> {
  try {
    const raw = await storageGet<unknown[]>(CUSTOM_THEMES_KEY);
    if (!Array.isArray(raw)) return [];
    const out: CustomTheme[] = [];
    for (const item of raw) {
      const theme = sanitizeTheme(item);
      if (!theme) continue;
      const now = Date.now();
      out.push({
        ...theme,
        createdAt: numberOr((item as { createdAt?: unknown }).createdAt, now),
        updatedAt: numberOr((item as { updatedAt?: unknown }).updatedAt, now),
      });
    }
    return out;
  } catch (err) {
    logger.error("theme", `loadCustomThemes: ${String(err)}`);
    return [];
  }
}

export async function saveCustomThemes(themes: CustomTheme[]): Promise<void> {
  await storageSet(CUSTOM_THEMES_KEY, themes);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Full catalog (built-in + custom) — drives the theme grid and popup. */
export async function getThemeCatalog(): Promise<ThemeDefinition[]> {
  const custom = await loadCustomThemes();
  return [...BUILTIN_THEMES, ...custom];
}

/** Resolve a theme by id from any source; falls back to defaults. */
export async function resolveThemeById(id: string): Promise<ThemeDefinition> {
  const cleanId = sanitizeId(id) ?? "";
  const builtin = findBuiltin(cleanId);
  if (builtin) return builtin;
  const custom = await loadCustomThemes();
  const match = custom.find((t) => t.id === cleanId);
  if (match) return match;
  const fallbackId = sanitizeId(DEFAULT_THEME_ID) ?? "rodina-eclipse";
  return findBuiltin(fallbackId) ?? {
    id: "rodina-eclipse",
    name: "Rodina Eclipse",
    description: "",
    category: "dark",
    mode: "dark",
    tokens: DEFAULT_THEME_TOKENS,
  };
}

/** Default theme id (kept in sync with DEFAULT_SETTINGS.theme.activeId). */
export const DEFAULT_THEME_ID = "rodina-eclipse";

/**
 * The tokens that should be compiled right now:
 *  1. editor preview draft (if the dashboard asks for live preview),
 *  2. otherwise the active theme from settings.
 */
export async function resolveActiveTokens(settings: Settings): Promise<ThemeTokens> {
  const draft = await storageGet<EditorDraft>(EDITOR_DRAFT_KEY);
  if (draft && typeof draft === "object" && draft.previewOnly === true) {
    const tokens = sanitizeTokens(draft.tokens, DEFAULT_THEME_TOKENS);
    if (tokens) return tokens;
  }
  const theme = await resolveThemeById(settings.theme.activeId);
  return theme.tokens;
}

/** Mark a theme as recently used (bounded list, newest first). */
export function withRecent(settings: Settings, themeId: string): Settings["theme"] {
  const recent = [themeId, ...settings.theme.recent.filter((id) => id !== themeId)].slice(0, 8);
  return { ...settings.theme, recent };
}

/** Save user tokens as a custom theme (create or update). */
export async function upsertCustomTheme(
  input: { id?: string; name: string; description?: string; category?: ThemeDefinition["category"]; mode?: ThemeDefinition["mode"]; tokens: ThemeTokens; basedOn?: string },
): Promise<CustomTheme> {
  const existing = await loadCustomThemes();
  const now = Date.now();
  const id = sanitizeId(input.id ?? input.name) ?? `theme-${now}`;
  const previous = existing.find((t) => t.id === id);
  const theme: CustomTheme = {
    id,
    name: sanitizeLabel(input.name, 60) || "Моя тема",
    description: sanitizeLabel(input.description ?? "", 160),
    category: input.category ?? "dark",
    mode: input.mode ?? "dark",
    tokens: input.tokens,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    basedOn: input.basedOn ?? previous?.basedOn,
  };
  const next = previous ? existing.map((t) => (t.id === id ? theme : t)) : [...existing, theme];
  await saveCustomThemes(next);
  return theme;
}

export async function deleteCustomTheme(id: string): Promise<void> {
  const existing = await loadCustomThemes();
  await saveCustomThemes(existing.filter((t) => t.id !== id));
}
