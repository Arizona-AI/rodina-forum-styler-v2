/**
 * Security-oriented validators for anything that reaches the DOM or storage
 * from user input, imports, or AI responses. Themes are declarative data --
 * these helpers guarantee no executable content can ride along.
 */
import { isValidColor } from "./color";

export const MAX_TEXT_LENGTH = 200;
export const MAX_URL_LENGTH = 2048;
export const MAX_THEME_JSON_LENGTH = 64 * 1024;
export const MAX_IMPORT_LENGTH = 512 * 1024;

/** Strip C0/C1 control characters and clamp length from untrusted text. */
export function sanitizeText(input: unknown, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof input !== "string") return "";
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    if (!isControl) out += ch;
    if (out.length > maxLength * 4) break;
  }
  out = out.trim();
  return out.length > maxLength ? out.slice(0, maxLength) : out;
}

/** Single-line text without line breaks (names, labels). */
export function sanitizeLabel(input: unknown, maxLength = 80): string {
  return sanitizeText(input, maxLength)
    .replace(/\r/g, " ")
    .replace(/\n/g, " ");
}

/**
 * Accept only absolute http(s) URLs (or small embedded data:image assets).
 * Rejects javascript:, vbscript:, file:, data:text/html and relative URLs.
 */
export function sanitizeUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (value.length === 0 || value.length > MAX_URL_LENGTH) return null;
  if (value.startsWith("data:image/")) {
    // svg data URLs can carry script - never accept them.
    if (!/^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=]+$/i.test(value)) return null;
    return value;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Font family names: letters, digits, spaces, hyphens, underscores only. */
export function sanitizeFontFamily(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (value.length === 0 || value.length > 60) return null;
  if (!/^[a-zA-Z0-9 _-]+$/.test(value)) return null;
  return value;
}

/** Validate a color and return the trimmed original string, or null. */
export function sanitizeColor(input: unknown): string | null {
  if (typeof input !== "string") return null;
  if (!isValidColor(input)) return null;
  return input.trim();
}

/**
 * Validate a CSS background gradient we are willing to inject.
 * Accepts linear-gradient(...) / radial-gradient(...) with only color
 * stops (colors, percentages, deg) - no url(), no var(), no semicolons.
 */
export function sanitizeGradient(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (value.length === 0 || value.length > 500) return null;
  if (!/^(linear|radial)-gradient\(/i.test(value)) return null;
  if (/url\s*\(|var\s*\(|expression|@|;|javascript/i.test(value)) return null;
  if (!/^[-#(),.\s%a-z0-9]+$/i.test(value)) return null;
  return value;
}

/** Theme ids: slug format. */
export function sanitizeId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase();
  if (value.length === 0 || value.length > 64) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) return null;
  return value;
}

/** True when a value is a plain object (not array, not null). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Run the color validator over every color-bearing field of a raw payload.
 * Returns the list of failed field names -- used by import validation.
 */
export function findInvalidColors(payload: Record<string, unknown>, fields: string[]): string[] {
  const bad: string[] = [];
  for (const field of fields) {
    const value = payload[field];
    if (value !== undefined && !sanitizeColor(value)) bad.push(field);
  }
  return bad;
}
