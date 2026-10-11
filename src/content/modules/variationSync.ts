/**
 * Style-variation sync (port of Arizona Forum Styler) — keeps XenForo's own
 * light/dark variation in step with the active theme.
 *
 * Contract:
 *  - opt-in: appearance.syncForumMode (default off).
 *  - target: dark theme background -> "default", light -> "alternate".
 *    Lightness is derived from the resolved tokens' page background, so
 *    custom themes and editor drafts need no extra metadata.
 *  - exactly one switch per page: the native toggle is clicked when it is
 *    rendered; otherwise a POST to /index.php?misc/style-variation is made
 *    with the page CSRF token, followed by a reload (account-level change —
 *    the reason the setting defaults to off).
 */
import type { ContentModule, ModuleContext } from "./types";
import { parseColor, luminance } from "../../shared/color";
import { logger } from "../../shared/logger";

const SCOPE = "variationSync";

/** Pure mapping (unit-tested): page background -> XenForo variation id. */
export function targetVariation(pageBg: string): "default" | "alternate" {
  const rgb = parseColor(pageBg);
  if (!rgb) return "default";
  return luminance(rgb) >= 0.5 ? "alternate" : "default";
}

/** Guard against double-switching while the page is reloading. */
let switching = false;

function findToggleLink(target: string): HTMLAnchorElement | null {
  for (const el of document.querySelectorAll<HTMLAnchorElement>(
    "a.js-styleVariationsLink, a[data-xf-click='style-variation'], a[href*='misc/style-variation']",
  )) {
    const href = el.getAttribute("href") ?? "";
    const variation =
      el.getAttribute("data-variation") ?? href.match(/variation=(\w+)/)?.[1] ?? "";
    if (variation === target) return el;
  }
  return null;
}

function fetchCsrf(): string | null {
  return (
    document.documentElement.getAttribute("data-csrf") ??
    document.querySelector<HTMLInputElement>('input[name="_xfToken"]')?.value ??
    document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.getAttribute("content") ??
    null
  );
}

function switchViaApi(target: string): void {
  const csrf = fetchCsrf();
  if (!csrf || switching) return;
  switching = true;

  const body = new FormData();
  body.append("variation", target);
  body.append("_xfResponseType", "json");
  body.append("_xfWithData", "1");
  body.append("_xfRequestUri", location.pathname + location.search);
  body.append("_xfToken", csrf);

  fetch("/index.php?misc/style-variation", {
    method: "POST",
    body,
    headers: { "X-Requested-With": "XMLHttpRequest" },
  })
    .then(() => location.reload())
    .catch((err: unknown) => {
      switching = false;
      logger.error(SCOPE, `fallback variation switch failed: ${String(err)}`);
    });
}

function performSync(ctx: ModuleContext): void {
  if (!ctx.settings.appearance.syncForumMode) return;

  const target = targetVariation(ctx.tokens.pageBg);
  const current = document.documentElement.getAttribute("data-style-variation");
  if (current === target) return;
  if (switching) return;

  const link = findToggleLink(target);
  if (link) {
    logger.debug(SCOPE, `clicking native variation toggle for "${target}"`);
    switching = true;
    link.click();
    return;
  }

  if (current) {
    logger.debug(SCOPE, `no toggle link for "${target}", switching via API`);
    switchViaApi(target);
  }
}

export const variationSyncModule: ContentModule = {
  id: "variationSync",

  init(): void {
    /* no-op */
  },

  apply(ctx: ModuleContext): void {
    try {
      performSync(ctx);
    } catch (err) {
      logger.error(SCOPE, `apply failed: ${String(err)}`);
    }
  },

  destroy(): void {
    switching = false;
  },
};
