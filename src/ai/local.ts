/**
 * Local heuristic theme engine.
 *
 * HONEST LABELING: this is NOT artificial intelligence. It is a deterministic
 * keyword → palette heuristic that runs entirely offline. The UI must always
 * describe it as "локальная эвристика (без ИИ)" — see ai.providerLocal.
 *
 * Determinism: the same prompt always produces the same tokens (tests rely
 * on this), so regeneration is reproducible without any stored state.
 */
import type { ThemeTokens } from "../types/theme";
import { DEFAULT_THEME_TOKENS } from "../theme/validate";
import {
  contrastRatio,
  contrastGrade,
  deriveHarmony,
  ensureContrast,
  hslToRgb,
  lighten,
  darken,
  luminance,
  mixHex,
  parseColor,
  toHex,
} from "../shared/color";

export interface ContrastIssue {
  label: string;
  ratio: number;
  grade: string;
  suggestion?: string;
}

/** Build a hex color from HSL (wraps hue into 0–360, clamps the rest). */
function hslHex(hue: number, sat: number, light: number): string {
  return toHex(hslToRgb({
    h: ((hue % 360) + 360) % 360,
    s: Math.min(100, Math.max(0, sat)) / 100,
    l: Math.min(100, Math.max(0, light)) / 100,
    a: 1,
  }));
}

interface PromptTraits {
  dark: boolean;
  hue: number;
  sat: number;
  lightness: number;
  radius: string;
  neon: boolean;
  pastel: boolean;
}

const HUE_KEYWORDS: Array<{ words: string[]; hue: number }> = [
  { words: ["красн", "алы", "червон", "crimson", "red"], hue: 352 },
  { words: ["оранж", "жёлт", "желт", "янтар", "orange", "yellow"], hue: 32 },
  { words: ["изумруд", "зелен", "зелён", "лес", "emerald", "green"], hue: 148 },
  { words: ["бирюз", "циан", "акв", "turquoise", "cyan", "aqua"], hue: 178 },
  { words: ["син", "лазур", "oceаn", "ocean", "blue"], hue: 214 },
  { words: ["фиолет", "лаванд", "пурпур", "violet", "purple"], hue: 275 },
  { words: ["розов", "малин", "coral", "pink"], hue: 332 },
  { words: ["золот", "медieval", "gold"], hue: 44 },
  { words: ["серебр", "монохром", "графит", "silver", "mono"], hue: 220 },
];

const DARK_WORDS = ["тёмн", "темн", "ноч", "космос", "нуар", "dark", "night", "space", "глубин", "графит"];
const LIGHT_WORDS = ["светл", "дневн", "утр", "бел", "летн", "light", "day", "morning", "paper", "бумаг"];
const NEON_WORDS = ["неон", "кибер", "вейпор", "светящ", "neon", "cyber", "glow", " rave", "рейв"];
const PASTEL_WORDS = ["пастель", "мягк", "нежн", "pastel", "soft", "мечт", "дымк"];

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

/** Derive prompt traits (deterministic). */
export function describePrompt(prompt: string): PromptTraits {
  const text = ` ${prompt.toLowerCase().trim()} `;
  const neon = includesAny(text, NEON_WORDS);
  const pastel = includesAny(text, PASTEL_WORDS);
  const light = includesAny(text, LIGHT_WORDS);
  const dark = includesAny(text, DARK_WORDS);

  let hue = 345; // brand crimson — the Rodina default when nothing matches
  for (const entry of HUE_KEYWORDS) {
    if (includesAny(text, entry.words)) {
      hue = entry.hue;
      break;
    }
  }

  const baseDark = dark || !light;
  let sat = neon ? 92 : pastel ? 48 : 68;
  let lightness = baseDark ? 52 : 62;
  if (pastel && baseDark) lightness = 58;
  if (neon && baseDark) lightness = 56;

  const radius = includesAny(text, ["angular", "остр", "квадрат", "straight"]) ? "2px"
    : neon || includesAny(text, ["tech", "техн"]) ? "6px"
    : pastel || includesAny(text, ["мягк", "уют", "soft", "cozy"]) ? "18px"
    : "12px";

  return { dark: baseDark, hue, sat, lightness, radius, neon, pastel };
}

/**
 * Generate a full token set from a free-form description.
 * Pure and deterministic — no randomness, no network.
 */
export function generateThemeFromPrompt(prompt: string): ThemeTokens {
  const traits = describePrompt(prompt);
  const { hue, sat, dark, neon, pastel, radius } = traits;
  const base = dark
    ? hslHex(hue, Math.min(sat, 30), 9)
    : hslHex(hue, Math.min(sat, 34), 95);
  const base2 = dark
    ? hslHex(hue, Math.min(sat, 36), 13)
    : hslHex(hue, Math.min(sat, 38), 91);

  const surface = dark
    ? hslHex(hue, Math.min(sat, 32), 16)
    : hslHex(hue, Math.min(sat, 34), 97);
  const surfaceAlt = dark ? hslHex(hue, Math.min(sat, 34), 21) : hslHex(hue, Math.min(sat, 34), 93);
  const surfaceHover = dark ? hslHex(hue, Math.min(sat, 36), 26) : hslHex(hue, Math.min(sat, 36), 89);

  const primary = hslHex(hue, neon ? 100 : pastel ? 66 : 84, dark ? 58 : 50);
  const primaryHover = lighten(primary, dark ? 0.12 : 0.08);
  const secondaryHue = hue + (neon ? 46 : 150);
  const secondary = hslHex(secondaryHue, neon ? 96 : 70, dark ? 62 : 52);
  const accent = hslHex(hue - (neon ? 40 : 60), neon ? 100 : 78, dark ? 66 : 52);

  const text = dark ? "#ececf1" : "#17181d";
  const textMuted = dark ? "#a8aab4" : "#5b5e6b";
  const textFaint = dark ? "#767986" : "#838696";
  const border = dark ? hslHex(hue, 22, 27) : hslHex(hue, 24, 84);
  const borderStrong = dark ? hslHex(hue, 24, 36) : hslHex(hue, 26, 74);

  return {
    pageBg: base,
    pageBgSecondary: base2,
    surface,
    surfaceAlt,
    surfaceHover,
    text,
    textMuted,
    textFaint,
    border,
    borderStrong,
    primary,
    primaryHover,
    primaryFg: luminance(parseColor(primary) ?? { r: 0, g: 0, b: 0, a: 1 }) > 0.4 ? "#141418" : "#ffffff",
    secondary,
    accent,
    success: dark ? "#31c46c" : "#1f9d55",
    warning: dark ? "#f0a533" : "#c07a12",
    danger: dark ? "#ef4d5e" : "#d33b4c",
    info: dark ? "#4c93f5" : "#2563eb",
    buttonBg: surfaceAlt,
    buttonFg: text,
    buttonBorder: border,
    radiusSmall: radius === "2px" ? "2px" : radius === "18px" ? "8px" : "6px",
    radiusMedium: radius,
    radiusLarge: radius === "2px" ? "3px" : radius === "18px" ? "22px" : "15px",
    shadowColor: dark ? "#000000" : "#28304a",
    headerBg: dark ? hslHex(hue, 26, 11) : hslHex(hue, 30, 97),
    sidebarBg: surface,
    footerBg: dark ? hslHex(hue, 22, 8) : hslHex(hue, 24, 94),
    fontFamily: DEFAULT_THEME_TOKENS.fontFamily,
  };
}

/** Derive a matching secondary accent from a base color (color assistant). */
export function harmonizeFromBase(baseColor: string): { accent: string; secondary: string; tertiary: string } | null {
  const clean = parseColor(baseColor);
  if (!clean) return null;
  const accent = toHex(clean);
  const secondary = deriveHarmony(accent, "analogous", "secondary") ?? darken(accent, 0.25);
  const tertiary = deriveHarmony(accent, "triadic", "accent") ?? lighten(accent, 0.3);
  return { accent, secondary, tertiary };
}

/** WCAG pairs that fail 4.5:1 in a token set (accessibility check). */
export function analyzeContrast(tokens: ThemeTokens): ContrastIssue[] {
  const pairs: Array<{ label: string; fg: string; bg: string; min: number }> = [
    { label: "Текст / карточка", fg: tokens.text, bg: tokens.surface, min: 4.5 },
    { label: "Текст / фон страницы", fg: tokens.text, bg: tokens.pageBg, min: 4.5 },
    { label: "Вторичный текст / карточка", fg: tokens.textMuted, bg: tokens.surface, min: 4.5 },
    { label: "Текст на кнопке", fg: tokens.primaryFg, bg: tokens.primary, min: 4.5 },
    { label: "Текст на второй кнопке", fg: tokens.buttonFg, bg: tokens.buttonBg, min: 4.5 },
    { label: "Ссылки / карточка", fg: tokens.primary, bg: tokens.surface, min: 4.5 },
  ];
  const issues: ContrastIssue[] = [];
  for (const pair of pairs) {
    const ratio = contrastRatio(pair.fg, pair.bg);
    if (ratio < pair.min) {
      issues.push({ label: pair.label, ratio, grade: contrastGrade(ratio) });
    }
  }
  return issues;
}

/** Nudge failing colors until each pair reaches AA (4.5:1). */
export function suggestImprovements(tokens: ThemeTokens): ThemeTokens {
  const next: ThemeTokens = { ...tokens };
  // Order matters: primary is moved first, then its foreground is fitted to
  // the final primary — otherwise a later primary shift can break the pair.
  next.primary = ensureContrast(next.primary, next.surface, 4.5);
  next.primaryFg = ensureContrast(next.primaryFg, next.primary, 4.5);
  next.buttonFg = ensureContrast(next.buttonFg, next.buttonBg, 4.5);
  next.text = ensureContrast(next.text, next.surface, 4.5);
  next.text = ensureContrast(next.text, next.pageBg, 4.5);
  next.textMuted = ensureContrast(next.textMuted, next.surface, 4.5);
  if (next.text === next.textMuted) {
    next.textMuted = ensureContrast(mixHex(next.text, next.pageBg, 0.5), next.surface, 4.5);
  }
  return next;
}
