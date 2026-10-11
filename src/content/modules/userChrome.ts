/**
 * User identity chrome (port of Arizona Forum Styler) — three tightly related
 * DOM features keyed off settings:
 *
 *  1. tweaks.animatedAvatars — XenForo serves static previews from
 *     /avatars/s| m/…; the original animation lives at /avatars/o/….
 *     The original src is kept in data-rfs-orig-src and restored on disable.
 *  2. tweaks.bannedStyle === "icon" — a small ban badge is injected after
 *     every .username--banned link (SVG built via createElementNS, no HTML).
 *  3. appearance.avatarStyle paint-* — the owner's username color is written
 *     to the avatar's inline --rfs-avatar-paint; flags.css consumes it.
 *
 * Late-loading content (lazy avatars, tooltips) is covered by a scoped
 * subtree MutationObserver with rAF coalescing — it runs only while at least
 * one of the features is enabled and disconnects in destroy().
 */
import type { ContentModule, ModuleContext } from "./types";
import { logger } from "../../shared/logger";

const SCOPE = "userChrome";

const ORIG_SRC = "data-rfs-orig-src";
const ORIG_SRCSET = "data-rfs-orig-srcset";
const ANIM_CHECKED = "data-rfs-anim-checked";
const PAINT_DONE = "data-rfs-paint-done";
const PAINT_VAR = "--rfs-avatar-paint";
const ICON_CLASS = "rfs-banned-icon";
const BAN_TITLE = "Пользователь заблокирован на форуме\n(добавлено расширением Rodina Forum Styler)";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * "/…/avatars/s/123.gif" → "/…/avatars/o/123.gif".
 * Returns null when the src carries no sized-avatar segment.
 */
export function upgradeAvatarSrc(src: string): string | null {
  if (!/\/avatars\/[sml]\//i.test(src)) return null;
  return src.replace(/\/avatars\/[sml]\//i, "/avatars/o/");
}

/** Ban badge: circle with a diagonal bar, stroke inherits currentColor. */
function banIcon(): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "9");
  const bar = document.createElementNS(SVG_NS, "line");
  bar.setAttribute("x1", "5.6");
  bar.setAttribute("y1", "5.6");
  bar.setAttribute("x2", "18.4");
  bar.setAttribute("y2", "18.4");
  svg.append(circle, bar);
  return svg;
}

/* ------------------------------- observer ------------------------------ */

let observer: MutationObserver | null = null;
let refreshQueued = false;

function runtimeAlive(): boolean {
  try {
    return Boolean((globalThis as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function ensureObserver(): void {
  if (observer) return;
  const target = document.body ?? document.documentElement;
  observer = new MutationObserver((records) => {
    const added = records.some((r) => r.addedNodes.length > 0);
    if (!added || refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      if (!runtimeAlive()) return;
      try {
        refreshAll();
      } catch (err) {
        logger.error(SCOPE, `observer refresh failed: ${String(err)}`);
      }
    });
  });
  observer.observe(target, { childList: true, subtree: true });
}

function disconnectObserver(): void {
  observer?.disconnect();
  observer = null;
  refreshQueued = false;
}

/** Last applied snapshot — the observer refreshes against it. */
let activeCtx: ModuleContext | null = null;

function refreshAll(): void {
  if (!activeCtx) return;
  applyFeatures(activeCtx);
}

/* ------------------------------ features ------------------------------- */

function eachAvatar(): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  for (const el of document.querySelectorAll(".avatar, img.avatar, .message-avatar")) {
    if (el instanceof HTMLElement) seen.add(el);
  }
  return [...seen];
}

/** Swap /avatars/[sml]/ imgs (and background-images) to the original /o/. */
function updateAnimatedAvatars(): void {
  for (const avatar of eachAvatar()) {
    const img = avatar instanceof HTMLImageElement ? avatar : avatar.querySelector("img");
    const targets: HTMLElement[] = [];
    if (img) targets.push(img);
    else if (avatar.style.backgroundImage.includes("/avatars/")) targets.push(avatar);

    for (const el of targets) {
      if (el.getAttribute(ANIM_CHECKED) === "1") continue;
      el.setAttribute(ANIM_CHECKED, "1");

      const isImg = el instanceof HTMLImageElement;
      const src = isImg ? el.src : el.style.backgroundImage;
      const upgraded = src ? upgradeAvatarSrc(src) : null;
      if (!upgraded) continue;

      if (!el.hasAttribute(ORIG_SRC)) {
        el.setAttribute(ORIG_SRC, src);
        if (isImg && el instanceof HTMLImageElement && el.srcset) {
          el.setAttribute(ORIG_SRCSET, el.srcset);
        }
      }
      if (isImg && el instanceof HTMLImageElement) {
        el.src = upgraded;
        el.removeAttribute("srcset");
      } else {
        el.style.backgroundImage = upgraded;
      }
    }
  }
}

/** Restore original avatar sources (feature off / module destroyed). */
function restoreAnimatedAvatars(): void {
  for (const el of document.querySelectorAll(`[${ORIG_SRC}]`)) {
    const original = el.getAttribute(ORIG_SRC) ?? "";
    if (el instanceof HTMLImageElement) {
      el.src = original;
      const srcset = el.getAttribute(ORIG_SRCSET);
      if (srcset !== null) el.srcset = srcset;
      else el.removeAttribute("srcset");
    } else if (el instanceof HTMLElement) {
      el.style.backgroundImage = original;
    }
    el.removeAttribute(ORIG_SRC);
    el.removeAttribute(ORIG_SRCSET);
  }
  document.querySelectorAll(`[${ANIM_CHECKED}]`).forEach((el) => el.removeAttribute(ANIM_CHECKED));
}

function injectBannedIcons(): void {
  for (const el of document.querySelectorAll(".username--banned")) {
    const anchor = (el.closest("a") as HTMLElement | null) ?? (el as HTMLElement);
    const parent = anchor.parentElement;
    if (!parent) continue;
    if (parent.querySelector(`.${ICON_CLASS}`)) continue;

    const badge = document.createElement("span");
    badge.className = ICON_CLASS;
    badge.title = BAN_TITLE;
    badge.appendChild(banIcon());
    parent.insertBefore(badge, anchor.nextSibling);
  }
}

function removeBannedIcons(): void {
  document.querySelectorAll(`.${ICON_CLASS}`).forEach((el) => el.remove());
}

/**
 * Resolve the username element that owns an avatar/banner inside the same
 * content block (message, thread row, member header…). Never guesses with
 * the *current user's* nick — a wrong color is worse than no color.
 */
function findUsernameFor(target: Element): Element | null {
  const container = target.closest(".message, .structItem, .memberHeader, .tooltip, .menu");
  if (container) {
    const local = container.querySelector(".username, .userLink, [class*='username']");
    if (local && !target.contains(local)) return local;
  }
  const holder = target.closest("[data-user-id]") ?? target;
  const userId = holder.getAttribute("data-user-id");
  if (userId && /^\d+$/.test(userId)) {
    return document.querySelector(`[class*="username"][data-user-id="${userId}"]`);
  }
  return null;
}

function usernameColor(username: Element): string | null {
  const colored =
    username.querySelector('[class*="username--style"], [style*="color"], span, strong, b') ?? username;
  try {
    return window.getComputedStyle(colored).color || null;
  } catch {
    return null;
  }
}

function paintAvatars(): void {
  for (const avatar of document.querySelectorAll(".avatar")) {
    if (avatar.getAttribute(PAINT_DONE) === "1") continue;
    avatar.setAttribute(PAINT_DONE, "1");
    if (!(avatar instanceof HTMLElement)) continue;

    const username = findUsernameFor(avatar);
    if (!username) continue;
    const color = usernameColor(username);
    if (color) avatar.style.setProperty(PAINT_VAR, color);
  }
}

function clearPaints(): void {
  for (const avatar of document.querySelectorAll(`.avatar[${PAINT_DONE}]`)) {
    if (avatar instanceof HTMLElement) avatar.style.removeProperty(PAINT_VAR);
    avatar.removeAttribute(PAINT_DONE);
  }
}

/* ------------------------------- pipeline ------------------------------ */

function applyFeatures(ctx: ModuleContext): void {
  const { tweaks, appearance } = ctx.settings;
  const needAnim = tweaks.animatedAvatars;
  const needIcon = tweaks.bannedStyle === "icon";
  const needPaint = appearance.avatarStyle === "paint-accent" || appearance.avatarStyle === "paint-glow";

  if (needAnim) updateAnimatedAvatars();
  else restoreAnimatedAvatars();

  if (needIcon) injectBannedIcons();
  else removeBannedIcons();

  if (needPaint) paintAvatars();
  else clearPaints();

  if (needAnim || needIcon || needPaint) ensureObserver();
  else disconnectObserver();
}

export const userChromeModule: ContentModule = {
  id: "userChrome",

  init(ctx: ModuleContext): void {
    activeCtx = ctx;
  },

  apply(ctx: ModuleContext): void {
    activeCtx = ctx;
    try {
      applyFeatures(ctx);
    } catch (err) {
      logger.error(SCOPE, `apply failed: ${String(err)}`);
    }
  },

  onNavigate(ctx: ModuleContext): void {
    activeCtx = ctx;
  },

  destroy(): void {
    try {
      restoreAnimatedAvatars();
      removeBannedIcons();
      clearPaints();
    } catch (err) {
      logger.error(SCOPE, `destroy failed: ${String(err)}`);
    }
    disconnectObserver();
    activeCtx = null;
  },
};
