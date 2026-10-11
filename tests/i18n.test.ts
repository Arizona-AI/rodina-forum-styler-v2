// @ts-ignore — node:test has no bundled types (@types/node is not a project dependency)
import { test } from "node:test";
// @ts-ignore — node:assert/strict has no bundled types (@types/node is not a project dependency)
import assert from "node:assert/strict";
import { RU } from "../src/i18n/ru";
import { EN } from "../src/i18n/en";
import { t, setLocale, getLocale } from "../src/i18n/index";

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}

test("dictionaries: EN covers every RU key and adds none of its own", () => {
  const ruKeys = Object.keys(RU);
  assert.ok(ruKeys.length >= 180, `RU dictionary looks too small: ${ruKeys.length}`);
  const enKeys = Object.keys(EN);
  const missing = ruKeys.filter((k) => !(k in EN));
  const extra = enKeys.filter((k) => !(k in RU));
  assert.deepEqual(missing, [], "EN must cover every RU key");
  assert.deepEqual(extra, [], "EN must not contain keys absent from RU");
});

test("dictionaries: placeholder tokens match per key across locales", () => {
  const mismatches: string[] = [];
  for (const [key, ruValue] of Object.entries(RU)) {
    const enValue = EN[key];
    if (enValue === undefined) continue;
    const a = placeholders(ruValue).join(",");
    const b = placeholders(enValue).join(",");
    if (a !== b) mismatches.push(`${key}: ru{${a}} vs en{${b}}`);
  }
  assert.deepEqual(mismatches, []);
});

test("t(): interpolates {vars} and switches locale with RU fallback", () => {
  assert.equal(t("themes.count", { count: 7 }), "Тем: 7");
  const previous = getLocale();
  try {
    setLocale("en");
    assert.equal(t("themes.count", { count: 7 }), "Themes: 7");
    assert.equal(t("action.save"), "Save");
    // Unknown key falls back to the key itself in any locale.
    assert.equal(t("no.such.key"), "no.such.key");
    setLocale("ru");
    assert.equal(t("action.save"), "Сохранить");
  } finally {
    setLocale(previous);
  }
});

test("t(): invalid locale falls back to Russian", () => {
  const previous = getLocale();
  try {
    setLocale("xx-invalid");
    assert.equal(getLocale(), "ru");
    assert.equal(t("action.cancel"), "Отмена");
  } finally {
    setLocale(previous);
  }
});
