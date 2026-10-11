// @ts-ignore — node:test has no bundled types (@types/node is not a project dependency)
import { test } from "node:test";
// @ts-ignore — node:assert/strict has no bundled types (@types/node is not a project dependency)
import assert from "node:assert/strict";
import {
  SELECTOR_REGISTRY,
  selectorIds,
  selectorUnion,
  resolveSelector,
  auditSelectorHealth,
} from "../src/forum/selectors";

/* --------------------------- registry integrity ------------------------ */

test("SELECTOR_REGISTRY: unique ids matching /^[a-zA-Z]+$/", () => {
  const ids = new Set<string>();
  for (const spec of SELECTOR_REGISTRY) {
    assert.match(spec.id, /^[a-zA-Z]+$/, `bad id: ${spec.id}`);
    assert.ok(!ids.has(spec.id), `duplicate id: ${spec.id}`);
    ids.add(spec.id);
  }
  assert.ok(ids.size >= 50, `registry looks too small: ${ids.size} ids`);
});

test("SELECTOR_REGISTRY: candidates are unique non-empty strings", () => {
  for (const spec of SELECTOR_REGISTRY) {
    assert.ok(spec.candidates.length > 0, `${spec.id} has no candidates`);
    const seen = new Set<string>();
    for (const candidate of spec.candidates) {
      assert.equal(typeof candidate, "string", `${spec.id}: candidate not a string`);
      assert.ok(candidate.length > 0, `${spec.id}: empty candidate`);
      assert.ok(!seen.has(candidate), `${spec.id}: duplicate candidate ${candidate}`);
      seen.add(candidate);
    }
    if (spec.semantic !== undefined) {
      assert.equal(typeof spec.semantic, "function", `${spec.id}: semantic must be a function`);
    }
  }
});

test("SELECTOR_REGISTRY: covers the core component ids", () => {
  const ids = new Set(selectorIds());
  for (const core of [
    "pageWrapper",
    "nav",
    "footer",
    "block",
    "post",
    "threadItem",
    "node",
    "avatar",
    "button",
    "menu",
    "pagination",
  ]) {
    assert.ok(ids.has(core), `missing core id: ${core}`);
  }
  assert.equal(selectorIds().length, SELECTOR_REGISTRY.length);
});

/* ------------------------------- union --------------------------------- */

test("selectorUnion: 'post' includes both forum-specific and stock candidates", () => {
  const union = selectorUnion(["post"]);
  assert.ok(union.includes(".message--post"), union);
  assert.ok(union.includes(".message"), union);
  assert.equal(union, ".message--post, .message"); // ordered, comma-joined
});

test("selectorUnion: unknown ids are skipped, duplicates deduped", () => {
  assert.equal(selectorUnion(["no-such-id"]), "");
  assert.equal(selectorUnion(["avatar", "avatar"]), ".avatar");
  const multi = selectorUnion(["avatar", "post"]);
  assert.ok(multi.includes(".avatar") && multi.includes(".message--post"));
});

/* ----------------------------- resolution ------------------------------ */

test("resolveSelector: unknown id returns null without touching the root", () => {
  let called = false;
  const root = {
    querySelectorAll: () => {
      called = true;
      return [];
    },
  } as unknown as ParentNode;
  assert.equal(resolveSelector("does-not-exist", root), null);
  assert.equal(called, false, "root must not be queried for unknown ids");
});

test("resolveSelector: first matching candidate wins (ordered fallback)", () => {
  const el = { name: "post-element" };
  const root = {
    querySelectorAll: (selector: string) => {
      if (selector === ".message--post") return []; // forum-specific miss
      if (selector === ".message") return [el]; // stock XenForo hit
      return [];
    },
  } as unknown as ParentNode;
  assert.equal(resolveSelector("post", root), el);
});

test("resolveSelector: semantic check filters candidates (footer)", () => {
  const plain = { tagName: "DIV", classList: { contains: () => false } };
  const footer = { tagName: "FOOTER", classList: { contains: () => false } };
  const root = {
    querySelectorAll: () => [plain, footer],
  } as unknown as ParentNode;
  // isFooter must skip the DIV and pick the FOOTER among matches
  assert.equal(resolveSelector("footer", root), footer);
});

test("auditSelectorHealth: empty root reports every selector as missing", () => {
  const empty = { querySelectorAll: () => [] } as unknown as ParentNode;
  const health = auditSelectorHealth(empty);
  assert.equal(health.length, SELECTOR_REGISTRY.length);
  const ids = new Set<string>();
  for (const entry of health) {
    assert.equal(entry.found, false, entry.id);
    assert.equal(entry.matched, null, entry.id);
    assert.ok(entry.candidateCount >= 1, entry.id);
    ids.add(entry.id);
  }
  assert.equal(ids.size, SELECTOR_REGISTRY.length);
});
