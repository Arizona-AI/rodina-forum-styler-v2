// @ts-ignore — node:test has no bundled types (@types/node is not a project dependency)
import { test } from "node:test";
// @ts-ignore — node:assert/strict has no bundled types (@types/node is not a project dependency)
import assert from "node:assert/strict";
import { upgradeAvatarSrc } from "../src/content/modules/userChrome";
import { buildSelectionUrl } from "../src/content/modules/selectionLink";
import { targetVariation } from "../src/content/modules/variationSync";
import { resolveNavId } from "../src/shared/navButtons";

/* --------------------------- animated avatars --------------------------- */

test("upgradeAvatarSrc: sized avatar previews map to the original /o/ file", () => {
  assert.equal(
    upgradeAvatarSrc("https://forum.rodina-rp.com/avatars/s/123_abc.gif"),
    "https://forum.rodina-rp.com/avatars/o/123_abc.gif",
  );
  assert.equal(
    upgradeAvatarSrc("https://forum.rodina-rp.com/avatars/m/42.webp"),
    "https://forum.rodina-rp.com/avatars/o/42.webp",
  );
  assert.equal(
    upgradeAvatarSrc("https://forum.rodina-rp.com/avatars/l/7.png"),
    "https://forum.rodina-rp.com/avatars/o/7.png",
  );
});

test("upgradeAvatarSrc: full-size and unrelated srcs stay untouched", () => {
  assert.equal(upgradeAvatarSrc("https://forum.rodina-rp.com/avatars/o/123.gif"), null);
  assert.equal(upgradeAvatarSrc("https://forum.rodina-rp.com/styles/xenforo/logo.png"), null);
  assert.equal(upgradeAvatarSrc(""), null);
});

/* ------------------------- selection link (text fragment) --------------- */

test("buildSelectionUrl: post anchor + collapsed text fragment", () => {
  const url = buildSelectionUrl("https://forum.rodina-rp.com/threads/abc.5/", "101", "  очень\n  длинный   текст ");
  assert.equal(
    url,
    "https://forum.rodina-rp.com/threads/abc.5/#post-101:~:text=%D0%BE%D1%87%D0%B5%D0%BD%D1%8C%20%D0%B4%D0%BB%D0%B8%D0%BD%D0%BD%D1%8B%D0%B9%20%D1%82%D0%B5%D0%BA%D1%81%D1%82",
  );
});

test("buildSelectionUrl: without a post id the fragment still anchors the page", () => {
  const url = buildSelectionUrl("https://forum.rodina-rp.com/", null, "слово");
  assert.equal(url, "https://forum.rodina-rp.com/:~:text=%D1%81%D0%BB%D0%BE%D0%B2%D0%BE");
});

/* --------------------------- variation sync ---------------------------- */

test("targetVariation: dark backgrounds map to default, light to alternate", () => {
  assert.equal(targetVariation("#0d0d12"), "default");
  assert.equal(targetVariation("#121212"), "default");
  assert.equal(targetVariation("#f5f5f7"), "alternate");
  assert.equal(targetVariation("#ffffff"), "alternate");
});

test("targetVariation: unreadable input falls back to the dark variation", () => {
  assert.equal(targetVariation("not-a-color"), "default");
  assert.equal(targetVariation(""), "default");
});

/* ------------------------------ navbar ids ------------------------------ */

test("resolveNavId: data-nav-id wins, then href, then the label", () => {
  assert.equal(resolveNavId({ navId: "forums", href: "/forums/", name: "Форумы" }), "forums");
  assert.equal(resolveNavId({ navId: null, href: "/search/", name: "Поиск" }), "/search/");
  assert.equal(resolveNavId({ navId: "", href: "", name: " Поиск " }), "Поиск");
});

test("resolveNavId: empty or oversized ids are rejected", () => {
  assert.equal(resolveNavId({ navId: "", href: "", name: "" }), null);
  assert.equal(resolveNavId({}), null);
  assert.equal(resolveNavId({ name: "a".repeat(201) }), null);
});
