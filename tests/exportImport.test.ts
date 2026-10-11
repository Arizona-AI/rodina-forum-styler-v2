// @ts-ignore — node:test has no bundled types (@types/node is not a project dependency)
import { test } from "node:test";
// @ts-ignore — node:assert/strict has no bundled types (@types/node is not a project dependency)
import assert from "node:assert/strict";
import {
  parseBundle,
  parseShareCode,
  encodeShareCode,
  BUNDLE_SCHEMA,
  BUNDLE_VERSION,
  type ExportBundle,
} from "../src/storage/exportImport";
import { DEFAULT_SETTINGS } from "../src/settings/defaults";
import { DEFAULT_THEME_TOKENS } from "../src/theme/validate";
import { MAX_IMPORT_LENGTH } from "../src/shared/validators";
import { deepClone } from "../src/shared/paths";
import type { CustomTheme } from "../src/types/theme";

/* ------------------------------- rejections ---------------------------- */

test("parseBundle: rejects non-JSON and non-object JSON", () => {
  const bad = parseBundle("this is not json {{");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.errors.length > 0);

  const array = parseBundle("[1, 2, 3]");
  assert.equal(array.ok, false);
  if (!array.ok) assert.ok(array.errors[0]?.includes("JSON-объект"));
});

test("parseBundle: rejects a foreign schema", () => {
  const res = parseBundle(JSON.stringify({ schema: "some-other-tool", version: 1 }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.errors[0]?.includes("Неизвестная схема"));
});

test("parseBundle: rejects a bundle from a future version", () => {
  const res = parseBundle(JSON.stringify({ schema: BUNDLE_SCHEMA, version: BUNDLE_VERSION + 999 }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.errors[0]?.includes("более новой версией"));
});

test("parseBundle: rejects wrong-typed settings/customThemes fields", () => {
  const settings = parseBundle(JSON.stringify({ schema: BUNDLE_SCHEMA, version: 1, settings: "nope" }));
  assert.equal(settings.ok, false);
  if (!settings.ok) assert.ok(settings.errors[0]?.includes("settings"));

  const themes = parseBundle(JSON.stringify({ schema: BUNDLE_SCHEMA, version: 1, customThemes: "nope" }));
  assert.equal(themes.ok, false);
  if (!themes.ok) assert.ok(themes.errors[0]?.includes("customThemes"));
});

test("parseBundle: rejects payloads over MAX_IMPORT_LENGTH", () => {
  const res = parseBundle("x".repeat(MAX_IMPORT_LENGTH + 1));
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.errors[0]?.includes("слишком большой"));
});

/* ------------------------------- acceptance ---------------------------- */

test("parseBundle: accepts a valid bundle and keeps its values", () => {
  const res = parseBundle(
    JSON.stringify({
      schema: BUNDLE_SCHEMA,
      version: BUNDLE_VERSION,
      settingsVersion: 5,
      exportedAt: "2026-01-01T00:00:00.000Z",
      settings: { master: { enabled: false } },
      onboardingDone: true,
    }),
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.bundle.version, BUNDLE_VERSION);
  assert.equal(res.bundle.settingsVersion, 5);
  assert.equal(res.bundle.exportedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(res.bundle.settings?.master.enabled, false);
  assert.equal(res.bundle.onboardingDone, true);
  assert.ok(res.warnings.some((w) => w.includes("проверены")), "expected a settings warning");
});

test("parseBundle: garbage settings values are repaired to defaults", () => {
  const res = parseBundle(
    JSON.stringify({
      schema: BUNDLE_SCHEMA,
      version: BUNDLE_VERSION,
      settings: {
        appearance: { shellTheme: "weird", avatarScale: 5000 },
        effects: { speed: "fast" },
        master: { enabled: "no" },
      },
    }),
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const settings = res.bundle.settings;
  if (!settings) throw new Error("settings missing");
  assert.equal(settings.appearance.shellTheme, "dark");
  assert.equal(settings.appearance.avatarScale, 140); // clamped to schema max
  assert.equal(settings.effects.speed, 1);
  assert.equal(settings.master.enabled, true);
});

test("parseBundle: invalid custom themes are dropped with a warning", () => {
  const res = parseBundle(
    JSON.stringify({
      schema: BUNDLE_SCHEMA,
      version: BUNDLE_VERSION,
      customThemes: [
        "junk",
        null,
        42,
        { id: "bad id!", name: "Broken" },
        { id: "good-theme", name: "Good", category: "dark", mode: "dark", tokens: {} },
      ],
    }),
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const themes = res.bundle.customThemes;
  assert.equal(themes?.length, 1);
  assert.equal(themes?.[0]?.id, "good-theme");
  assert.ok(typeof themes?.[0]?.createdAt === "number");
  assert.ok(res.warnings.some((w) => w.includes("Пропущено некорректных тем")));
});

test("parseBundle: custom theme list is capped at MAX_CUSTOM_THEMES (100)", () => {
  const many = Array.from({ length: 105 }, (_, i) => ({
    id: `theme-${i}`,
    name: `Theme ${i}`,
    category: "dark",
    mode: "dark",
    tokens: {},
  }));
  const res = parseBundle(JSON.stringify({ schema: BUNDLE_SCHEMA, version: BUNDLE_VERSION, customThemes: many }));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.bundle.customThemes?.length, 100);
  assert.ok(res.warnings.some((w) => w.includes("Тем больше лимита")), "the over-limit warning must fire");
  assert.ok(!res.warnings.some((w) => w.includes("некорректных")), "no invalid themes here");
});

/* ------------------------------ migration ------------------------------ */

test("migration: bundles below BUNDLE_VERSION are accepted without crashing", () => {
  // BUNDLE_VERSION is 1 — the only "older" version is 0 (see MIGRATIONS hook
  // in exportImport.ts: the upgrade loop runs and leaves current data intact).
  const v0 = parseBundle(JSON.stringify({ schema: BUNDLE_SCHEMA, version: 0, settingsVersion: 0 }));
  assert.equal(v0.ok, true);
  if (v0.ok) assert.equal(v0.bundle.version, BUNDLE_VERSION);

  const noVersion = parseBundle(JSON.stringify({ schema: BUNDLE_SCHEMA }));
  assert.equal(noVersion.ok, true);
  if (noVersion.ok) {
    assert.equal(noVersion.bundle.version, BUNDLE_VERSION);
    assert.ok(noVersion.warnings.some((w) => w.includes("не содержит настроек")));
  }
});

/* ----------------------------- share codes ---------------------------- */

test("encodeShareCode -> parseShareCode roundtrip", () => {
  const theme: CustomTheme = {
    id: "my-theme",
    name: "Тёмная тема",
    description: "опыт",
    category: "dark",
    mode: "dark",
    tokens: deepClone(DEFAULT_THEME_TOKENS),
    createdAt: 1,
    updatedAt: 2,
  };
  const original: ExportBundle = {
    schema: BUNDLE_SCHEMA,
    version: BUNDLE_VERSION,
    settingsVersion: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    settings: deepClone(DEFAULT_SETTINGS),
    customThemes: [theme],
    onboardingDone: true,
  };
  const code = encodeShareCode(original);
  assert.equal(typeof code, "string");
  assert.ok(code.length > 0);
  assert.ok(!/[+/=]/.test(code), "base64url must not contain +, / or = padding");

  const parsed = parseShareCode(code);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.bundle.settings, DEFAULT_SETTINGS);
  assert.equal(parsed.bundle.exportedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(parsed.bundle.customThemes?.[0]?.name, "Тёмная тема");
  assert.equal(parsed.bundle.onboardingDone, true);
});

test("parseShareCode: raw JSON is accepted; garbage codes fail gracefully", () => {
  const json = JSON.stringify({ schema: BUNDLE_SCHEMA, version: BUNDLE_VERSION });
  const viaJson = parseShareCode("  " + json);
  assert.equal(viaJson.ok, true);

  assert.equal(parseShareCode("").ok, false);
  assert.equal(parseShareCode("!!!not-base64!!!").ok, false);
});
