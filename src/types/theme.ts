/**
 * Theme data model.
 *
 * A theme is a *declarative* set of design tokens. The theme engine compiles
 * tokens into CSS custom properties; nothing here is executable, which keeps
 * import/export and AI-generated themes safe by construction.
 */

export type ThemeMode = "dark" | "light";

export type ThemeCategory =
  | "dark"
  | "light"
  | "neon"
  | "pastel"
  | "minimal"
  | "retro"
  | "nature"
  | "fantasy"
  | "arizona";

export interface ThemeTokens {
  /* --- surfaces --- */
  /** Main page background (html). */
  pageBg: string;
  /** Second color of the page background gradient (may equal pageBg). */
  pageBgSecondary: string;
  /** Cards, blocks, posts. */
  surface: string;
  /** Secondary panels, table stripes, code blocks. */
  surfaceAlt: string;
  /** Hover state for interactive cards/rows. */
  surfaceHover: string;

  /* --- text --- */
  text: string;
  /** Secondary text: timestamps, meta, descriptions. */
  textMuted: string;
  /** Weakest text: footer, disabled. */
  textFaint: string;

  /* --- lines --- */
  border: string;
  /** Stronger divider used on hover/focus. */
  borderStrong: string;

  /* --- brand --- */
  /** Links, primary buttons, active states. */
  primary: string;
  primaryHover: string;
  /** Text/icon color placed on top of `primary`. */
  primaryFg: string;
  /** Second accent: badges, highlights, gradients. */
  secondary: string;
  /** Small pop accents: labels, sparkles, focus rings. */
  accent: string;

  /* --- semantic --- */
  success: string;
  warning: string;
  danger: string;
  info: string;

  /* --- buttons --- */
  buttonBg: string;
  buttonFg: string;
  buttonBorder: string;

  /* --- shape & elevation --- */
  radiusSmall: string;
  radiusMedium: string;
  radiusLarge: string;
  /** rgba() base for box shadows; alpha is applied per component. */
  shadowColor: string;

  /* --- chrome --- */
  headerBg: string;
  sidebarBg: string;
  footerBg: string;

  /* --- typography --- */
  /** CSS font stack. */
  fontFamily: string;
}

export const TOKEN_COLOR_FIELDS = [
  "pageBg",
  "pageBgSecondary",
  "surface",
  "surfaceAlt",
  "surfaceHover",
  "text",
  "textMuted",
  "textFaint",
  "border",
  "borderStrong",
  "primary",
  "primaryHover",
  "primaryFg",
  "secondary",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
  "buttonBg",
  "buttonFg",
  "buttonBorder",
  "shadowColor",
  "headerBg",
  "sidebarBg",
  "footerBg",
] as const satisfies readonly (keyof ThemeTokens)[];

export const TOKEN_LENGTH_FIELDS = [
  "radiusSmall",
  "radiusMedium",
  "radiusLarge",
  "fontFamily",
] as const satisfies readonly (keyof ThemeTokens)[];

export type ThemeColorField = (typeof TOKEN_COLOR_FIELDS)[number];

export interface ThemeDefinition {
  /** Stable slug id ("cosmic-violet"). */
  id: string;
  name: string;
  description: string;
  category: ThemeCategory;
  mode: ThemeMode;
  tokens: ThemeTokens;
}

/** A theme saved by the user (same shape + audit metadata). */
export interface CustomTheme extends ThemeDefinition {
  createdAt: number;
  updatedAt: number;
  /** Optional id of the built-in theme this was derived from. */
  basedOn?: string;
}

export const THEME_CATEGORIES: readonly ThemeCategory[] = [
  "dark",
  "light",
  "neon",
  "pastel",
  "minimal",
  "retro",
  "nature",
  "fantasy",
  "arizona",
];

export const DEFAULT_FONT_STACK = 'Inter, "Helvetica Neue", Arial, sans-serif';
