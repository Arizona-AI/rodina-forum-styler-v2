// @ts-ignore — node:test has no bundled types (@types/node is not a project dependency)
import { test } from "node:test";
// @ts-ignore — node:assert/strict has no bundled types (@types/node is not a project dependency)
import assert from "node:assert/strict";
import { resolveTemplate } from "../src/content/modules/backgroundLayer";

/** Все id, доступные в селекте background.template (schema.ts). */
const SCENES = ["stars", "fog", "city", "grid", "waves"];

test("resolveTemplate: every scene yields a self-contained svg data URI", () => {
  for (const id of SCENES) {
    const uri = resolveTemplate(id) ?? "";
    assert.ok(uri, `scene "${id}" is missing`);
    assert.ok(uri.startsWith("data:image/svg+xml,"), `${id}: not an svg data uri`);
    const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
    assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"), `${id}: not a complete svg`);
    assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), `${id}: missing xmlns`);
    assert.ok(!/<script/i.test(svg), `${id}: script tag is forbidden`);
    assert.ok(!/javascript:/i.test(svg), `${id}: javascript: url is forbidden`);
    assert.ok(uri.length < 30_000, `${id}: uri too long (${uri.length})`);
  }
});

test("resolveTemplate: unknown ids are rejected (import cannot inject markup)", () => {
  assert.equal(resolveTemplate("hacked"), null);
  assert.equal(resolveTemplate(""), null);
  assert.equal(resolveTemplate("__proto__"), null);
  assert.equal(resolveTemplate("stars<script>"), null);
});

test("resolveTemplate: deterministic — same id, same uri", () => {
  for (const id of SCENES) {
    assert.equal(resolveTemplate(id), resolveTemplate(id), `${id} is not stable`);
  }
});

test("scenes: star/city fields are generated (svg is not a bare template)", () => {
  const stars = decodeURIComponent(resolveTemplate("stars")!.slice("data:image/svg+xml,".length));
  const circles = stars.match(/<circle/g)?.length ?? 0;
  assert.ok(circles >= 100, `stars scene has too few elements: ${circles}`);

  const city = decodeURIComponent(resolveTemplate("city")!.slice("data:image/svg+xml,".length));
  assert.ok(city.includes('fill="#ffd98a"'), "city scene must contain lit windows");
  assert.ok((city.match(/<rect/g)?.length ?? 0) >= 15, "city scene has too few buildings");
  const windows = city.match(/h11v16/g)?.length ?? 0;
  assert.ok(windows >= 60, `city scene has too few lit windows: ${windows}`);
});
