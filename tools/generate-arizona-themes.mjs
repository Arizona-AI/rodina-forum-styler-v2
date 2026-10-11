/**
 * One-off generator: Arizona Forum Styler popup.js PRESETS -> Rodina theme
 * definitions written to src/theme/library/arizona.ts.
 *
 * Arizona presets carry 6 values (bg / block / accent1 / accent2 / text,
 * radius / font / mode); this tool expands them into complete ThemeTokens
 * using the same color math the extension ships (src/shared/color.ts), so
 * every generated theme satisfies the catalog invariants (parseable hex,
 * >= 4.5 text/surface contrast).
 *
 * Usage:
 *   node tools/generate-arizona-themes.mjs [path/to/popup.js]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = process.argv[2] ?? "C:/Users/dadod/Downloads/popup.js";
const outPath = join(root, "src", "theme", "library", "arizona.ts");

/* --- reuse the runtime color math (no duplicate implementations) ------- */
const tmp = join(root, ".tmp-color.mjs");
await build({
  entryPoints: [join(root, "src", "shared", "color.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: tmp,
});
const { lighten, darken, mixHex, ensureContrast, contrastRatio } = await import(`file://${tmp}`);

/* --- read Arizona presets ---------------------------------------------- */
const popupSrc = readFileSync(sourcePath, "utf8");
const match = popupSrc.match(/const PRESETS = \{[\s\S]*?\n\};/);
if (!match) throw new Error(`PRESETS block not found in ${sourcePath}`);
// Evaluate the JS object literal as-is (keys are unquoted in the source).
const PRESETS = new Function(`return ${match[0].replace("const PRESETS = ", "").replace(/;$/, "")}`)();

/* --- mapping ------------------------------------------------------------ */
const FONT_FALLBACK = 'Inter, "Helvetica Neue", Arial, sans-serif';

function fontFamilyOf(font) {
  const first = (String(font).split(",")[0] ?? "").replace(/['"]/g, "").trim();
  if (!first || first === "system-ui") return FONT_FALLBACK;
  if (/mono/i.test(first)) return `'${first}', ui-monospace, monospace`;
  if (/serif/i.test(font)) return `'${first}', Georgia, serif`;
  if (/cursive/i.test(font)) return `'${first}', "Trebuchet MS", sans-serif`;
  return `'${first}', ${FONT_FALLBACK}`;
}

function toTokens(p) {
  const dark = p.mode === "dark";
  const { bg, block, accent1: a1, accent2: a2, text: rawText, radius } = p;
  const text = ensureContrast(rawText, block, 4.5);
  const textMuted = ensureContrast(mixHex(text, block, 0.45), block, 4.5);
  const textFaint = ensureContrast(mixHex(textMuted, block, 0.35), block, 3);
  const buttonBg = mixHex(block, a1, 0.16);
  return {
    pageBg: bg,
    pageBgSecondary: lighten(bg, dark ? 0.03 : -0.03),
    surface: block,
    surfaceAlt: lighten(block, dark ? 0.03 : -0.03),
    surfaceHover: lighten(block, dark ? 0.06 : -0.05),
    text,
    textMuted,
    textFaint,
    border: mixHex(block, text, dark ? 0.12 : 0.15),
    borderStrong: mixHex(block, text, dark ? 0.22 : 0.3),
    primary: a1,
    primaryHover: lighten(a1, dark ? 0.1 : -0.1),
    primaryFg: contrastRatio("#ffffff", a1) >= contrastRatio("#141414", a1) ? "#ffffff" : "#141414",
    secondary: a2,
    accent: dark ? lighten(a2, 0.12) : darken(a2, 0.08),
    success: "#22c55e",
    warning: "#f59e0b",
    danger: "#ef4444",
    info: "#3b82f6",
    buttonBg,
    buttonFg: ensureContrast(text, buttonBg, 4.5),
    buttonBorder: mixHex(block, a1, 0.32),
    radiusSmall: `${radius}px`,
    radiusMedium: `${radius + 4}px`,
    radiusLarge: `${radius + 8}px`,
    shadowColor: dark ? "#000000" : "#2a2a35",
    headerBg: mixHex(bg, block, 0.6),
    sidebarBg: block,
    footerBg: mixHex(bg, block, 0.3),
    fontFamily: fontFamilyOf(p.font),
  };
}

const slug = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* --- emit --------------------------------------------------------------- */
const seen = new Set();
const entries = [];
for (const [key, p] of Object.entries(PRESETS)) {
  let id = `az-${slug(p.name || key)}`;
  if (!id || id === "az-") id = `az-${slug(key)}`;
  while (seen.has(id)) id += "-x";
  seen.add(id);
  const font = fontFamilyOf(p.font).split(",")[0].replace(/'/g, "").trim();
  entries.push({
    id,
    name: p.name || key,
    description: `Пресет Arizona Forum Styler: радиус ${p.radius}px, шрифт ${font}.`,
    category: "arizona",
    mode: p.mode === "light" ? "light" : "dark",
    tokens: toTokens(p),
  });
}

const tokenOrder = [
  "pageBg", "pageBgSecondary", "surface", "surfaceAlt", "surfaceHover",
  "text", "textMuted", "textFaint", "border", "borderStrong",
  "primary", "primaryHover", "primaryFg", "secondary", "accent",
  "success", "warning", "danger", "info",
  "buttonBg", "buttonFg", "buttonBorder",
  "radiusSmall", "radiusMedium", "radiusLarge", "shadowColor",
  "headerBg", "sidebarBg", "footerBg", "fontFamily",
];

const body = entries
  .map(
    (t) => `  {
    id: ${JSON.stringify(t.id)},
    name: ${JSON.stringify(t.name)},
    description: ${JSON.stringify(t.description)},
    category: "arizona",
    mode: ${JSON.stringify(t.mode)},
    tokens: {
${tokenOrder.map((k) => `      ${k}: ${JSON.stringify(t.tokens[k])},`).join("\n")}
    },
  },`,
  )
  .join("\n");

const output = `/**
 * Arizona Forum Styler preset themes (GENERATED — do not edit by hand).
 *
 * Source: PRESETS of Arizona Forum Styler v1.9.1 (popup.js) — each preset
 * carries bg / block / accent1 / accent2 / text / radius / font / mode and
 * is expanded here into a complete ThemeTokens set with the project's own
 * color math (src/shared/color.ts). Regenerate with:
 *
 *   node tools/generate-arizona-themes.mjs <path/to/popup.js>
 */
import type { ThemeDefinition } from "../../types/theme";

export const ARIZONA_THEMES: ThemeDefinition[] = [
${body}
];
`;

writeFileSync(outPath, output, "utf8");
console.log(`wrote ${entries.length} Arizona themes -> ${outPath}`);
