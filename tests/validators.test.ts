// @ts-ignore — node:test has no bundled types (@types/node is not a project dependency)
import { test } from "node:test";
// @ts-ignore — node:assert/strict has no bundled types (@types/node is not a project dependency)
import assert from "node:assert/strict";
import {
  sanitizeText,
  sanitizeUrl,
  sanitizeColor,
  sanitizeGradient,
  sanitizeFontFamily,
  sanitizeId,
  isPlainObject,
  MAX_IMPORT_LENGTH,
} from "../src/shared/validators";

/* ------------------------------- text -------------------------------- */

test("sanitizeText: strips control characters", () => {
  assert.equal(sanitizeText("ab\u0000cd\u0007ef"), "abcdef"); // C0 controls
  assert.equal(sanitizeText("x\u007fy\u009fz"), "xyz"); // DEL + C1 controls
  assert.equal(sanitizeText("  padded  "), "padded"); // trims whitespace
  assert.equal(sanitizeText("héllo — мир"), "héllo — мир"); // non-ASCII kept
});

test("sanitizeText: truncates to maxLength", () => {
  assert.equal(sanitizeText("x".repeat(300)).length, 200); // default MAX_TEXT_LENGTH
  assert.equal(sanitizeText("y".repeat(300), 10).length, 10);
  assert.equal(sanitizeText("short", 10), "short");
  assert.equal(sanitizeText(null), ""); // non-strings become ""
  assert.equal(sanitizeText(42), "");
});

/* ------------------------------- url --------------------------------- */

test("sanitizeUrl: accepts absolute http(s) and safe data:image", () => {
  assert.equal(sanitizeUrl("https://example.com/a.png"), "https://example.com/a.png");
  assert.equal(sanitizeUrl("https://example.com"), "https://example.com/"); // URL normalizes
  assert.equal(sanitizeUrl("http://forum.rodina-rp.com/x"), "http://forum.rodina-rp.com/x");
  const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(sanitizeUrl(dataUrl), dataUrl);
});

test("sanitizeUrl: rejects scriptable, relative and garbage input", () => {
  const bad: unknown[] = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "file:///etc/passwd",
    "/relative/path",
    "../up.svg",
    "not a url",
    "ht!tp://x",
    "",
    null,
    42,
  ];
  for (const input of bad) {
    assert.equal(sanitizeUrl(input), null, `expected null for ${JSON.stringify(input)}`);
  }
  assert.equal(sanitizeUrl("https://example.com/" + "a".repeat(2100)), null); // over 2048
});

/* ------------------------------- color -------------------------------- */

test("sanitizeColor: accepts valid colors, rejects CSS payloads", () => {
  assert.equal(sanitizeColor("#d9204f"), "#d9204f");
  assert.equal(sanitizeColor("  red  "), "red"); // named + trimmed
  assert.equal(sanitizeColor("rgb(10, 20, 30)"), "rgb(10, 20, 30)");
  assert.equal(sanitizeColor("red; background:url(x)"), null);
  assert.equal(sanitizeColor("expression(alert(1))"), null);
  assert.equal(sanitizeColor("var(--evil)"), null);
  assert.equal(sanitizeColor(null), null);
});

/* ------------------------------ gradient ------------------------------ */

test("sanitizeGradient: accepts gradients with color stops only", () => {
  assert.equal(
    sanitizeGradient("linear-gradient(135deg, #12121a, #d9204f)"),
    "linear-gradient(135deg, #12121a, #d9204f)",
  );
  assert.equal(
    sanitizeGradient("radial-gradient(circle, #000000, #ffffff)"),
    "radial-gradient(circle, #000000, #ffffff)",
  );
});

test("sanitizeGradient: rejects url(), var(), semicolons and non-gradients", () => {
  const bad: unknown[] = [
    "url(javascript:alert(1))",
    "var(--rfs-page-bg)",
    "linear-gradient(90deg, #fff); color: red", // semicolon
    "linear-gradient(url(#x), #fff)", // embedded url()
    "linear-gradient(90deg, var(--a), #fff)", // embedded var()
    "linear-gradient(90deg, #fff); background: url(evil)", // ; + url()
    "red",
    "",
    null,
  ];
  for (const input of bad) {
    assert.equal(sanitizeGradient(input), null, `expected null for ${JSON.stringify(input)}`);
  }
});

/* ----------------------------- font family ---------------------------- */

test("sanitizeFontFamily: plain names only — no quotes, parens or commas", () => {
  assert.equal(sanitizeFontFamily("Golos Text"), "Golos Text");
  assert.equal(sanitizeFontFamily("Inter"), "Inter");
  assert.equal(sanitizeFontFamily('Arial, "Helvetica"'), null); // comma + quotes
  assert.equal(sanitizeFontFamily("MyFont (local)"), null); // parens
  assert.equal(sanitizeFontFamily("url(evil.woff2)"), null);
  assert.equal(sanitizeFontFamily(""), null);
  assert.equal(sanitizeFontFamily("x".repeat(61)), null); // over 60 chars
  assert.equal(sanitizeFontFamily(7), null);
});

/* -------------------------------- id ---------------------------------- */

test("sanitizeId: rejects spaces, symbols, empty and over-long ids", () => {
  assert.equal(sanitizeId("my-theme-2"), "my-theme-2");
  assert.equal(sanitizeId("my theme"), null); // space
  assert.equal(sanitizeId("Theme Slug"), null); // space survives lowercasing
  assert.equal(sanitizeId("theme/../x"), null); // path chars
  assert.equal(sanitizeId("-leading"), null); // must start alphanumeric
  assert.equal(sanitizeId(""), null);
  assert.equal(sanitizeId(42), null);
  assert.equal(sanitizeId("x".repeat(65)), null); // over 64 chars
  // Uppercase is normalized (lowercased), not rejected — sanitizeId is a
  // normalizer: "MyTheme" -> "mytheme".
  assert.equal(sanitizeId("MyTheme"), "mytheme");
});

/* ---------------------------- plain object ---------------------------- */

test("isPlainObject: objects only — no arrays, no null", () => {
  assert.equal(isPlainObject({}), true);
  assert.equal(isPlainObject({ a: 1 }), true);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject(null), false);
  assert.equal(isPlainObject("str"), false);
  assert.equal(isPlainObject(5), false);
  assert.equal(isPlainObject(undefined), false);
});

/* ----------------------------- import guard --------------------------- */

test("MAX_IMPORT_LENGTH guard constant exists", () => {
  assert.equal(MAX_IMPORT_LENGTH, 512 * 1024);
  assert.ok(Number.isInteger(MAX_IMPORT_LENGTH) && MAX_IMPORT_LENGTH > 0);
});
