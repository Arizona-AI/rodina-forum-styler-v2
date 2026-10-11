/**
 * Variant derivation.
 *
 * Every built-in theme is a concept × a variant. Variants never hand-write
 * palettes: each one is computed from the concept's base tokens with the
 * shared color helpers (mixHex / lighten / saturate / ensureContrast), so a
 * concept stays visually coherent across all of its variants and picks up
 * fixes (contrast, shape) automatically.
 */
import type { ThemeMode, ThemeTokens } from "../../types/theme";
import { adjustSaturation, ensureContrast, lighten, mixHex, parseColor, toHex } from "../../shared/color";

export type VariantSlug = "core" | "deep" | "soft" | "vivid" | "muted" | "night" | "high";

/** One derivation recipe applied to a concept's base tokens. */
export interface VariantSpec {
  /** Kebab-safe slug appended to the concept id. */
  slug: VariantSlug;
  /** Russian suffix appended to the concept name. */
  label: string;
  /** Russian phrase appended to the concept description. */
  note: string;
  /** Compute the variant tokens from the concept's base tokens. */
  apply: (tokens: ThemeTokens, mode: ThemeMode) => ThemeTokens;
}

/* ------------------------------- field groups ------------------------------- */

const SURFACE_FIELDS: readonly (keyof ThemeTokens)[] = [
  "pageBg",
  "pageBgSecondary",
  "surface",
  "surfaceAlt",
  "surfaceHover",
  "headerBg",
  "sidebarBg",
  "footerBg",
  "buttonBg",
];

const LINE_FIELDS: readonly (keyof ThemeTokens)[] = ["border", "borderStrong", "buttonBorder"];

const BRAND_FIELDS: readonly (keyof ThemeTokens)[] = ["primary", "primaryHover", "secondary", "accent"];

const SEMANTIC_FIELDS: readonly (keyof ThemeTokens)[] = ["success", "warning", "danger", "info"];

/* --------------------------------- helpers --------------------------------- */

/** Apply `fn` to every listed field, returning a fresh token bag. */
function mapFields(
  tokens: ThemeTokens,
  fields: readonly (keyof ThemeTokens)[],
  fn: (value: string) => string,
): ThemeTokens {
  const next: ThemeTokens = { ...tokens };
  for (const field of fields) {
    next[field] = fn(next[field]);
  }
  return next;
}

/** Saturation nudge for a hex color (keeps hue/lightness, clamps to gamut). */
function saturateHex(color: string, delta: number): string {
  const rgb = parseColor(color);
  return rgb ? toHex(adjustSaturation(rgb, delta)) : color;
}

/** Shift a radius token by `delta` px, keeping it inside the 0–24px schema. */
function bumpRadius(value: string, delta: number): string {
  const current = Number.parseFloat(value);
  if (Number.isNaN(current)) return value;
  const next = Math.min(24, Math.max(0, Math.round((current + delta) * 2) / 2));
  return `${next}px`;
}

/** Adjust all three radius tokens at once. */
function withRadius(tokens: ThemeTokens, small: number, medium: number, large: number): ThemeTokens {
  return {
    ...tokens,
    radiusSmall: bumpRadius(tokens.radiusSmall, small),
    radiusMedium: bumpRadius(tokens.radiusMedium, medium),
    radiusLarge: bumpRadius(tokens.radiusLarge, large),
  };
}

/**
 * Pass run at the end of every variant: nudges text-on-background and
 * text-on-brand pairs until they clear readable contrast ratios. No-op for
 * palettes that are already readable, so hand-tuned concepts pass through
 * unchanged.
 */
function finalize(tokens: ThemeTokens): ThemeTokens {
  const next: ThemeTokens = { ...tokens };
  next.text = ensureContrast(next.text, next.surface, 4.5);
  next.textMuted = ensureContrast(next.textMuted, next.surface, 3);
  next.primaryFg = ensureContrast(next.primaryFg, next.primary, 4.5);
  next.buttonFg = ensureContrast(next.buttonFg, next.buttonBg, 4.5);
  return next;
}

/* ----------------------------- variant recipes ----------------------------- */

/** The concept as-is (plus the shared readability pass). */
function applyCore(tokens: ThemeTokens): ThemeTokens {
  return finalize({ ...tokens });
}

/** Deeper, denser take: darker surfaces, tighter corners (dark) / heavier paper (light). */
function applyDeep(tokens: ThemeTokens, mode: ThemeMode): ThemeTokens {
  const surfaceWeight = mode === "dark" ? 0.14 : 0.07;
  const lineWeight = mode === "dark" ? 0.12 : 0.08;
  let next = mapFields(tokens, SURFACE_FIELDS, (c) => mixHex(c, "#000000", surfaceWeight));
  next = mapFields(next, LINE_FIELDS, (c) => mixHex(c, "#000000", lineWeight));
  next = withRadius(next, -1, -2, -2);
  return finalize(next);
}

/** Airier take: lifted surfaces, softened lines, calmer accents, rounder corners. */
function applySoft(tokens: ThemeTokens, mode: ThemeMode): ThemeTokens {
  const lift = mode === "dark" ? 0.08 : 0.35;
  let next = mapFields(tokens, SURFACE_FIELDS, (c) => mixHex(c, "#ffffff", lift));
  const softened = next.surface;
  next = mapFields(next, LINE_FIELDS, (c) => mixHex(c, softened, 0.25));
  next = mapFields(next, BRAND_FIELDS, (c) => saturateHex(c, -0.06));
  next = withRadius(next, 2, 3, 4);
  return finalize(next);
}

/** Saturated take: hotter brand colors plus a brand wash over the background. */
function applyVivid(tokens: ThemeTokens, mode: ThemeMode): ThemeTokens {
  const gain = mode === "dark" ? 0.16 : 0.12;
  const lift = mode === "dark" ? 0.05 : 0.02;
  const wash = mode === "dark" ? 0.06 : 0.04;
  let next: ThemeTokens = { ...tokens };
  next.primary = saturateHex(lighten(tokens.primary, lift), gain);
  next.primaryHover = lighten(next.primary, mode === "dark" ? 0.06 : -0.07);
  next.secondary = saturateHex(tokens.secondary, gain);
  next.accent = saturateHex(lighten(tokens.accent, mode === "dark" ? 0.04 : 0), gain);
  next = mapFields(next, SEMANTIC_FIELDS, (c) => saturateHex(c, gain * 0.7));
  next.pageBg = mixHex(next.pageBg, next.primary, wash);
  next.pageBgSecondary = mixHex(next.pageBgSecondary, next.secondary, wash * 0.85);
  next.surface = mixHex(next.surface, next.primary, wash * 0.5);
  return finalize(next);
}

/** Low-energy take: neutralized surfaces, desaturated palette, softer read. */
function applyMuted(tokens: ThemeTokens, mode: ThemeMode): ThemeTokens {
  const neutral = mode === "dark" ? 0.07 : 0.09;
  let next = mapFields(tokens, SURFACE_FIELDS, (c) => mixHex(c, "#808080", neutral));
  next = mapFields(next, LINE_FIELDS, (c) => mixHex(c, "#808080", 0.2));
  next = mapFields(next, BRAND_FIELDS, (c) => saturateHex(c, -0.22));
  next = mapFields(next, SEMANTIC_FIELDS, (c) => saturateHex(c, -0.18));
  next.textMuted = saturateHex(next.textMuted, -0.15);
  return finalize(next);
}

/** Evening take: near-black depths in dark mode, warm paper dimming in light mode. */
function applyNight(tokens: ThemeTokens, mode: ThemeMode): ThemeTokens {
  if (mode === "dark") {
    let next = mapFields(tokens, SURFACE_FIELDS, (c) => mixHex(c, "#000000", 0.22));
    next = mapFields(next, LINE_FIELDS, (c) => mixHex(c, "#000000", 0.15));
    next = mapFields(next, BRAND_FIELDS, (c) => mixHex(c, "#000000", 0.08));
    next.textMuted = mixHex(next.textMuted, next.surface, 0.4);
    next.textFaint = mixHex(next.textFaint, next.surface, 0.5);
    return finalize(next);
  }
  let next = mapFields(tokens, SURFACE_FIELDS, (c) => mixHex(c, "#e8d5b7", 0.45));
  next = mapFields(next, LINE_FIELDS, (c) => mixHex(c, "#cbb491", 0.4));
  next.text = mixHex(next.text, "#3a2f22", 0.2);
  next = mapFields(next, BRAND_FIELDS, (c) => saturateHex(c, -0.05));
  return finalize(next);
}

/** Accessibility take: stronger lines, brighter text, punchier accents. */
function applyHigh(tokens: ThemeTokens, mode: ThemeMode): ThemeTokens {
  const toward = mode === "dark" ? "#ffffff" : "#000000";
  const weight = mode === "dark" ? 0.14 : 0.16;
  let next = mapFields(tokens, LINE_FIELDS, (c) => mixHex(c, toward, weight));
  next.borderStrong = mixHex(next.borderStrong, toward, weight + 0.1);
  next = mapFields(next, BRAND_FIELDS, (c) => saturateHex(c, 0.06));
  next.text = ensureContrast(next.text, next.surface, 10);
  next.textMuted = ensureContrast(next.textMuted, next.surface, 5);
  next.textFaint = ensureContrast(next.textFaint, next.surface, 3);
  return finalize(next);
}

/* --------------------------------- registry -------------------------------- */

export const VARIANTS: readonly VariantSpec[] = [
  { slug: "core", label: "Базовая", note: "Базовая версия концепции.", apply: applyCore },
  { slug: "deep", label: "Глубокая", note: "Плотная глубокая версия с приглушённым фоном.", apply: applyDeep },
  { slug: "soft", label: "Мягкая", note: "Мягкая воздушная версия с округлыми формами.", apply: applySoft },
  { slug: "vivid", label: "Яркая", note: "Яркая версия с сочными акцентами.", apply: applyVivid },
  { slug: "muted", label: "Приглушённая", note: "Приглушённая версия с мягкими контрастами.", apply: applyMuted },
  { slug: "night", label: "Ночная", note: "Ночная версия для долгих вечерних чтений.", apply: applyNight },
  { slug: "high", label: "Контрастная", note: "Контрастная версия с усиленной читаемостью.", apply: applyHigh },
];
