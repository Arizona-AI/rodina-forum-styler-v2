// @ts-ignore — node:test has no bundled types (@types/node is not a project dependency)
import { test } from "node:test";
// @ts-ignore — node:assert/strict has no bundled types (@types/node is not a project dependency)
import assert from "node:assert/strict";
import { buildFlagPlan, isReducedMotion } from "../src/content/flags";
import { DEFAULT_SETTINGS } from "../src/settings/defaults";
import { deepClone } from "../src/shared/paths";
import type { Settings } from "../src/types/settings";

/** Fresh mutable default settings for each scenario. */
function base(): Settings {
  return deepClone(DEFAULT_SETTINGS);
}

/* ------------------------------ master ------------------------------- */

test("buildFlagPlan: master switch does not influence the plan", () => {
  const on = buildFlagPlan(base());
  const off = base();
  off.master.enabled = false;
  const offPlan = buildFlagPlan(off);
  assert.deepEqual(offPlan.attributes, on.attributes);
  assert.deepEqual(offPlan.variables, on.variables);
});

/* ------------------------------- glass -------------------------------- */

test("buildFlagPlan: glass on sets flags, subflags and glass variables", () => {
  const s = base();
  s.glass = { enabled: true, blur: 12, opacity: 40, borderOpacity: 20, shadow: 60, onBlocks: true, onPosts: false, onNav: true, onMenus: false };
  const plan = buildFlagPlan(s);
  assert.equal(plan.attributes["data-rfs-glass"], "1");
  assert.equal(plan.attributes["data-rfs-glass-blocks"], "1"); // onBlocks
  assert.equal(plan.attributes["data-rfs-glass-posts"], null); // onPosts off
  assert.equal(plan.attributes["data-rfs-glass-nav"], "1"); // onNav
  assert.equal(plan.attributes["data-rfs-glass-menus"], null); // onMenus off
  assert.equal(plan.variables["--rfs-glass-blur"], "12px");
  assert.equal(plan.variables["--rfs-glass-alpha"], "0.600"); // 1 - 40/100
  assert.equal(plan.variables["--rfs-glass-border-alpha"], "0.200");
  assert.equal(plan.variables["--rfs-glass-shadow-alpha"], "0.600");
});

test("buildFlagPlan: glass off -> null flags and no glass variables", () => {
  const plan = buildFlagPlan(base()); // glass.enabled defaults to false
  assert.equal(plan.attributes["data-rfs-glass"], null);
  assert.equal(plan.attributes["data-rfs-glass-blocks"], null);
  assert.equal(plan.attributes["data-rfs-glass-posts"], null);
  assert.equal(plan.attributes["data-rfs-glass-nav"], null);
  assert.equal(plan.attributes["data-rfs-glass-menus"], null);
  const glassVars = Object.keys(plan.variables).filter((key) => key.startsWith("--rfs-glass"));
  assert.deepEqual(glassVars, []);
});

/* ---------------------------- hide tweaks ----------------------------- */

/** tweaks keys whose value is a boolean toggle (arrays excluded). */
type BooleanTweak = {
  [K in keyof Settings["tweaks"]]: Settings["tweaks"][K] extends boolean ? K : never;
}[keyof Settings["tweaks"]];

test("buildFlagPlan: every hide toggle maps to its own attribute", () => {
  const map: Array<[BooleanTweak, string]> = [
    ["hideFooter", "data-rfs-hide-footer"],
    ["hideSidebar", "data-rfs-hide-sidebar"],
    ["hideAvatars", "data-rfs-hide-avatars"],
    ["hideNodeIcons", "data-rfs-hide-node-icons"],
    ["hideHeaderAlerts", "data-rfs-hide-header-alerts"],
    ["hideSubForums", "data-rfs-hide-subforums"],
    ["hidePrefixes", "data-rfs-hide-prefixes"],
    ["hideUnreadIndicators", "data-rfs-hide-unread"],
    ["headerSticky", "data-rfs-sticky-header"],
    ["hideUserBanners", "data-rfs-hide-user-banners"],
    ["hideStyleVariation", "data-rfs-hide-style-variation"],
    ["hideSignatures", "data-rfs-hide-signatures"],
    ["hideBreadcrumbs", "data-rfs-hide-breadcrumbs"],
    ["hideSectionLinks", "data-rfs-hide-section-links"],
    ["hideUserExtras", "data-rfs-hide-user-extras"],
    ["hideYourPosts", "data-rfs-hide-your-posts"],
    ["hidePostBg", "data-rfs-hide-post-bg"],
    ["hideConversations", "data-rfs-hide-conversations"],
    ["removeUserPaints", "data-rfs-remove-paints"],
    ["accentButtons", "data-rfs-accent-buttons"],
    ["accentThreadList", "data-rfs-accent-thread-list"],
    ["accentThreadsMeta", "data-rfs-accent-threads-meta"],
    ["accentPostAttribution", "data-rfs-accent-post-attribution"],
    ["accentNewBadge", "data-rfs-accent-new-badge"],
  ];
  for (const [key, attr] of map) {
    const on = base();
    on.tweaks[key] = true;
    assert.equal(buildFlagPlan(on).attributes[attr], "1", `${key} -> ${attr}`);
    assert.equal(buildFlagPlan(base()).attributes[attr], null, `${key} default off`);
  }
  // enabling one toggle does not leak into the others
  const one = base();
  one.tweaks.hideFooter = true;
  const plan = buildFlagPlan(one);
  assert.equal(plan.attributes["data-rfs-hide-footer"], "1");
  assert.equal(plan.attributes["data-rfs-hide-sidebar"], null);
  assert.equal(plan.attributes["data-rfs-sticky-header"], null);
  assert.equal(plan.attributes["data-rfs-hide-user-banners"], null);
});

test("buildFlagPlan: module-gated tweaks emit no attributes", () => {
  const s = base();
  s.tweaks.animatedAvatars = true;
  s.tweaks.copySelectedLink = true;
  const plan = buildFlagPlan(s);
  for (const attr of Object.keys(plan.attributes)) {
    assert.ok(!attr.includes("animated"), `unexpected attribute ${attr}`);
    assert.ok(!attr.includes("copy"), `unexpected attribute ${attr}`);
  }
});

/* ------------------- identity tweaks (Arizona port) ------------------- */

test("buildFlagPlan: bannedStyle / avatarStyle / logoStyle map by value", () => {
  const defaults = buildFlagPlan(base());
  assert.equal(defaults.attributes["data-rfs-banned-style"], null);
  assert.equal(defaults.attributes["data-rfs-avatar-style"], null);
  assert.equal(defaults.attributes["data-rfs-logo-style"], null);

  const s = base();
  s.tweaks.bannedStyle = "red-paint";
  s.appearance.avatarStyle = "paint-glow";
  s.appearance.logoStyle = "accent-animated";
  const plan = buildFlagPlan(s);
  assert.equal(plan.attributes["data-rfs-banned-style"], "red-paint");
  assert.equal(plan.attributes["data-rfs-avatar-style"], "paint-glow");
  assert.equal(plan.attributes["data-rfs-logo-style"], "accent-animated");

  // navSearch / nodeIconStatus: "default" stays unset, values pass through
  assert.equal(defaults.attributes["data-rfs-nav-search"], null);
  assert.equal(defaults.attributes["data-rfs-node-icon-status"], null);
  const selects = base();
  selects.tweaks.navSearch = "icon-only";
  selects.tweaks.nodeIconStatus = "mute-read";
  const selectPlan = buildFlagPlan(selects);
  assert.equal(selectPlan.attributes["data-rfs-nav-search"], "icon-only");
  assert.equal(selectPlan.attributes["data-rfs-node-icon-status"], "mute-read");
});

/* ----------------------------- appearance ----------------------------- */

test("buildFlagPlan: custom radius sets var + attr, theme mode sets neither", () => {
  const custom = base();
  custom.appearance.radiusMode = "custom";
  custom.appearance.radius = 20;
  const plan = buildFlagPlan(custom);
  assert.equal(plan.attributes["data-rfs-radius"], "20");
  assert.equal(plan.variables["--rfs-ui-radius"], "20px");

  const themeMode = buildFlagPlan(base()); // radiusMode defaults to "theme"
  assert.equal(themeMode.attributes["data-rfs-radius"], null);
  assert.ok(!("--rfs-ui-radius" in themeMode.variables));

  // attribute and variable clamp identically (0..24)
  const huge = base();
  huge.appearance.radiusMode = "custom";
  huge.appearance.radius = 99;
  const hugePlan = buildFlagPlan(huge);
  assert.equal(hugePlan.attributes["data-rfs-radius"], "24");
  assert.equal(hugePlan.variables["--rfs-ui-radius"], "24px");
});

test("buildFlagPlan: appearance selects map to null for 'theme', value otherwise", () => {
  const defaults = buildFlagPlan(base());
  assert.equal(defaults.attributes["data-rfs-btn-shape"], null);
  assert.equal(defaults.attributes["data-rfs-btn-style"], null);
  assert.equal(defaults.attributes["data-rfs-avatar-shape"], null);
  assert.equal(defaults.attributes["data-rfs-post-style"], null);
  assert.equal(defaults.attributes["data-rfs-density"], null);
  assert.equal(defaults.attributes["data-rfs-avatar-scale"], null); // 100% is the default

  const s = base();
  s.appearance.buttonShape = "pill";
  s.appearance.buttonStyle = "soft";
  s.appearance.avatarShape = "circle";
  s.appearance.postStyle = "card";
  s.appearance.threadDensity = "compact";
  s.appearance.avatarScale = 120;
  const plan = buildFlagPlan(s);
  assert.equal(plan.attributes["data-rfs-btn-shape"], "pill");
  assert.equal(plan.attributes["data-rfs-btn-style"], "soft");
  assert.equal(plan.attributes["data-rfs-avatar-shape"], "circle");
  assert.equal(plan.attributes["data-rfs-post-style"], "card");
  assert.equal(plan.attributes["data-rfs-density"], "compact");
  assert.equal(plan.attributes["data-rfs-avatar-scale"], "120%");
  assert.equal(plan.variables["--rfs-avatar-scale"], "1.200");
});

/* -------------------------------- fonts ------------------------------- */

test("buildFlagPlan: font scope off emits no font variables", () => {
  const off = base();
  off.font.scope = "off";
  const plan = buildFlagPlan(off);
  assert.equal(plan.attributes["data-rfs-font-scope"], null);
  for (const key of ["--rfs-font-scale", "--rfs-font-weight", "--rfs-font-line", "--rfs-font-track"]) {
    assert.ok(!(key in plan.variables), `${key} must be absent when scope=off`);
  }

  const on = buildFlagPlan(base()); // scope defaults to "ui"
  assert.equal(on.attributes["data-rfs-font-scope"], "ui");
  assert.equal(on.variables["--rfs-font-scale"], "1.000");
  assert.equal(on.variables["--rfs-font-weight"], "400");
  assert.equal(on.variables["--rfs-font-line"], "1.5");
  assert.equal(on.variables["--rfs-font-track"], "0px");
});

/* ------------------------------- cursor ------------------------------- */

test("buildFlagPlan: cursor flag follows enabled/preset", () => {
  const off = buildFlagPlan(base()); // cursor.enabled defaults to false
  assert.equal(off.attributes["data-rfs-cursor"], null);
  assert.ok(!("--rfs-cursor-size" in off.variables));

  const on = base();
  on.cursor.enabled = true;
  const plan = buildFlagPlan(on);
  assert.equal(plan.attributes["data-rfs-cursor"], "crosshair"); // default preset
  assert.equal(plan.variables["--rfs-cursor-size"], "28px");
});

/* -------------------------------- effects ----------------------------- */

test("buildFlagPlan: fx toggles map one attribute each", () => {
  const map: Array<[keyof Pick<Settings["effects"], "snow" | "particles" | "fog" | "glow" | "animatedGradient" | "hoverLift">, string]> = [
    ["snow", "data-rfs-fx-snow"],
    ["particles", "data-rfs-fx-particles"],
    ["fog", "data-rfs-fx-fog"],
    ["glow", "data-rfs-fx-glow"],
    ["animatedGradient", "data-rfs-fx-gradient"],
    ["hoverLift", "data-rfs-fx-lift"],
  ];
  for (const [key, attr] of map) {
    const on = base();
    on.effects[key] = true;
    assert.equal(buildFlagPlan(on).attributes[attr], "1", `${key} -> ${attr}`);
    assert.equal(buildFlagPlan(base()).attributes[attr], null, `${key} default off`);
  }
});

test("buildFlagPlan: --rfs-fx-opacity only when a canvas effect runs", () => {
  assert.ok(!("--rfs-fx-opacity" in buildFlagPlan(base()).variables));
  const glowOnly = base();
  glowOnly.effects.glow = true; // glow is a CSS effect, not canvas
  assert.ok(!("--rfs-fx-opacity" in buildFlagPlan(glowOnly).variables));
  const snow = base();
  snow.effects.snow = true;
  snow.effects.opacity = 50;
  assert.equal(buildFlagPlan(snow).variables["--rfs-fx-opacity"], "0.50");
});

/* ----------------------------- transitions ---------------------------- */

test("buildFlagPlan: transition none -> null attr and no timing vars", () => {
  const plan = buildFlagPlan(base()); // style defaults to "none"
  assert.equal(plan.attributes["data-rfs-transition"], null);
  assert.ok(!("--rfs-tr-duration" in plan.variables));
  assert.ok(!("--rfs-tr-stagger" in plan.variables));

  const fade = base();
  fade.transition.style = "fade";
  const fadePlan = buildFlagPlan(fade);
  assert.equal(fadePlan.attributes["data-rfs-transition"], "fade");
  assert.equal(fadePlan.variables["--rfs-tr-duration"], "300ms");
  assert.equal(fadePlan.variables["--rfs-tr-stagger"], "45ms");
});

/* --------------------------- accessibility ---------------------------- */

test("reduced-motion: force -> 1, auto (no window) -> null, reduceTransitions -> 1", () => {
  const force = base();
  force.accessibility.reducedMotion = "force";
  assert.equal(buildFlagPlan(force).attributes["data-rfs-reduced-motion"], "1");
  assert.equal(isReducedMotion(force), true);

  const auto = base(); // "auto": matchesReducedMotion() — no `window` in node -> false
  assert.equal(buildFlagPlan(auto).attributes["data-rfs-reduced-motion"], null);
  assert.equal(isReducedMotion(auto), false);

  const reduce = base();
  reduce.accessibility.reduceTransitions = true;
  assert.equal(buildFlagPlan(reduce).attributes["data-rfs-reduced-motion"], "1");
  assert.equal(isReducedMotion(reduce), true);
});

test("reduced-motion: system preference honoured through window.matchMedia stub", () => {
  const g = globalThis as unknown as { window?: unknown };
  const auto = base(); // reducedMotion: "auto"
  try {
    g.window = { matchMedia: () => ({ matches: true }) };
    assert.equal(isReducedMotion(auto), true);
    assert.equal(buildFlagPlan(auto).attributes["data-rfs-reduced-motion"], "1");
    g.window = { matchMedia: () => ({ matches: false }) };
    assert.equal(isReducedMotion(auto), false);
    assert.equal(buildFlagPlan(auto).attributes["data-rfs-reduced-motion"], null);
  } finally {
    delete g.window;
  }
});

test("buildFlagPlan: focus ring, contrast boost and reduce-transitions flags", () => {
  const defaults = buildFlagPlan(base());
  assert.equal(defaults.attributes["data-rfs-focus-ring"], null);
  assert.equal(defaults.attributes["data-rfs-contrast-boost"], null);
  assert.equal(defaults.attributes["data-rfs-reduce-transitions"], null);

  const on = base();
  on.accessibility.focusRing = true;
  on.accessibility.contrastBoost = true;
  on.accessibility.reduceTransitions = true;
  const plan = buildFlagPlan(on);
  assert.equal(plan.attributes["data-rfs-focus-ring"], "1");
  assert.equal(plan.attributes["data-rfs-contrast-boost"], "1");
  assert.equal(plan.attributes["data-rfs-reduce-transitions"], "1");
});

/* ----------------------------- experimental --------------------------- */

test("buildFlagPlan: experimental flags require the master experimental toggle", () => {
  const crossfadeOnly = base();
  crossfadeOnly.experimental.themeCrossfade = true; // enabled stays false
  const plan = buildFlagPlan(crossfadeOnly);
  assert.equal(plan.attributes["data-rfs-crossfade"], null);
  assert.equal(plan.attributes["data-rfs-pause-btn"], null);

  const on = base();
  on.experimental.enabled = true;
  on.experimental.themeCrossfade = true;
  on.experimental.pauseButton = true;
  const onPlan = buildFlagPlan(on);
  assert.equal(onPlan.attributes["data-rfs-crossfade"], "1");
  assert.equal(onPlan.attributes["data-rfs-pause-btn"], "1");
});
