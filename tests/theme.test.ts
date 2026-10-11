// @ts-ignore — node:test has no bundled types (@types/node is not a project dependency)
import { test } from "node:test";
// @ts-ignore — node:assert/strict has no bundled types (@types/node is not a project dependency)
import assert from "node:assert/strict";
import { compileThemeVariables } from "../src/theme/compile";
import { sanitizeTokens, sanitizeTheme, DEFAULT_THEME_TOKENS } from "../src/theme/validate";
import { TOKEN_COLOR_FIELDS, type ThemeTokens, type ThemeCategory } from "../src/types/theme";
import { parseColor, contrastRatio } from "../src/shared/color";
import { BUILTIN_THEMES } from "../src/theme/library";

/** Minimal node:test context (project has no @types/node for subtests). */
interface TestCtx {
  test(name: string, fn: () => void): void;
}

/* ----------------------------- compiler ------------------------------ */

const EXPECTED_TOKENS = [
  // base colors
  "--rfs-page-bg", "--rfs-page-bg-2", "--rfs-page-gradient", "--rfs-surface",
  "--rfs-surface-alt", "--rfs-surface-hover", "--rfs-text", "--rfs-text-muted",
  "--rfs-text-faint", "--rfs-border", "--rfs-border-strong", "--rfs-primary",
  "--rfs-primary-hover", "--rfs-primary-fg", "--rfs-secondary", "--rfs-accent",
  "--rfs-success", "--rfs-warning", "--rfs-danger", "--rfs-info",
  "--rfs-btn-bg", "--rfs-btn-fg", "--rfs-btn-border", "--rfs-shadow-color",
  "--rfs-header-bg", "--rfs-sidebar-bg", "--rfs-footer-bg", "--rfs-font-family",
  "--rfs-radius-sm", "--rfs-radius-md", "--rfs-radius-lg",
  // derived
  "--rfs-primary-soft", "--rfs-primary-softer", "--rfs-secondary-soft", "--rfs-link",
  "--rfs-link-hover", "--rfs-shadow-1", "--rfs-shadow-2", "--rfs-shadow-3",
  "--rfs-focus-ring", "--rfs-selection-bg", "--rfs-danger-soft", "--rfs-success-soft",
  "--rfs-hover-overlay",
  // channel triplets
  "--rfs-surface-rgb", "--rfs-surface-alt-rgb", "--rfs-header-rgb", "--rfs-border-rgb",
  "--rfs-primary-rgb", "--rfs-text-rgb",
  // contrast-corrected
  "--rfs-text-muted-strong", "--rfs-text-faint-strong", "--rfs-border-strong-visible",
];

test("compileThemeVariables: emits every --rfs- token", () => {
  const css = compileThemeVariables(DEFAULT_THEME_TOKENS);
  for (const token of EXPECTED_TOKENS) {
    assert.ok(css.includes(`${token}:`), `missing ${token}`);
  }
  assert.ok(EXPECTED_TOKENS.length >= 15);
});

test("compileThemeVariables: output is valid-looking CSS", () => {
  const css = compileThemeVariables(DEFAULT_THEME_TOKENS);
  assert.ok(css.startsWith(":root {"));
  assert.equal((css.match(/{/g) ?? []).length, (css.match(/}/g) ?? []).length, "unbalanced braces");
  assert.ok(!css.includes("undefined"), "contains 'undefined'");
  assert.ok(!css.includes("NaN"), "contains 'NaN'");
  assert.ok(!css.includes("null"), "contains 'null'");
});

test("compileThemeVariables: an empty token bag still compiles cleanly", () => {
  const css = compileThemeVariables({} as unknown as ThemeTokens);
  assert.ok(css.startsWith(":root {"));
  assert.ok(!css.includes("undefined"));
  assert.ok(!css.includes("NaN"));
  assert.equal((css.match(/{/g) ?? []).length, (css.match(/}/g) ?? []).length);
});

/* ---------------------------- sanitizeTokens -------------------------- */

test("sanitizeTokens: repairs a partial bag — valid kept, invalid fallen back", () => {
  const out = sanitizeTokens({
    primary: "#ff0000",
    text: "#eeeeee",
    surface: "garbage", // invalid -> fallback
    radiusSmall: "8px", // valid radius
    fontFamily: "url(x)", // invalid font stack -> fallback
  });
  if (!out) throw new Error("sanitizeTokens returned null");
  assert.equal(out.primary, "#ff0000");
  assert.equal(out.text, "#eeeeee");
  assert.equal(out.surface, DEFAULT_THEME_TOKENS.surface);
  assert.equal(out.radiusSmall, "8px");
  assert.equal(out.fontFamily, DEFAULT_THEME_TOKENS.fontFamily);
  assert.equal(out.pageBg, DEFAULT_THEME_TOKENS.pageBg); // untouched fields fall back
});

test("sanitizeTokens: returns null when fewer than half the colors are valid", () => {
  assert.equal(sanitizeTokens({ primary: "nope", text: "nope", surface: "nope", border: "#ffffff" }), null);
  assert.equal(sanitizeTokens(null), null);
  assert.equal(sanitizeTokens("garbage"), null);
  assert.equal(sanitizeTokens([]), null);
});

test("sanitizeTokens: the full default bag roundtrips unchanged", () => {
  assert.deepEqual(sanitizeTokens({ ...DEFAULT_THEME_TOKENS }), DEFAULT_THEME_TOKENS);
});

/* ----------------------------- sanitizeTheme -------------------------- */

test("sanitizeTheme: rejects bad ids and names", () => {
  assert.equal(sanitizeTheme(null), null);
  assert.equal(sanitizeTheme({ id: "bad id!", name: "X" }), null); // id is not a slug
  assert.equal(sanitizeTheme({ id: "", name: "X" }), null);
  assert.equal(sanitizeTheme({ id: "ok-id", name: "" }), null); // empty name
  assert.equal(sanitizeTheme({ id: "ok-id", name: "\u0001\u0002" }), null); // only control chars
});

test("sanitizeTheme: accepts a valid theme, normalizes id/category/mode", () => {
  const out = sanitizeTheme({
    id: "My-Theme",
    name: "Тёмная",
    description: "hello",
    category: "kryptonite", // unknown -> dark
    mode: "blue", // unknown -> dark
    tokens: { primary: "#ff0000" },
  });
  if (!out) throw new Error("sanitizeTheme returned null");
  assert.equal(out.id, "my-theme"); // lowercased slug
  assert.equal(out.name, "Тёмная");
  assert.equal(out.description, "hello");
  assert.equal(out.category, "dark");
  assert.equal(out.mode, "dark");
  assert.equal(out.tokens.primary, "#ff0000");
});

/* --------------------------- default tokens --------------------------- */

test("DEFAULT_THEME_TOKENS: every color token exists and parses", () => {
  for (const field of TOKEN_COLOR_FIELDS) {
    const value = DEFAULT_THEME_TOKENS[field];
    assert.ok(typeof value === "string" && parseColor(value), `${field} missing/unparseable: ${String(value)}`);
  }
  for (const field of ["radiusSmall", "radiusMedium", "radiusLarge"] as const) {
    assert.match(DEFAULT_THEME_TOKENS[field], /^\d+px$/);
  }
  assert.ok(DEFAULT_THEME_TOKENS.fontFamily.length > 0);
});

/* --------------------------- builtin catalog -------------------------- */

test("BUILTIN_THEMES: catalog integrity", (t: TestCtx) => {
  t.test("at least 100 themes with unique slug ids", () => {
    assert.ok(BUILTIN_THEMES.length >= 100, `only ${BUILTIN_THEMES.length} builtin themes`);
    const ids = new Set<string>();
    for (const theme of BUILTIN_THEMES) {
      assert.match(theme.id, /^[a-z0-9-]+$/, `bad id: ${theme.id}`);
      assert.ok(!ids.has(theme.id), `duplicate id: ${theme.id}`);
      ids.add(theme.id);
    }
  });

  t.test("starts with rodina-eclipse and covers all categories", () => {
    assert.equal(BUILTIN_THEMES[0]?.id, "rodina-eclipse");
    const categories = new Set<ThemeCategory>(BUILTIN_THEMES.map((theme) => theme.category));
    const expected: ThemeCategory[] = ["dark", "light", "neon", "pastel", "minimal", "retro", "nature", "fantasy"];
    for (const category of expected) {
      assert.ok(categories.has(category), `missing category: ${category}`);
    }
  });

  t.test("every theme has complete parseable tokens and >= 4.5 text/surface contrast", () => {
    const failures: string[] = [];
    for (const theme of BUILTIN_THEMES) {
      for (const field of TOKEN_COLOR_FIELDS) {
        const value = theme.tokens[field];
        if (typeof value !== "string" || !parseColor(value)) {
          failures.push(`${theme.id}.${field}: unparseable (${String(value)})`);
        }
      }
      const ratio = contrastRatio(theme.tokens.text, theme.tokens.surface);
      if (!(ratio >= 4.5)) failures.push(`${theme.id}: text/surface contrast ${ratio.toFixed(2)} < 4.5`);
    }
    assert.deepEqual(failures, [], `theme failures:\n${failures.join("\n")}`);
  });
});
