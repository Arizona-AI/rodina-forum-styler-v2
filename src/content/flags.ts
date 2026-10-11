/**
 * Flags module — projects settings onto <html> attributes and inline CSS
 * custom properties.
 *
 * This is the cheapest possible application path: CSS rules key off these
 * attributes, so toggling a setting never touches forum elements directly
 * and always survives page updates.
 */
import type { Settings } from "../types/settings";
import type { StyleHost } from "./styleHost";

const HTML = "data-rfs-";

export interface FlagPlan {
  attributes: Record<string, string | null>;
  variables: Record<string, string>;
}

/** Pure mapping: settings -> attributes/variables. Easy to unit test. */
export function buildFlagPlan(settings: Settings): FlagPlan {
  const attributes: Record<string, string | null> = {};
  const variables: Record<string, string> = {};

  /* --- glassmorphism --- */
  const glass = settings.glass;
  attributes[`${HTML}glass`] = glass.enabled ? "1" : null;
  attributes[`${HTML}glass-blocks`] = glass.enabled && glass.onBlocks ? "1" : null;
  attributes[`${HTML}glass-posts`] = glass.enabled && glass.onPosts ? "1" : null;
  attributes[`${HTML}glass-nav`] = glass.enabled && glass.onNav ? "1" : null;
  attributes[`${HTML}glass-menus`] = glass.enabled && glass.onMenus ? "1" : null;
  if (glass.enabled) {
    variables["--rfs-glass-blur"] = `${glass.blur}px`;
    variables["--rfs-glass-alpha"] = (1 - glass.opacity / 100).toFixed(3);
    variables["--rfs-glass-border-alpha"] = (glass.borderOpacity / 100).toFixed(3);
    variables["--rfs-glass-shadow-alpha"] = (glass.shadow / 100).toFixed(3);
  }

  /* --- hide tweaks --- */
  const map: Array<[keyof Settings["tweaks"], string]> = [
    ["hideFooter", "hide-footer"],
    ["hideSidebar", "hide-sidebar"],
    ["hideAvatars", "hide-avatars"],
    ["hideNodeIcons", "hide-node-icons"],
    ["hideHeaderAlerts", "hide-header-alerts"],
    ["hideSubForums", "hide-subforums"],
    ["hidePrefixes", "hide-prefixes"],
    ["hideUnreadIndicators", "hide-unread"],
    ["headerSticky", "sticky-header"],
    ["hideUserBanners", "hide-user-banners"],
    ["hideStyleVariation", "hide-style-variation"],
    ["hideSignatures", "hide-signatures"],
    ["hideBreadcrumbs", "hide-breadcrumbs"],
    ["hideSectionLinks", "hide-section-links"],
    ["hideUserExtras", "hide-user-extras"],
    ["hideYourPosts", "hide-your-posts"],
    ["hidePostBg", "hide-post-bg"],
    ["hideConversations", "hide-conversations"],
    ["accentButtons", "accent-buttons"],
    ["accentThreadList", "accent-thread-list"],
    ["accentThreadsMeta", "accent-threads-meta"],
    ["accentPostAttribution", "accent-post-attribution"],
    ["accentNewBadge", "accent-new-badge"],
  ];
  for (const [key, attr] of map) {
    attributes[`${HTML}${attr}`] = settings.tweaks[key] ? "1" : null;
  }

  /* --- forum identity tweaks (port of Arizona Forum Styler) --- */
  attributes[`${HTML}remove-paints`] = settings.tweaks.removeUserPaints ? "1" : null;
  attributes[`${HTML}banned-style`] = settings.tweaks.bannedStyle === "default" ? null : settings.tweaks.bannedStyle;
  attributes[`${HTML}nav-search`] = settings.tweaks.navSearch === "default" ? null : settings.tweaks.navSearch;
  attributes[`${HTML}node-icon-status`] = settings.tweaks.nodeIconStatus === "default" ? null : settings.tweaks.nodeIconStatus;

  /* --- appearance --- */
  const ap = settings.appearance;
  // Attribute and CSS variable must clamp identically — the attribute is a
  // presence gate today, but its value stays truthful for any future use.
  const uiRadius = Math.min(24, Math.max(0, ap.radius));
  attributes[`${HTML}radius`] = ap.radiusMode === "custom" ? String(uiRadius) : null;
  if (ap.radiusMode === "custom") {
    variables["--rfs-ui-radius"] = `${uiRadius}px`;
  }
  attributes[`${HTML}btn-shape`] = ap.buttonShape === "theme" ? null : ap.buttonShape;
  attributes[`${HTML}btn-style`] = ap.buttonStyle === "theme" ? null : ap.buttonStyle;
  attributes[`${HTML}avatar-shape`] = ap.avatarShape === "theme" ? null : ap.avatarShape;
  attributes[`${HTML}avatar-scale`] =
    ap.avatarScale !== 100 ? `${Math.min(140, Math.max(80, ap.avatarScale))}%` : null;
  if (ap.avatarScale !== 100) {
    variables["--rfs-avatar-scale"] = (Math.min(140, Math.max(80, ap.avatarScale)) / 100).toFixed(3);
  }
  attributes[`${HTML}post-style`] = ap.postStyle === "theme" ? null : ap.postStyle;
  attributes[`${HTML}density`] = ap.threadDensity === "theme" ? null : ap.threadDensity;
  attributes[`${HTML}avatar-style`] = ap.avatarStyle === "default" ? null : ap.avatarStyle;
  attributes[`${HTML}logo-style`] = ap.logoStyle === "default" ? null : ap.logoStyle;

  /* --- fonts --- */
  const font = settings.font;
  attributes[`${HTML}font-scope`] = font.scope === "off" ? null : font.scope;
  if (font.scope !== "off") {
    // Unitless scale so CSS can compose it with the measured base size.
    variables["--rfs-font-scale"] = (font.size / 100).toFixed(3);
    variables["--rfs-font-weight"] = String(font.weight);
    variables["--rfs-font-line"] = String(font.lineHeight);
    variables["--rfs-font-track"] = `${font.letterSpacing}px`;
  }

  /* --- cursor --- */
  attributes[`${HTML}cursor`] = settings.cursor.enabled ? settings.cursor.preset : null;
  if (settings.cursor.enabled) {
    variables["--rfs-cursor-size"] = `${settings.cursor.size}px`;
  }

  /* --- effects --- */
  const fx = settings.effects;
  attributes[`${HTML}fx-snow`] = fx.snow ? "1" : null;
  attributes[`${HTML}fx-particles`] = fx.particles ? "1" : null;
  attributes[`${HTML}fx-fog`] = fx.fog ? "1" : null;
  attributes[`${HTML}fx-glow`] = fx.glow ? "1" : null;
  attributes[`${HTML}fx-gradient`] = fx.animatedGradient ? "1" : null;
  attributes[`${HTML}fx-lift`] = fx.hoverLift ? "1" : null;
  if (fx.snow || fx.particles || fx.fog) {
    variables["--rfs-fx-opacity"] = (fx.opacity / 100).toFixed(2);
  }

  /* --- page transitions --- */
  const tr = settings.transition;
  attributes[`${HTML}transition`] = tr.style === "none" ? null : tr.style;
  if (tr.style !== "none") {
    variables["--rfs-tr-duration"] = `${tr.duration}ms`;
    variables["--rfs-tr-stagger"] = `${tr.stagger}ms`;
  }

  /* --- accessibility --- */
  attributes[`${HTML}reduced-motion`] = isReducedMotion(settings) ? "1" : null;
  attributes[`${HTML}focus-ring`] = settings.accessibility.focusRing ? "1" : null;
  attributes[`${HTML}contrast-boost`] = settings.accessibility.contrastBoost ? "1" : null;
  attributes[`${HTML}reduce-transitions`] = settings.accessibility.reduceTransitions ? "1" : null;

  /* --- experimental --- */
  const exp = settings.experimental;
  attributes[`${HTML}crossfade`] = exp.enabled && exp.themeCrossfade ? "1" : null;
  attributes[`${HTML}pause-btn`] = exp.enabled && exp.pauseButton ? "1" : null;

  return { attributes, variables };
}

/** Effective reduced-motion state (force flag OR system preference). */
export function isReducedMotion(settings: Settings): boolean {
  if (settings.accessibility.reducedMotion === "force") return true;
  if (settings.accessibility.reduceTransitions) return true;
  if (settings.accessibility.reducedMotion === "auto") {
    return matchesReducedMotion();
  }
  return false;
}

function matchesReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Apply a plan to the live document. */
export function applyFlagPlan(plan: FlagPlan, host: StyleHost): void {
  for (const [name, value] of Object.entries(plan.attributes)) {
    host.setAttribute(name, value);
  }
  host.syncVars(plan.variables);
}

/** Convenience: build + apply. */
export function applyFlags(settings: Settings, host: StyleHost): void {
  applyFlagPlan(buildFlagPlan(settings), host);
}
