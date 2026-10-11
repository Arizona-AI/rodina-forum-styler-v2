/**
 * Theme compiler: design tokens -> CSS custom properties.
 *
 * The forum stylesheet (src/content/styles/*) is written entirely against
 * `--rfs-*` variables, so switching a theme is a single <style> replacement
 * (or a variable swap) — no class juggling, no reflows of individual nodes.
 */
import type { ThemeTokens } from "../types/theme";
import { parseColor, toRgbString, withAlpha, lighten, ensureContrast } from "../shared/color";

/** CSS custom property names produced by the compiler. */
export const THEME_VAR_PREFIX = "--rfs-";

function safe(value: string, fallback = "#000000"): string {
  return parseColor(value) ? value : fallback;
}

/** Alpha-aware shadow color helper: scales the token's alpha channel. */
function shadow(shadowColor: string, alpha: number): string {
  const rgb = parseColor(shadowColor);
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`;
  return toRgbString(withAlpha(rgb, rgb.a * alpha));
}

/**
 * Compile tokens to a CSS text block scoped to `:root`.
 * All values are re-validated here, so even a hand-edited theme cannot
 * inject anything but colors and lengths.
 */
export function compileThemeVariables(tokens: ThemeTokens): string {
  const t = {
    pageBg: safe(tokens.pageBg, "#121212"),
    pageBgSecondary: safe(tokens.pageBgSecondary, tokens.pageBg),
    surface: safe(tokens.surface, "#1c1c1f"),
    surfaceAlt: safe(tokens.surfaceAlt, "#232327"),
    surfaceHover: safe(tokens.surfaceHover, "#2a2a2f"),
    text: safe(tokens.text, "#ececf1"),
    textMuted: safe(tokens.textMuted, "#a0a0aa"),
    textFaint: safe(tokens.textFaint, "#70707a"),
    border: safe(tokens.border, "#2e2e34"),
    borderStrong: safe(tokens.borderStrong, "#3d3d45"),
    primary: safe(tokens.primary, "#d9204f"),
    primaryHover: safe(tokens.primaryHover, lighten(tokens.primary, 0.08)),
    primaryFg: safe(tokens.primaryFg, "#ffffff"),
    secondary: safe(tokens.secondary, "#7c3aed"),
    accent: safe(tokens.accent, "#22d3ee"),
    success: safe(tokens.success, "#22c55e"),
    warning: safe(tokens.warning, "#f59e0b"),
    danger: safe(tokens.danger, "#ef4444"),
    info: safe(tokens.info, "#3b82f6"),
    buttonBg: safe(tokens.buttonBg, tokens.surface),
    buttonFg: safe(tokens.buttonFg, tokens.text),
    buttonBorder: safe(tokens.buttonBorder, tokens.border),
    radiusSmall: tokens.radiusSmall || "6px",
    radiusMedium: tokens.radiusMedium || "10px",
    radiusLarge: tokens.radiusLarge || "15px",
    shadowColor: safe(tokens.shadowColor, "#000000"),
    headerBg: safe(tokens.headerBg, tokens.surface),
    sidebarBg: safe(tokens.sidebarBg, tokens.surface),
    footerBg: safe(tokens.footerBg, tokens.surface),
    fontFamily: tokens.fontFamily || 'Inter, "Helvetica Neue", Arial, sans-serif',
  };

  const pageGradient =
    t.pageBg.toLowerCase() === t.pageBgSecondary.toLowerCase()
      ? "none"
      : `linear-gradient(180deg, ${t.pageBg} 0%, ${t.pageBgSecondary} 100%)`;

  const lines: string[] = [
    `${THEME_VAR_PREFIX}page-bg: ${t.pageBg};`,
    `${THEME_VAR_PREFIX}page-bg-2: ${t.pageBgSecondary};`,
    `${THEME_VAR_PREFIX}page-gradient: ${pageGradient};`,
    `${THEME_VAR_PREFIX}surface: ${t.surface};`,
    `${THEME_VAR_PREFIX}surface-alt: ${t.surfaceAlt};`,
    `${THEME_VAR_PREFIX}surface-hover: ${t.surfaceHover};`,
    `${THEME_VAR_PREFIX}text: ${t.text};`,
    `${THEME_VAR_PREFIX}text-muted: ${t.textMuted};`,
    `${THEME_VAR_PREFIX}text-faint: ${t.textFaint};`,
    `${THEME_VAR_PREFIX}border: ${t.border};`,
    `${THEME_VAR_PREFIX}border-strong: ${t.borderStrong};`,
    `${THEME_VAR_PREFIX}primary: ${t.primary};`,
    `${THEME_VAR_PREFIX}primary-hover: ${t.primaryHover};`,
    `${THEME_VAR_PREFIX}primary-fg: ${t.primaryFg};`,
    `${THEME_VAR_PREFIX}secondary: ${t.secondary};`,
    `${THEME_VAR_PREFIX}accent: ${t.accent};`,
    `${THEME_VAR_PREFIX}success: ${t.success};`,
    `${THEME_VAR_PREFIX}warning: ${t.warning};`,
    `${THEME_VAR_PREFIX}danger: ${t.danger};`,
    `${THEME_VAR_PREFIX}info: ${t.info};`,
    `${THEME_VAR_PREFIX}btn-bg: ${t.buttonBg};`,
    `${THEME_VAR_PREFIX}btn-fg: ${t.buttonFg};`,
    `${THEME_VAR_PREFIX}btn-border: ${t.buttonBorder};`,
    `${THEME_VAR_PREFIX}radius-sm: ${t.radiusSmall};`,
    `${THEME_VAR_PREFIX}radius-md: ${t.radiusMedium};`,
    `${THEME_VAR_PREFIX}radius-lg: ${t.radiusLarge};`,
    `${THEME_VAR_PREFIX}shadow-color: ${t.shadowColor};`,
    `${THEME_VAR_PREFIX}header-bg: ${t.headerBg};`,
    `${THEME_VAR_PREFIX}sidebar-bg: ${t.sidebarBg};`,
    `${THEME_VAR_PREFIX}footer-bg: ${t.footerBg};`,
    `${THEME_VAR_PREFIX}font-family: ${t.fontFamily};`,
    /* derived helpers */
    `${THEME_VAR_PREFIX}primary-soft: ${toRgbString(withAlpha(parseColor(t.primary)!, 0.14))};`,
    `${THEME_VAR_PREFIX}primary-softer: ${toRgbString(withAlpha(parseColor(t.primary)!, 0.07))};`,
    `${THEME_VAR_PREFIX}secondary-soft: ${toRgbString(withAlpha(parseColor(t.secondary)!, 0.16))};`,
    `${THEME_VAR_PREFIX}link: ${t.primary};`,
    `${THEME_VAR_PREFIX}link-hover: ${t.primaryHover};`,
    `${THEME_VAR_PREFIX}shadow-1: ${shadow(t.shadowColor, 0.1)};`,
    `${THEME_VAR_PREFIX}shadow-2: ${shadow(t.shadowColor, 0.22)};`,
    `${THEME_VAR_PREFIX}shadow-3: ${shadow(t.shadowColor, 0.4)};`,
    `${THEME_VAR_PREFIX}focus-ring: ${toRgbString(withAlpha(parseColor(t.accent)!, 0.55))};`,
    `${THEME_VAR_PREFIX}selection-bg: ${toRgbString(withAlpha(parseColor(t.primary)!, 0.3))};`,
    `${THEME_VAR_PREFIX}danger-soft: ${toRgbString(withAlpha(parseColor(t.danger)!, 0.14))};`,
    `${THEME_VAR_PREFIX}success-soft: ${toRgbString(withAlpha(parseColor(t.success)!, 0.14))};`,
    `${THEME_VAR_PREFIX}hover-overlay: ${toRgbString(withAlpha(parseColor(t.text)!, 0.05))};`,
    /* space-separated channels: rgb(var(--rfs-x-rgb) / alpha) — enables
       translucent surfaces (glassmorphism) without color-mix() */
    `${THEME_VAR_PREFIX}surface-rgb: ${channelTriplet(t.surface)};`,
    `${THEME_VAR_PREFIX}surface-alt-rgb: ${channelTriplet(t.surfaceAlt)};`,
    `${THEME_VAR_PREFIX}header-rgb: ${channelTriplet(t.headerBg)};`,
    `${THEME_VAR_PREFIX}border-rgb: ${channelTriplet(t.border)};`,
    `${THEME_VAR_PREFIX}primary-rgb: ${channelTriplet(t.primary)};`,
    `${THEME_VAR_PREFIX}text-rgb: ${channelTriplet(t.text)};`,
    /* WCAG-corrected variants — swapped in by data-rfs-contrast-boost */
    `${THEME_VAR_PREFIX}text-muted-strong: ${ensureContrast(t.textMuted, t.surface, 4.5)};`,
    `${THEME_VAR_PREFIX}text-faint-strong: ${ensureContrast(t.textFaint, t.surface, 4.5)};`,
    `${THEME_VAR_PREFIX}border-strong-visible: ${ensureContrast(t.border, t.surface, 1.6)};`,
  ];

  return `:root {\n  ${lines.join("\n  ")}\n}\n`;
}

/** "27 27 31" — for rgb(var(--rfs-surface-rgb) / 0.5) syntax. */
function channelTriplet(color: string): string {
  const rgb = parseColor(color);
  if (!rgb) return "0 0 0";
  return `${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)}`;
}
