// @ts-ignore — node:test has no bundled types (@types/node is not a project dependency)
import { test } from "node:test";
// @ts-ignore — node:assert/strict has no bundled types (@types/node is not a project dependency)
import assert from "node:assert/strict";
import {
  parseColor,
  isValidColor,
  toHex,
  contrastRatio,
  ensureContrast,
  deriveHarmony,
  composite,
  withAlpha,
  luminance,
  type Rgb,
  type Harmony,
} from "../src/shared/color";

/** parseColor returns T | null — narrow it with a real failure message. */
function mustColor(value: string): Rgb {
  const rgb = parseColor(value);
  if (!rgb) throw new Error(`parseColor(${JSON.stringify(value)}) returned null`);
  return rgb;
}

/* ------------------------------ parsing ------------------------------ */

test("parseColor: hex3/hex4/hex6/hex8", () => {
  const c3 = mustColor("#abc");
  assert.deepEqual({ r: c3.r, g: c3.g, b: c3.b, a: c3.a }, { r: 170, g: 187, b: 204, a: 1 });
  const c4 = mustColor("#abcd");
  assert.equal(c4.r, 170);
  assert.equal(c4.a, 0xdd / 255);
  const c6 = mustColor("#D9204F"); // case-insensitive
  assert.deepEqual({ r: c6.r, g: c6.g, b: c6.b, a: c6.a }, { r: 217, g: 32, b: 79, a: 1 });
  const c8 = mustColor("#12345678");
  assert.equal(c8.r, 0x12);
  assert.equal(c8.b, 0x56);
  assert.equal(c8.a, 0x78 / 255);
});

test("parseColor: rgb() and hsl() functions", () => {
  const rgb = mustColor("rgb(255, 119, 0)");
  assert.deepEqual({ r: rgb.r, g: rgb.g, b: rgb.b, a: rgb.a }, { r: 255, g: 119, b: 0, a: 1 });
  const spaced = mustColor("rgb(0 128 255)"); // space-separated syntax
  assert.equal(spaced.r, 0);
  assert.equal(spaced.g, 128);
  assert.equal(spaced.b, 255);
  const red = mustColor("hsl(0, 100%, 50%)");
  assert.deepEqual(
    { r: Math.round(red.r), g: Math.round(red.g), b: Math.round(red.b) },
    { r: 255, g: 0, b: 0 },
  );
  const blue = mustColor("hsl(240deg, 100%, 50%)");
  assert.deepEqual(
    { r: Math.round(blue.r), g: Math.round(blue.g), b: Math.round(blue.b) },
    { r: 0, g: 0, b: 255 },
  );
});

test("parseColor: named colors (whitelist)", () => {
  const crimson = mustColor("crimson");
  assert.deepEqual({ r: crimson.r, g: crimson.g, b: crimson.b }, { r: 220, g: 20, b: 60 });
  assert.equal(mustColor("white").r, 255);
  assert.equal(mustColor("GREY").g, 128); // lowercased before lookup
  assert.equal(mustColor("transparent").a, 0);
});

test("parseColor: invalid input returns null", () => {
  const bad = [
    "",
    "   ",
    "not-a-color",
    "#12345",
    "rgb(255,255)",
    "hsl(50,50,50)",
    "rebeccapurple",
    "url(#fff)",
    "red; background:url(x)",
    "javascript:alert(1)",
  ];
  for (const input of bad) {
    assert.equal(parseColor(input), null, `expected null for ${JSON.stringify(input)}`);
  }
  assert.equal(parseColor("#" + "f".repeat(64)), null); // 65 chars — over the 64 limit
  assert.equal(parseColor(null as unknown as string), null); // non-string
  assert.equal(isValidColor("#d9204f"), true);
  assert.equal(isValidColor("boom"), false);
});

test("parseColor: rgba()/hsla() decimal alpha follows the CSS spec", () => {
  assert.equal(mustColor("rgba(0, 0, 0, 0.5)").a, 0.5);
  assert.equal(mustColor("hsla(0, 100%, 50%, 0.25)").a, 0.25);
  // Percentage alpha is 0–100 per spec.
  assert.equal(mustColor("rgba(0,0,0,50%)").a, 0.5);
  assert.equal(mustColor("rgba(0,0,0,100%)").a, 1);
  // Out-of-range clamps.
  assert.equal(mustColor("rgba(0,0,0,1.5)").a, 1);
});

/* -------------------------------- toHex -------------------------------- */

test("toHex: roundtrips through parseColor", () => {
  for (const hex of ["#d9204f", "#000000", "#ffffff", "#12345678", "#abcdef"]) {
    assert.equal(toHex(mustColor(hex)), hex, `roundtrip failed for ${hex}`);
  }
  assert.equal(toHex(mustColor("#ABCDEF")), "#abcdef"); // normalized lowercase
  assert.deepEqual(parseColor(toHex({ r: 10, g: 20, b: 30, a: 1 })), { r: 10, g: 20, b: 30, a: 1 });
});

/* ------------------------------- contrast ------------------------------ */

test("contrastRatio: WCAG anchors (white/black = 21, identical = 1)", () => {
  const whiteBlack = contrastRatio("#ffffff", "#000000");
  assert.ok(Math.abs(whiteBlack - 21) < 1e-9, `white/black = ${whiteBlack}`);
  assert.equal(contrastRatio("#d9204f", "#d9204f"), 1);
  assert.ok(contrastRatio("#333333", "#ffffff") > 10); // dark gray on white is ~12.6
  assert.equal(contrastRatio("not-a-color", "#ffffff"), 1); // invalid input -> 1
});

test("luminance: white > mid gray > black", () => {
  const white = luminance(mustColor("#ffffff"));
  const mid = luminance(mustColor("#808080"));
  const black = luminance(mustColor("#000000"));
  assert.ok(white > mid && mid > black, `${white} > ${mid} > ${black}`);
  assert.ok(Math.abs(white - 1) < 1e-9);
  assert.ok(black < 1e-9);
});

test("ensureContrast: reaches the requested ratio for several inputs", () => {
  const cases: Array<[string, string, number]> = [
    ["#aaaaaa", "#ffffff", 4.5],
    ["#777777", "#eeeeee", 4.5],
    ["#333333", "#000000", 4.5],
    ["#555555", "#ffffff", 7],
    ["#808080", "#808080", 3],
  ];
  for (const [target, against, ratio] of cases) {
    const fixed = ensureContrast(target, against, ratio);
    assert.ok(parseColor(fixed), `ensureContrast(${target}, ${against}, ${ratio}) -> ${fixed}`);
    const got = contrastRatio(fixed, against);
    assert.ok(got >= ratio - 1e-9, `"${fixed}" vs "${against}" = ${got} < ${ratio}`);
  }
});

test("ensureContrast: already-passing input is returned unchanged", () => {
  assert.equal(ensureContrast("#000000", "#ffffff", 4.5), "#000000");
  assert.equal(ensureContrast("#ff0000", "#ffffff", 3), "#ff0000"); // red/white = 4.0
  assert.equal(ensureContrast("garbage", "#ffffff", 4.5), "garbage"); // invalid passes through
});

/* ------------------------------- harmony ------------------------------- */

test("deriveHarmony: every harmony mode returns a parseable hex", () => {
  const modes: Harmony[] = ["complementary", "analogous", "triadic", "split", "monochrome"];
  for (const mode of modes) {
    for (const role of ["secondary", "accent"] as const) {
      const hex = deriveHarmony("#3b82f6", mode, role);
      if (typeof hex !== "string") throw new Error(`${mode}/${role} returned ${String(hex)}`);
      assert.match(hex, /^#[0-9a-f]{6}$/, `${mode}/${role} -> ${hex}`);
      assert.ok(parseColor(hex), `unparseable ${hex} from ${mode}/${role}`);
    }
  }
  assert.equal(deriveHarmony("not-a-color", "triadic", "secondary"), null);
});

/* -------------------------- composite / alpha -------------------------- */

test("composite: porter-Duff source-over", () => {
  const white: Rgb = { r: 255, g: 255, b: 255, a: 1 };
  const half = composite({ r: 255, g: 0, b: 0, a: 0.5 }, white);
  assert.deepEqual(half, { r: 255, g: 127.5, b: 127.5, a: 1 });
  const opaque: Rgb = { r: 10, g: 20, b: 30, a: 1 };
  assert.strictEqual(composite(opaque, white), opaque); // opaque source is a passthrough
});

test("withAlpha: clamps alpha and keeps rgb", () => {
  const base: Rgb = { r: 1, g: 2, b: 3, a: 1 };
  const quarter = withAlpha(base, 0.25);
  assert.equal(quarter.a, 0.25);
  assert.deepEqual({ r: quarter.r, g: quarter.g, b: quarter.b }, { r: 1, g: 2, b: 3 });
  assert.equal(withAlpha(base, 5).a, 1);
  assert.equal(withAlpha(base, -3).a, 0);
});
