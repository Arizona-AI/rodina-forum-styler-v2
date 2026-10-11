/**
 * Theme sanitization / validation.
 *
 * Used when loading custom themes from storage, importing shared codes and
 * accepting AI-generated palettes. Rejects or repairs anything that is not a
 * plain declarative theme — themes can never carry executable content.
 */
import type { ThemeDefinition, ThemeTokens, ThemeCategory, ThemeMode } from "../types/theme";
import { TOKEN_COLOR_FIELDS, TOKEN_LENGTH_FIELDS, DEFAULT_FONT_STACK } from "../types/theme";
import { sanitizeColor, sanitizeId, sanitizeLabel, isPlainObject } from "../shared/validators";

const RADIUS_RE = /^([0-9]|1[0-9]|2[0-4])(\.\d)?px$/;
const FONT_STACK_RE = /^[a-zA-Z0-9 ,'"-]+$/;

const VALID_CATEGORIES: ThemeCategory[] = ["dark", "light", "neon", "pastel", "minimal", "retro", "nature", "fantasy"];
const VALID_MODES: ThemeMode[] = ["dark", "light"];

/**
 * Repair a loose token bag into a complete ThemeTokens object.
 * Returns null when fewer than half of the core colors are valid —
 * that indicates garbage input rather than a slightly broken theme.
 */
export function sanitizeTokens(raw: unknown, fallback?: ThemeTokens): ThemeTokens | null {
  if (!isPlainObject(raw)) return null;
  const base: ThemeTokens = fallback ? { ...fallback } : fallbackTokens();
  let valid = 0;
  let seen = 0;
  for (const field of TOKEN_COLOR_FIELDS) {
    if (raw[field] === undefined) continue;
    seen++;
    const clean = sanitizeColor(raw[field]);
    if (clean) {
      base[field] = clean;
      valid++;
    }
  }
  if (seen > 0 && valid < Math.ceil(seen / 2)) return null;
  for (const field of TOKEN_LENGTH_FIELDS) {
    const value = raw[field];
    if (value === undefined) continue;
    if (field === "fontFamily") {
      if (typeof value === "string" && value.length <= 120 && FONT_STACK_RE.test(value)) {
        base.fontFamily = value;
      }
      continue;
    }
    if (typeof value === "string" && RADIUS_RE.test(value)) {
      base[field] = value;
    }
  }
  return base;
}

/** Complete token set derived from the extension defaults. */
export function fallbackTokens(): ThemeTokens {
  return { ...DEFAULT_THEME_TOKENS };
}

/**
 * Default tokens: the Rodina native palette re-expressed in our schema
 * (dark #121212 background, crimson #d9204f accent — mirrors the live forum).
 */
export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  pageBg: "#121212",
  pageBgSecondary: "#17171b",
  surface: "#1b1b1f",
  surfaceAlt: "#232327",
  surfaceHover: "#2a2a30",
  text: "#ececf1",
  textMuted: "#a3a3ad",
  textFaint: "#74747e",
  border: "#2d2d33",
  borderStrong: "#3c3c44",
  primary: "#d9204f",
  primaryHover: "#ef3a66",
  primaryFg: "#ffffff",
  secondary: "#7c3aed",
  accent: "#22d3ee",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  buttonBg: "#232327",
  buttonFg: "#ececf1",
  buttonBorder: "#34343b",
  radiusSmall: "6px",
  radiusMedium: "10px",
  radiusLarge: "15px",
  shadowColor: "#000000",
  headerBg: "#17171b",
  sidebarBg: "#1b1b1f",
  footerBg: "#141417",
  fontFamily: DEFAULT_FONT_STACK,
};

/** Validate a complete theme definition (id/name/category/mode/tokens). */
export function sanitizeTheme(raw: unknown): ThemeDefinition | null {
  if (!isPlainObject(raw)) return null;
  const id = sanitizeId(raw.id);
  if (!id) return null;
  const name = sanitizeLabel(raw.name, 60);
  if (!name) return null;
  const category = VALID_CATEGORIES.includes(raw.category as ThemeCategory)
    ? (raw.category as ThemeCategory)
    : "dark";
  const mode = VALID_MODES.includes(raw.mode as ThemeMode) ? (raw.mode as ThemeMode) : "dark";
  const tokens = sanitizeTokens(raw.tokens, DEFAULT_THEME_TOKENS);
  if (!tokens) return null;
  const description = sanitizeLabel(raw.description ?? "", 160);
  return { id, name, description, category, mode, tokens };
}

/** Hard cap for stored custom themes (keeps storage well under quota). */
export const MAX_CUSTOM_THEMES = 100;
