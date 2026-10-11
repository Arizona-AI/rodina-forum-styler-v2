// @ts-ignore — node:test has no bundled types (@types/node is not a project dependency)
import { test } from "node:test";
// @ts-ignore — node:assert/strict has no bundled types (@types/node is not a project dependency)
import assert from "node:assert/strict";
import {
  generateThemeFromPrompt,
  describePrompt,
  harmonizeFromBase,
  analyzeContrast,
  suggestImprovements,
} from "../src/ai/local";
import { extractJsonObject, generateTokensRemote } from "../src/ai/remote";
import { runAiTask } from "../src/ai/index";
import { DEFAULT_THEME_TOKENS } from "../src/theme/validate";
import { parseColor, luminance, contrastRatio } from "../src/shared/color";
import type { ThemeTokens } from "../src/types/theme";

/* ------------------------- local heuristic engine ------------------------ */

test("generateThemeFromPrompt: deterministic for the same prompt", () => {
  const a = generateThemeFromPrompt("тёмная неоновая киберпанк тема");
  const b = generateThemeFromPrompt("тёмная неоновая киберпанк тема");
  assert.deepEqual(a, b, "same prompt must produce the same tokens");
});

test("generateThemeFromPrompt: every generated token is valid", () => {
  const tokens = generateThemeFromPrompt("зелёная светлая пастельная тема");
  for (const [key, value] of Object.entries(tokens)) {
    assert.equal(typeof value, "string", `${key} must be a string`);
    if (key === "fontFamily") {
      assert.ok(value.length > 0, "fontFamily must not be empty");
      continue;
    }
    if (key.startsWith("radius")) {
      assert.match(value, /^\d{1,2}(\.\d)?px$/, `${key}: ${value}`);
      continue;
    }
    assert.ok(parseColor(value), `${key}: "${value}" is not a parseable color`);
  }
});

test("generateThemeFromPrompt: light vs dark prompts flip the page background", () => {
  const light = generateThemeFromPrompt("светлая утренняя бумажная тема");
  const dark = generateThemeFromPrompt("тёмная ночная космическая тема");
  const lr = parseColor(light.pageBg);
  const dr = parseColor(dark.pageBg);
  if (!lr || !dr) throw new Error("page backgrounds must parse");
  assert.ok(luminance(lr) > 0.5, `light prompt should give a light pageBg (${light.pageBg})`);
  assert.ok(luminance(dr) < 0.2, `dark prompt should give a dark pageBg (${dark.pageBg})`);
});

test("generateThemeFromPrompt: hue keywords change the accent color", () => {
  const red = generateThemeFromPrompt("красная тема");
  const blue = generateThemeFromPrompt("синяя тема");
  assert.notEqual(red.primary, blue.primary, "hue keywords must influence primary");
  const rr = parseColor(red.primary);
  const br = parseColor(blue.primary);
  if (!rr || !br) throw new Error("primary colors must parse");
  assert.ok(rr.r > rr.b + 30, `red prompt should give a red-leaning primary (${red.primary})`);
  assert.ok(br.b > br.r + 30, `blue prompt should give a blue-leaning primary (${blue.primary})`);
});

test("describePrompt: shape keywords pick the radius family", () => {
  assert.equal(describePrompt("острая угловатая тема").radius, "2px");
  assert.equal(describePrompt("мягкая уютная пастельная").radius, "18px");
  assert.equal(describePrompt("технологичная неоновая").radius, "6px");
});

/* ------------------------------ JSON extraction -------------------------- */

test("extractJsonObject: plain, fenced and prose-wrapped JSON", () => {
  const plain = extractJsonObject('{"a":1}');
  assert.deepEqual(plain, { a: 1 });
  const fenced = extractJsonObject('```json\n{"tokens":{"x":"#fff"}}\n```');
  assert.deepEqual(fenced, { tokens: { x: "#fff" } });
  const prose = extractJsonObject('Вот результат: {"ok":true} — надеюсь помог!');
  assert.deepEqual(prose, { ok: true });
});

test("extractJsonObject: garbage, arrays and oversized payloads return null", () => {
  assert.equal(extractJsonObject("просто текст"), null);
  assert.equal(extractJsonObject("[1,2,3]"), null);
  assert.equal(extractJsonObject('{"broken":'), null);
  assert.equal(extractJsonObject(`{"pad":"${"x".repeat(70 * 1024)}"}`), null);
});

/* --------------------------- accessibility tools -------------------------- */

function brokenPalette(): ThemeTokens {
  return {
    ...DEFAULT_THEME_TOKENS,
    pageBg: "#0e0e12",
    surface: "#141419",
    text: "#3a3a42",
    textMuted: "#4a4a52",
    primary: "#20202a",
    primaryFg: "#46464e",
    buttonBg: "#1a1a20",
    buttonFg: "#40404a",
  };
}

test("analyzeContrast: flags a low-contrast palette with concrete ratios", () => {
  const issues = analyzeContrast(brokenPalette());
  assert.ok(issues.length >= 5, `expected at least 5 failing pairs, got ${issues.length}`);
  for (const issue of issues) {
    assert.ok(issue.ratio < 4.5, `${issue.label}: ${issue.ratio} should be failing`);
    assert.equal(issue.grade, "fail");
    assert.ok(issue.label.length > 0);
  }
});

test("suggestImprovements: brings every reported pair to AA", () => {
  const improved = suggestImprovements(brokenPalette());
  const remaining = analyzeContrast(improved);
  assert.equal(remaining.length, 0, JSON.stringify(remaining));
  assert.ok(contrastRatio(improved.text, improved.surface) >= 4.5);
  assert.ok(contrastRatio(improved.primaryFg, improved.primary) >= 4.5);
});

test("harmonizeFromBase: valid colors produce a palette, invalid ones return null", () => {
  const result = harmonizeFromBase("#d9204f");
  if (!result) throw new Error("valid hex must harmonize");
  for (const value of [result.accent, result.secondary, result.tertiary]) {
    assert.ok(parseColor(value), `harmony color must parse: ${value}`);
  }
  assert.equal(harmonizeFromBase("banana"), null);
  assert.equal(harmonizeFromBase("url(javascript:alert(1))"), null);
});

/* -------------------------------- facade --------------------------------- */

test("runAiTask: analyze and improve work fully offline", async () => {
  const broken = brokenPalette();
  const analysis = await runAiTask("analyze", { tokens: broken });
  assert.equal(analysis.task, "analyze");
  assert.ok(analysis.task === "analyze" && analysis.issues.length >= 1);

  const improvement = await runAiTask("improve", { tokens: broken });
  assert.equal(improvement.task, "improve");
  assert.ok(
    improvement.task === "improve" && improvement.fixedCount >= 1,
    "some issues must be reported as fixed",
  );
});

test("runAiTask: harmonize rejects an invalid base color", async () => {
  await assert.rejects(() => runAiTask("harmonize", { baseColor: "nope" }));
});

/* ------------------------- remote data policy ---------------------------- */

test("generateTokensRemote: refuses to run without configured consent (no network)", async () => {
  // The guard runs before any fetch: without chrome storage, explicit
  // openai+allowRemote consent and a key, the call must reject — never send.
  await assert.rejects(() => generateTokensRemote("тёмная тема", DEFAULT_THEME_TOKENS));
});
