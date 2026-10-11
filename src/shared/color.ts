/**
 * Color math used by the theme engine, theme editor and AI heuristics.
 * Everything here is pure and dependency-free so it can run in a content
 * script, an extension page and Node tests alike.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  /** 0..1 */
  a: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
  a: number;
}

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX4 = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX8 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB_FN = /^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)(?:[\s,/]+([0-9.]+%?))?\s*\)$/i;
const HSL_FN = /^hsla?\(\s*([0-9.]+)(?:deg)?[\s,]+([0-9.]+)%[\s,]+([0-9.]+)%(?:[\s,/]+([0-9.]+%?))?\s*\)$/i;

/** Named colors we accept (small whitelist — keeps imported themes declarative). */
const NAMED: Record<string, string> = {
  transparent: "rgba(0,0,0,0)",
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  orange: "#ffa500",
  yellow: "#ffff00",
  purple: "#800080",
  pink: "#ffc0cb",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  navy: "#000080",
  teal: "#008080",
  crimson: "#dc143c",
};

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * CSS alpha: a bare number is 0–1 (`0.5`), a percentage is 0–100 (`50%`).
 * Spec: https://www.w3.org/TR/css-color-4/#rgb-functional-notations
 */
function parseAlpha(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const isPercent = raw.endsWith("%");
  const num = Number(isPercent ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(num)) return 1;
  return clamp(isPercent ? num / 100 : num, 0, 1);
}

function channel(v: number): number {
  return clamp(Math.round(v), 0, 255);
}

/**
 * Parse a CSS color string. Returns null for anything we do not understand —
 * this doubles as a security filter for imported/exported theme data.
 */
export function parseColor(input: string): Rgb | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase();
  if (value.length === 0 || value.length > 64) return null;

  const named = NAMED[value];
  if (named) return parseColor(named);

  let m = HEX3.exec(value);
  if (m) {
    return {
      r: parseInt(m[1]! + m[1]!, 16),
      g: parseInt(m[2]! + m[2]!, 16),
      b: parseInt(m[3]! + m[3]!, 16),
      a: 1,
    };
  }
  m = HEX4.exec(value);
  if (m) {
    return {
      r: parseInt(m[1]! + m[1]!, 16),
      g: parseInt(m[2]! + m[2]!, 16),
      b: parseInt(m[3]! + m[3]!, 16),
      a: parseInt(m[4]! + m[4]!, 16) / 255,
    };
  }
  m = HEX6.exec(value);
  if (m) {
    return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16), a: 1 };
  }
  m = HEX8.exec(value);
  if (m) {
    return {
      r: parseInt(m[1]!, 16),
      g: parseInt(m[2]!, 16),
      b: parseInt(m[3]!, 16),
      a: parseInt(m[4]!, 16) / 255,
    };
  }
  m = RGB_FN.exec(value);
  if (m) {
    return {
      r: clamp(Number(m[1]), 0, 255),
      g: clamp(Number(m[2]), 0, 255),
      b: clamp(Number(m[3]), 0, 255),
      a: parseAlpha(m[4]),
    };
  }
  m = HSL_FN.exec(value);
  if (m) {
    return hslToRgb({
      h: ((Number(m[1]) % 360) + 360) % 360,
      s: clamp(Number(m[2]), 0, 100) / 100,
      l: clamp(Number(m[3]), 0, 100) / 100,
      a: parseAlpha(m[4]),
    });
  }
  return null;
}

/** True when the string is a color this extension is willing to inject. */
export function isValidColor(input: string): boolean {
  return parseColor(input) !== null;
}

export function toHex(rgb: Rgb): string {
  const h = (v: number) => channel(v).toString(16).padStart(2, "0");
  const base = `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
  if (rgb.a >= 1) return base;
  return base + h(rgb.a * 255);
}

export function toRgbString(rgb: Rgb): string {
  if (rgb.a >= 1) return `rgb(${channel(rgb.r)}, ${channel(rgb.g)}, ${channel(rgb.b)})`;
  return `rgba(${channel(rgb.r)}, ${channel(rgb.g)}, ${channel(rgb.b)}, ${Number(rgb.a.toFixed(3))})`;
}

export function rgbToHsl(rgb: Rgb): Hsl {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      default:
        h = ((r - g) / d + 4) * 60;
    }
  }
  return { h, s, l, a: rgb.a };
}

export function hslToRgb(hsl: Hsl): Rgb {
  const { h, s, l } = hsl;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  return {
    r: (r1 + m) * 255,
    g: (g1 + m) * 255,
    b: (b1 + m) * 255,
    a: hsl.a,
  };
}

/** WCAG 2.1 relative luminance. */
export function luminance(rgb: Rgb): number {
  const f = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}

/** WCAG contrast ratio between two colors (1 … 21). Alpha is composited first. */
export function contrastRatio(a: Rgb | string, b: Rgb | string, backdrop?: Rgb): number {
  const ca = typeof a === "string" ? parseColor(a) : a;
  const cb = typeof b === "string" ? parseColor(b) : b;
  if (!ca || !cb) return 1;
  const bg = backdrop ?? { r: 255, g: 255, b: 255, a: 1 };
  const sa = composite(ca, bg);
  const sb = composite(cb, bg);
  const l1 = luminance(sa);
  const l2 = luminance(sb);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/** Porter-Duff "source over" for a color with alpha against an opaque backdrop. */
export function composite(src: Rgb, backdrop: Rgb): Rgb {
  if (src.a >= 1) return src;
  const ia = 1 - src.a;
  return {
    r: src.r * src.a + backdrop.r * ia,
    g: src.g * src.a + backdrop.g * ia,
    b: src.b * src.a + backdrop.b * ia,
    a: 1,
  };
}

export function mix(a: Rgb, b: Rgb, weightToB: number): Rgb {
  const t = clamp(weightToB, 0, 1);
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  };
}

export function withAlpha(rgb: Rgb, alpha: number): Rgb {
  return { ...rgb, a: clamp(alpha, 0, 1) };
}

/** Shift lightness by an absolute amount (−1 … +1), keeping hue/saturation. */
export function adjustLightness(rgb: Rgb, delta: number): Rgb {
  const hsl = rgbToHsl(rgb);
  hsl.l = clamp(hsl.l + delta, 0, 1);
  return hslToRgb(hsl);
}

export function adjustSaturation(rgb: Rgb, delta: number): Rgb {
  const hsl = rgbToHsl(rgb);
  hsl.s = clamp(hsl.s + delta, 0, 1);
  return hslToRgb(hsl);
}

export function lighten(rgb: Rgb | string, amount: number): string {
  const c = typeof rgb === "string" ? parseColor(rgb) : rgb;
  return c ? toHex(adjustLightness(c, amount)) : "#000000";
}

export function darken(rgb: Rgb | string, amount: number): string {
  return lighten(rgb, -amount);
}

/** Mix two colors as a CSS string — handy for hover/active derivation. */
export function mixHex(a: string, b: string, weightToB: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a;
  return toHex(mix(ca, cb, weightToB));
}

export type Harmony = "complementary" | "analogous" | "triadic" | "split" | "monochrome";

/** Rotate hue and rebalance saturation/lightness for a harmonious secondary. */
export function deriveHarmony(base: string, harmony: Harmony, role: "secondary" | "accent"): string | null {
  const rgb = parseColor(base);
  if (!rgb) return null;
  const hsl = rgbToHsl(rgb);
  const offset = role === "secondary" ? 180 : 150;
  const next: Hsl = { ...hsl };
  switch (harmony) {
    case "complementary":
      next.h = (hsl.h + (role === "secondary" ? 180 : 165)) % 360;
      break;
    case "analogous":
      next.h = (hsl.h + (role === "secondary" ? 30 : 330)) % 360;
      break;
    case "triadic":
      next.h = (hsl.h + offset) % 360;
      break;
    case "split":
      next.h = (hsl.h + (role === "secondary" ? 150 : 210)) % 360;
      break;
    case "monochrome":
      next.h = hsl.h;
      next.s = clamp(role === "secondary" ? hsl.s * 0.6 : hsl.s * 1.1, 0.05, 1);
      break;
  }
  if (harmony !== "monochrome") {
    next.s = clamp(hsl.s * 0.85 + 0.1, 0.35, 0.95);
    next.l = role === "secondary" ? clamp(hsl.l, 0.4, 0.65) : clamp(hsl.l + 0.08, 0.45, 0.7);
  } else {
    next.l = role === "secondary" ? clamp(hsl.l + 0.15, 0.4, 0.7) : clamp(hsl.l - 0.12, 0.25, 0.6);
  }
  return toHex(hslToRgb(next));
}

/**
 * Nudge a color's lightness until it reaches `minRatio` contrast against `against`.
 * Used by the editor validation and the AI accessibility checker/fixer.
 */
export function ensureContrast(target: string, against: string, minRatio: number): string {
  const t = parseColor(target);
  const a = parseColor(against);
  if (!t || !a) return target;
  const opaque = composite(a, { r: 255, g: 255, b: 255, a: 1 });
  if (contrastRatio(t, opaque) >= minRatio) return toHex(t);
  const hsl = rgbToHsl(t);
  const ref = luminance(opaque);
  // Preferred direction first (lighten on dark backdrops, darken on light
  // ones); if it cannot reach the ratio — e.g. midtone backdrops where only
  // the opposite direction works — fall back to searching the other one.
  const direction = ref > 0.4 ? -1 : 1;
  for (const dir of [direction, -direction as -1 | 1]) {
    for (let i = 1; i <= 60; i++) {
      const step = dir * (i / 60) * (dir < 0 ? hsl.l : 1 - hsl.l);
      const candidate = hslToRgb({ ...hsl, l: clamp(hsl.l + step, 0, 1) });
      // Verify the rounded hex — the float candidate can pass while the
      // 8-bit color it rounds to falls a fraction short of the ratio.
      const hex = toHex(candidate);
      if (contrastRatio(hex, opaque) >= minRatio) return hex;
    }
  }
  return direction < 0 ? "#000000" : "#ffffff";
}

/** WCAG rating label for UI display. */
export function contrastGrade(ratio: number): "fail" | "AA-large" | "AA" | "AAA" {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA-large";
  return "fail";
}

/** Perceptual distance (cheap RGB euclid) — used for "too similar" warnings. */
export function colorDistance(a: string, b: string): number {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return 0;
  return Math.sqrt((ca.r - cb.r) ** 2 + (ca.g - cb.g) ** 2 + (ca.b - cb.b) ** 2);
}
