/**
 * Logo module (port of Arizona Forum Styler) — forum logo restyles.
 *
 * Contract:
 *  - accent-static / accent-animated: flags.css paints the logo with a theme
 *    gradient through a mask; the mask url must reference the *original*
 *    image, and inline custom properties cannot carry url() (sanitizeCssValue
 *    rejects it) — so the mask rule is injected as generated CSS
 *    (rfs-dyn-logo) by this module.
 *  - custom: the img is visually replaced via content:url(<logoUrl>) — the
 *    <img src> attribute is untouched, so nothing has to be restored.
 *  - text-only logos (no <img>): accent styles fall back to a
 *    background-clip:text rule, also generated here (needs :has-free
 *    detection, which only JS can do).
 */
import type { ContentModule, ModuleContext } from "./types";
import { sanitizeUrl } from "../../shared/validators";
import { logger } from "../../shared/logger";

const SCOPE = "logo";
const DYN_ID = "rfs-dyn-logo";

const IMG_SELECTORS = ".p-header-logo img, .p-nav-brandLink img";
const LINK_SELECTORS = ".p-header-logo a, .p-nav-brandLink";

/** url(<quoted>) — JSON quoting keeps every URL character CSS-safe. */
function cssUrl(value: string): string {
  return `url(${JSON.stringify(value)})`;
}

function logoImg(): HTMLImageElement | null {
  return document.querySelector<HTMLImageElement>(IMG_SELECTORS);
}

function maskRule(style: "accent-static" | "accent-animated", src: string): string {
  return `
html[data-rfs-logo-style="${style}"] .p-header-logo img,
html[data-rfs-logo-style="${style}"] .p-nav-brandLink img {
  -webkit-mask-image: ${cssUrl(src)} !important;
  mask-image: ${cssUrl(src)} !important;
}
`;
}

function textFallbackRule(style: "accent-static" | "accent-animated"): string {
  const gradient =
    style === "accent-animated"
      ? "linear-gradient(270deg, var(--rfs-primary), var(--rfs-secondary), var(--rfs-primary))"
      : "linear-gradient(135deg, var(--rfs-primary), var(--rfs-secondary))";
  return `
html[data-rfs-logo-style="${style}"] ${LINK_SELECTORS} {
  background: ${gradient} !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  color: transparent !important;
}
`;
}

function customRule(url: string): string {
  return `
html[data-rfs-logo-style="custom"] ${IMG_SELECTORS} {
  content: ${cssUrl(url)} !important;
  transition: transform 0.2s ease, filter 0.2s ease !important;
}
`;
}

/* --------------------------- late-render retry -------------------------- */

let pendingObserver: MutationObserver | null = null;

function stopPendingRetry(): void {
  pendingObserver?.disconnect();
  pendingObserver = null;
}

/** The header may render after the first apply — watch until the img exists. */
function ensurePendingRetry(): void {
  if (pendingObserver) return;
  pendingObserver = new MutationObserver(() => {
    if (!logoImg()) return;
    stopPendingRetry();
    if (lastCtx) applyNow(lastCtx);
  });
  pendingObserver.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
}

let lastCtx: ModuleContext | null = null;

/* -------------------------------- pipeline ------------------------------ */

function applyNow(ctx: ModuleContext): void {
  const style = ctx.settings.appearance.logoStyle;
  if (style === "default") {
    stopPendingRetry();
    ctx.host.setDynamicCss(DYN_ID, null);
    return;
  }

  if (style === "custom") {
    stopPendingRetry();
    const url = sanitizeUrl(ctx.settings.appearance.logoUrl);
    ctx.host.setDynamicCss(DYN_ID, url ? customRule(url) : null);
    if (!url) logger.debug(SCOPE, "custom logo requested but logoUrl is empty/invalid");
    return;
  }

  const img = logoImg();
  if (!img) {
    ctx.host.setDynamicCss(DYN_ID, textFallbackRule(style));
    ensurePendingRetry();
    return;
  }
  const src = img.src || img.getAttribute("src") || "";
  ctx.host.setDynamicCss(DYN_ID, maskRule(style, src));
}

export const logoModule: ContentModule = {
  id: "logo",

  init(ctx: ModuleContext): void {
    lastCtx = ctx;
  },

  apply(ctx: ModuleContext): void {
    lastCtx = ctx;
    try {
      applyNow(ctx);
    } catch (err) {
      logger.error(SCOPE, `apply failed: ${String(err)}`);
    }
  },

  destroy(ctx: ModuleContext): void {
    stopPendingRetry();
    lastCtx = null;
    ctx.host.setDynamicCss(DYN_ID, null);
  },
};
