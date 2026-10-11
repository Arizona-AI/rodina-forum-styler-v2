/**
 * Navbar module (port of Arizona Forum Styler) — per-button hiding and
 * user-defined links in the XenForo navigation list.
 *
 * Contract:
 *  - parse: every nav link is reduced to a stable id (data-nav-id || href ||
 *    label) and the resulting list is persisted under rfs.navButtons, where
 *    the dashboard's navbar panel reads it (checkbox list).
 *  - hidden ids: the closest <li> gets inline display:none and a
 *    data-rfs-nav-hidden marker — only marker-owned styles are restored, so
 *    the forum's own hidden items are never touched.
 *  - custom items: <li class="rfs-custom-nav"> appended to every nav list,
 *    URL/name/newTab already validated by settings validation.
 */
import type { ContentModule, ModuleContext } from "./types";
import { storageSet } from "../../shared/browser";
import { resolveNavId, NAV_BUTTONS_KEY, type NavButton } from "../../shared/navButtons";
import { logger } from "../../shared/logger";

const SCOPE = "navbar";

const HIDDEN_MARK = "data-rfs-nav-hidden";
const CUSTOM_CLASS = "rfs-custom-nav";

function navLists(): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const el of document.querySelectorAll(".p-nav-list, .p-nav-links")) {
    if (el instanceof HTMLElement) found.push(el);
  }
  return found;
}

function navLinks(list: Element): HTMLAnchorElement[] {
  const primary = [...list.querySelectorAll<HTMLAnchorElement>(".p-navEl-link")];
  if (primary.length > 0) return primary;
  return [...list.querySelectorAll<HTMLAnchorElement>("li > a[href]")];
}

function linkLabel(link: HTMLAnchorElement): string {
  const span = link.querySelector("span");
  return ((span?.textContent ?? link.textContent) ?? "").trim();
}

function linkId(link: HTMLAnchorElement): string | null {
  return resolveNavId({ navId: link.getAttribute("data-nav-id"), href: link.getAttribute("href"), name: linkLabel(link) });
}

/** Collect + persist the visible buttons (only when the list actually changed). */
let lastParsed = "";
function parseAndPublish(): void {
  const seen = new Set<string>();
  const buttons: NavButton[] = [];
  for (const list of navLists()) {
    for (const link of navLinks(list)) {
      const id = linkId(link);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      buttons.push({ id, name: linkLabel(link) || id });
    }
    break; // one list is enough — duplicates share ids
  }
  const serialized = JSON.stringify(buttons);
  if (serialized === lastParsed) return;
  lastParsed = serialized;
  if (buttons.length === 0) return; // empty page (e.g. not rendered yet) — keep the previous list
  void storageSet(NAV_BUTTONS_KEY, buttons).catch((err: unknown) => {
    logger.error(SCOPE, `failed to persist parsed nav buttons: ${String(err)}`);
  });
}

function applyHiding(hiddenIds: readonly string[]): void {
  const hidden = new Set(hiddenIds);
  for (const list of navLists()) {
    for (const link of navLinks(list)) {
      const li = link.closest("li");
      if (!(li instanceof HTMLElement)) continue;
      const id = linkId(link);
      if (id && hidden.has(id)) {
        li.style.display = "none";
        li.setAttribute(HIDDEN_MARK, "1");
      } else if (li.getAttribute(HIDDEN_MARK) === "1") {
        li.style.removeProperty("display");
        li.removeAttribute(HIDDEN_MARK);
      }
    }
  }
}

function renderCustomItems(items: readonly { id: string; name: string; url: string; newTab: boolean }[]): void {
  document.querySelectorAll(`.${CUSTOM_CLASS}`).forEach((el) => el.remove());
  if (items.length === 0) return;

  for (const list of navLists()) {
    for (const item of items) {
      const li = document.createElement("li");
      li.className = CUSTOM_CLASS;

      const wrap = document.createElement("div");
      wrap.className = "p-navEl";

      const link = document.createElement("a");
      link.className = "p-navEl-link";
      link.href = item.url;
      if (item.newTab) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      const label = document.createElement("span");
      label.textContent = item.name;
      link.appendChild(label);

      wrap.appendChild(link);
      li.appendChild(wrap);
      list.appendChild(li);
    }
  }
}

function restoreHidden(): void {
  for (const li of document.querySelectorAll(`li[${HIDDEN_MARK}]`)) {
    if (!(li instanceof HTMLElement)) continue;
    li.style.removeProperty("display");
    li.removeAttribute(HIDDEN_MARK);
  }
}

export const navbarModule: ContentModule = {
  id: "navbar",

  init(): void {
    /* no-op: everything happens in apply() */
  },

  apply(ctx: ModuleContext): void {
    try {
      parseAndPublish();
      applyHiding(ctx.settings.tweaks.hiddenNavIds);
      renderCustomItems(ctx.settings.tweaks.customNavItems);
    } catch (err) {
      logger.error(SCOPE, `apply failed: ${String(err)}`);
    }
  },

  destroy(): void {
    try {
      restoreHidden();
      document.querySelectorAll(`.${CUSTOM_CLASS}`).forEach((el) => el.remove());
    } catch (err) {
      logger.error(SCOPE, `destroy failed: ${String(err)}`);
    }
  },
};
