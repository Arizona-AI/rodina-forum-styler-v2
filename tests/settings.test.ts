// @ts-ignore — node:test has no bundled types (@types/node is not a project dependency)
import { test } from "node:test";
// @ts-ignore — node:assert/strict has no bundled types (@types/node is not a project dependency)
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../src/settings/defaults";
import { SETTINGS_SCHEMA } from "../src/settings/schema";
import { validateSettings, coerceValue, resetGroup, SETTINGS_KEY } from "../src/settings/store";
import { getAtPath, setAtPath, deepClone } from "../src/shared/paths";
import type { Settings } from "../src/types/settings";

/* ------------- schema <-> defaults: THE guard against drift ------------ */

test("SETTINGS_SCHEMA: every key exists in DEFAULT_SETTINGS and coerces back to it", () => {
  const seen = new Set<string>();
  for (const def of SETTINGS_SCHEMA) {
    if (seen.has(def.key)) continue; // background.url is declared twice (image + video rows)
    seen.add(def.key);
    const defaultValue = getAtPath(DEFAULT_SETTINGS, def.key);
    assert.notEqual(defaultValue, undefined, `${def.key} is missing from DEFAULT_SETTINGS`);
    const coerced = coerceValue(def, defaultValue);
    if (typeof defaultValue === "number") {
      const n = coerced as number;
      assert.ok(
        typeof n === "number" && Math.abs(n - defaultValue) < 1e-9,
        `${def.key}: coerceValue(${String(coerced)}) != default ${defaultValue}`,
      );
    } else {
      assert.strictEqual(
        coerced,
        defaultValue,
        `${def.key}: coerceValue(${String(coerced)}) != default ${String(defaultValue)}`,
      );
    }
  }
  assert.ok(seen.size >= 80, `schema looks too small: ${seen.size} keys`);
});

/* ---------------------- validateSettings repairs ----------------------- */

test("validateSettings: garbage types fall back to defaults", () => {
  const out = validateSettings({
    master: { enabled: "banana" }, // not a toggle -> default
    appearance: { shellTheme: 42, radius: "huge" }, // bad select / bad slider
    background: { mode: "wobble" }, // not in options
    effects: { speed: "fast", snow: "yes" }, // bad slider / bad toggle
    transition: { style: "wobble" }, // not in options
  });
  assert.equal(out.master.enabled, true);
  assert.equal(out.appearance.shellTheme, "dark");
  assert.equal(out.appearance.radius, 12);
  assert.equal(out.background.mode, "none");
  assert.equal(out.effects.speed, 1);
  assert.equal(out.effects.snow, false);
  assert.equal(out.transition.style, "none");
  // valid incoming values are preserved
  const kept = validateSettings({ glass: { enabled: true }, effects: { snow: true } });
  assert.equal(kept.glass.enabled, true);
  assert.equal(kept.effects.snow, true);
});

test("validateSettings: theme.activeId survives validation (regression)", () => {
  // theme.activeId has no schema control, so it used to be dropped on every
  // load/save — the active theme silently reverted to the default.
  const kept = validateSettings({ theme: { activeId: "az-midnight-slate" } });
  assert.equal(kept.theme.activeId, "az-midnight-slate");
  const custom = validateSettings({ theme: { activeId: "my-theme-2" } });
  assert.equal(custom.theme.activeId, "my-theme-2");
  // garbage / wrong-typed ids fall back to the default
  const bad = validateSettings({ theme: { activeId: "BAD ID!" } });
  assert.equal(bad.theme.activeId, DEFAULT_SETTINGS.theme.activeId);
  const wrongType = validateSettings({ theme: { activeId: 123 } });
  assert.equal(wrongType.theme.activeId, DEFAULT_SETTINGS.theme.activeId);
  // and it plays together with favorites/recent
  const full = validateSettings({
    theme: { activeId: "az-dusk", favorites: ["az-dusk"], recent: ["az-dusk", "az-abyss"] },
  });
  assert.equal(full.theme.activeId, "az-dusk");
  assert.deepEqual(full.theme.favorites, ["az-dusk"]);
  assert.deepEqual(full.theme.recent, ["az-dusk", "az-abyss"]);
});

test("validateSettings: out-of-range sliders clamp into [min, max]", () => {
  const out = validateSettings({
    appearance: { avatarScale: 999 }, // schema: 80..140
    background: { dim: -50, opacity: 500 }, // 0..90 and 10..100
  });
  assert.equal(out.appearance.avatarScale, 140);
  assert.equal(out.background.dim, 0);
  assert.equal(out.background.opacity, 100);
  // step snapping: dim step 5 -> 77 rounds to 75
  assert.equal(validateSettings({ background: { dim: 77 } }).background.dim, 75);
});

test("validateSettings: hostile background.gradient is wiped to empty string", () => {
  const hostile = validateSettings({
    background: { gradient: "url(javascript:alert(1)); color: red" },
  });
  assert.equal(hostile.background.gradient, "");
  const valid = validateSettings({
    background: { gradient: "linear-gradient(135deg, #12121a, #d9204f)" },
  });
  assert.equal(valid.background.gradient, "linear-gradient(135deg, #12121a, #d9204f)");
});

test("validateSettings: favorites/recent are slug-filtered, deduped and capped", () => {
  const out = validateSettings({
    theme: {
      favorites: ["Rodina-Eclipse", "rodina-eclipse", "BAD ID!", "ok-slug", 42, null],
      recent: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"],
    },
  });
  assert.deepEqual(out.theme.favorites, ["rodina-eclipse", "ok-slug"]); // dupes + junk dropped
  assert.deepEqual(out.theme.recent, ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"]); // capped at 8
});

test("validateSettings: hiddenNavIds keeps clean strings, drops junk, dedupes, caps", () => {
  const out = validateSettings({
    tweaks: {
      hiddenNavIds: [
        "forums",
        "  discussions  ", // trimmed
        "forums", // duplicate
        "", // empty
        "<script>alert(1)</script>", // markup-hostile
        42, // wrong type
        "a".repeat(121), // too long
        "search",
      ],
    },
  });
  assert.deepEqual(out.tweaks.hiddenNavIds, ["forums", "discussions", "search"]);
});

test("validateSettings: customNavItems validates each field and caps at 10", () => {
  const valid = { name: "Discord", url: "https://discord.gg/rodina", newTab: true, id: "discord-1" };
  const out = validateSettings({
    tweaks: {
      customNavItems: [
        valid,
        { name: "  ", url: "https://example.com" }, // no name
        { name: "Bad", url: "javascript:alert(1)" }, // hostile url
        { name: "Ok", url: "https://example.org", id: "<bad>" }, // bad id -> regenerated
        ...Array.from({ length: 12 }, (_, i) => ({
          name: `Item ${i}`,
          url: `https://example.com/${i}`,
          id: `item-${i}`,
        })),
      ],
    },
  });
  // First valid item survives with its own id; the "<bad>" id is regenerated.
  assert.equal(out.tweaks.customNavItems[0]?.id, "discord-1");
  assert.equal(out.tweaks.customNavItems[0]?.name, "Discord");
  assert.equal(out.tweaks.customNavItems[0]?.newTab, true);
  // The invalid entries (no name / hostile url) are dropped.
  assert.ok(!out.tweaks.customNavItems.some((item) => item.url.startsWith("javascript:")));
  assert.ok(!out.tweaks.customNavItems.some((item) => item.name.trim() === ""));
  // Capped at 10 and every entry is a sanitized slug id.
  assert.equal(out.tweaks.customNavItems.length, 10);
  for (const item of out.tweaks.customNavItems) {
    assert.match(item.id, /^[a-z0-9][a-z0-9-]{0,63}$/);
  }
});

test("validateSettings: new identity settings coerce invalid values to defaults", () => {
  const out = validateSettings({
    appearance: { logoStyle: "nope", avatarStyle: 7, syncForumMode: "yes" },
    tweaks: { bannedStyle: "purple" },
  });
  assert.equal(out.appearance.logoStyle, "default");
  assert.equal(out.appearance.avatarStyle, "default");
  assert.equal(out.appearance.syncForumMode, false); // uncoercible -> default
  assert.equal(out.tweaks.bannedStyle, "default");
});

test("validateSettings: non-object input yields pure defaults", () => {
  assert.deepEqual(validateSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(validateSettings("junk"), DEFAULT_SETTINGS);
  assert.deepEqual(validateSettings(42), DEFAULT_SETTINGS);
  assert.deepEqual(validateSettings({ appearance: "not-an-object" }), DEFAULT_SETTINGS);
});

test("SETTINGS_SCHEMA: when/whenAnd conditions reference real settings paths", () => {
  let checked = 0;
  for (const def of SETTINGS_SCHEMA) {
    const conds = [def.when, ...(def.whenAnd ?? [])].filter((c) => c !== undefined);
    for (const cond of conds) {
      assert.notEqual(
        getAtPath(DEFAULT_SETTINGS, cond.key),
        undefined,
        `${def.key}: condition key "${cond.key}" does not exist in DEFAULT_SETTINGS`,
      );
      assert.ok(
        cond.equals !== undefined || cond.notEquals !== undefined || cond.oneOf !== undefined,
        `${def.key}: empty condition on "${cond.key}" (no equals/notEquals/oneOf)`,
      );
      checked++;
    }
  }
  assert.ok(checked >= 30, `too few visibility conditions: ${checked}`);
});

test("validateSettings: background.template and cursor.colorMode repair", () => {
  const bad = validateSettings({
    background: { template: "<script>x</script>" },
    cursor: { colorMode: "yes" },
  });
  assert.equal(bad.background.template, "stars");
  assert.equal(bad.cursor.colorMode, "theme");
  const good = validateSettings({
    background: { mode: "template", template: "city" },
    cursor: { colorMode: "custom", color: "#00ffcc" },
  });
  assert.equal(good.background.mode, "template");
  assert.equal(good.background.template, "city");
  assert.equal(good.cursor.colorMode, "custom");
  assert.equal(good.cursor.color, "#00ffcc");
});

/* --------------------------- reset / paths ---------------------------- */

test("getAtPath: dotted-path lookup", () => {
  assert.equal(getAtPath({ a: { b: 7 } }, "a.b"), 7);
  assert.equal(getAtPath({ a: 1 }, "a.b"), undefined); // non-object hop
  assert.equal(getAtPath(null, "a"), undefined);
  assert.equal(getAtPath({ a: { b: 1 } }, "a.missing"), undefined);
  assert.deepEqual(getAtPath({ a: { b: 1 } }, "a"), { b: 1 });
  assert.equal(getAtPath(DEFAULT_SETTINGS, "effects.snow"), false);
});

test("setAtPath: creates intermediate objects", () => {
  const target: Record<string, unknown> = {};
  setAtPath(target, "x.y.z", 5);
  assert.deepEqual(target, { x: { y: { z: 5 } } });
});

test("resetGroup: restores group defaults and leaves other groups alone", async () => {
  // Minimal chrome.storage.local mock (browser.ts only touches chrome inside functions).
  const store: Record<string, unknown> = {};
  const saved: Array<Record<string, unknown>> = [];
  const g = globalThis as unknown as { chrome?: unknown };
  g.chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) => {
          saved.push(items);
          Object.assign(store, items);
        },
        remove: async (key: string) => {
          delete store[key];
        },
      },
      onChanged: { addListener() {}, removeListener() {} },
    },
  };
  try {
    store[SETTINGS_KEY] = validateSettings({
      appearance: { shellTheme: "light", radiusMode: "custom", radius: 20 },
      effects: { snow: true },
    });
    const after = await resetGroup("appearance");
    assert.equal(after.appearance.shellTheme, "dark");
    assert.equal(after.appearance.radiusMode, "theme");
    assert.equal(after.appearance.radius, 12);
    assert.equal(after.effects.snow, true, "other groups must be untouched");
    // and the reset was persisted through chrome.storage
    const persisted = saved.at(-1)?.[SETTINGS_KEY] as Settings;
    assert.equal(persisted.appearance.shellTheme, "dark");
    assert.equal(persisted.effects.snow, true);
  } finally {
    delete g.chrome;
  }
});

test("deepClone: settings clone is detached from DEFAULT_SETTINGS", () => {
  const clone = deepClone(DEFAULT_SETTINGS);
  clone.appearance.radius = 99;
  assert.equal(DEFAULT_SETTINGS.appearance.radius, 12);
});

test("resetGroup('tweaks'): non-schema navbar arrays reset too", async () => {
  const store: Record<string, unknown> = {};
  const g = globalThis as unknown as { chrome?: unknown };
  g.chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) => Object.assign(store, items),
        remove: async (key: string) => {
          delete store[key];
        },
      },
      onChanged: { addListener() {}, removeListener() {} },
    },
  };
  try {
    store[SETTINGS_KEY] = validateSettings({
      tweaks: {
        hiddenNavIds: ["forums", "search"],
        customNavItems: [{ id: "n1", name: "Discord", url: "https://discord.gg/x", newTab: true }],
        hideFooter: true,
      },
    });
    const after = await resetGroup("tweaks");
    assert.deepEqual(after.tweaks.hiddenNavIds, []);
    assert.deepEqual(after.tweaks.customNavItems, []);
    assert.equal(after.tweaks.hideFooter, false, "schema toggles reset as well");
    // other groups untouched
    const persisted = store[SETTINGS_KEY] as Settings;
    assert.deepEqual(persisted.tweaks.hiddenNavIds, []);
  } finally {
    delete g.chrome;
  }
});
