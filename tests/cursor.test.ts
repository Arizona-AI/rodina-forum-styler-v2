// @ts-ignore — node:test has no bundled types (@types/node is not a project dependency)
import { test } from "node:test";
// @ts-ignore — node:assert/strict has no bundled types (@types/node is not a project dependency)
import assert from "node:assert/strict";
import { cursorModule } from "../src/content/modules/cursor";
import { DEFAULT_SETTINGS } from "../src/settings/defaults";
import { DEFAULT_THEME_TOKENS } from "../src/theme/validate";
import { deepClone } from "../src/shared/paths";
import type { Settings } from "../src/types/settings";
import type { ModuleContext } from "../src/content/modules/types";

/** Строит минимальный контекст модули и ловит выданный CSS. */
function run(applyOverrides: (s: Settings) => void): {
  id: string | null;
  css: string | null;
} {
  const settings = deepClone(DEFAULT_SETTINGS);
  applyOverrides(settings);
  let id: string | null = null;
  let css: string | null = null;
  const ctx = {
    settings,
    host: {
      setDynamicCss(dynamicId: string, value: string | null): void {
        id = dynamicId;
        css = value;
      },
    },
    adapter: {},
    tokens: { ...DEFAULT_THEME_TOKENS },
  } as unknown as ModuleContext;
  cursorModule.apply(ctx);
  return { id, css };
}

test("cursor: colorMode=theme paints the cursor with the active theme accent", () => {
  const out = run((s) => {
    s.cursor.enabled = true;
    s.cursor.colorMode = "theme";
    s.cursor.color = "#000000"; // свой цвет игнорируется в режиме theme
  });
  const css = out.css ?? "";
  assert.equal(out.id, "rfs-dyn-cursor");
  assert.ok(css, "dynamic css must be emitted");
  const accent = DEFAULT_THEME_TOKENS.primary.toLowerCase();
  assert.ok(
    css.toLowerCase().includes(encodeURIComponent(accent)),
    `expected theme accent ${accent} inside the cursor svg`,
  );
  assert.ok(!css.toLowerCase().includes(encodeURIComponent("#000000")), "custom color must not leak");
});

test("cursor: colorMode=custom paints the cursor with the configured color", () => {
  const css = run((s) => {
    s.cursor.enabled = true;
    s.cursor.colorMode = "custom";
    s.cursor.color = "#00ffcc";
  }).css ?? "";
  assert.ok(css);
  assert.ok(css.toLowerCase().includes(encodeURIComponent("#00ffcc")), "custom color must be used");
});

test("cursor: invalid custom color falls back to the documented default", () => {
  const css = run((s) => {
    s.cursor.enabled = true;
    s.cursor.colorMode = "custom";
    s.cursor.color = "url(javascript:alert(1))";
  }).css ?? "";
  assert.ok(css);
  assert.ok(css.toLowerCase().includes(encodeURIComponent("#d9204f")), "fallback color expected");
});

test("cursor: disabled module clears the dynamic block", () => {
  const { id, css } = run((s) => {
    s.cursor.enabled = false;
    s.cursor.colorMode = "theme";
  });
  assert.equal(id, "rfs-dyn-cursor");
  assert.equal(css, null);
});
