/**
 * Selection link (port of Arizona Forum Styler) — a «Ссылка» button inside
 * the select-to-quote tooltip that copies a deep link to the highlighted
 * fragment using the native text-fragment syntax (#post-N:~:text=…).
 *
 * Contract:
 *  - tweaks.copySelectedLink gates the feature.
 *  - the button is injected into the quote tooltip whenever XenForo renders
 *    it (observer with rAF coalescing — the tooltip is transient).
 *  - the post id comes from the selection's owning message (data-content
 *    "post-N" or id="post-N"); without it the link still works page-wide.
 */
import type { ContentModule, ModuleContext } from "./types";
import { selectorUnion } from "../../forum/selectors";
import { logger } from "../../shared/logger";

const SCOPE = "selectionLink";

const BTN_CLASS = "rfs-copy-link";
const BTN_LABEL = "Ссылка";
const BTN_TITLE = "Скопировать ссылку на выделенный текст";
const COPIED_LABEL = "Скопировано!";
const COPIED_RESET_MS = 1500;

/** Pure URL builder (unit-tested): collapses whitespace, escapes the text. */
export function buildSelectionUrl(base: string, postId: string | null, text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const anchor = postId ? `#post-${postId}` : "";
  return `${base}${anchor}:~:text=${encodeURIComponent(clean)}`;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for non-secure contexts: a detached textarea + execCommand.
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "absolute";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
  } finally {
    area.remove();
  }
}

function resolvePostId(): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  let node: Node = selection.getRangeAt(0).commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement ?? node;
  const post = (node as Element).closest(selectorUnion(["post"]));
  if (!post) return null;
  const content = post.getAttribute("data-content");
  if (content?.startsWith("post-")) return content.slice("post-".length);
  const match = (post.getAttribute("id") ?? "").match(/post-(\d+)/);
  return match?.[1] ?? null;
}

/** Canonical share URL of the owning post (falls back to the page URL). */
function resolveBaseUrl(postId: string | null): string {
  const selection = window.getSelection();
  if (selection && postId && selection.rangeCount > 0) {
    let node: Node = selection.getRangeAt(0).commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement ?? node;
    const post = (node as Element).closest(selectorUnion(["post"]));
    const share = post?.querySelector<HTMLAnchorElement>(
      ".message-attribution-opposite a[href*='post-'], .message-attribution-main a[href*='post-']",
    );
    if (share?.href) {
      try {
        const url = new URL(share.href);
        url.hash = "";
        return `${url.origin}${url.pathname}${url.search}`;
      } catch {
        /* fall through to the page URL */
      }
    }
  }
  return `${location.origin}${location.pathname}${location.search}`;
}

function onCopyClick(btn: HTMLAnchorElement): void {
  const text = window.getSelection()?.toString() ?? "";
  if (!text.trim()) return;
  const postId = resolvePostId();
  const url = buildSelectionUrl(resolveBaseUrl(postId), postId, text);
  void copyText(url)
    .then(() => {
      const original = btn.dataset.rfsLabel ?? BTN_LABEL;
      btn.dataset.rfsLabel = original;
      btn.textContent = COPIED_LABEL;
      btn.classList.add("is-copied");
      window.setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove("is-copied");
      }, COPIED_RESET_MS);
    })
    .catch((err: unknown) => logger.error(SCOPE, `copy failed: ${String(err)}`));
}

function injectButton(tooltip: Element): void {
  if (tooltip.querySelector(`.${BTN_CLASS}`)) return;
  const container =
    tooltip.querySelector(".buttonGroup") ??
    tooltip.querySelector(".tooltip-content-inner") ??
    tooltip.querySelector(".tooltip-content");
  if (!container) return;

  const btn = document.createElement("a");
  btn.className = `button button--link ${BTN_CLASS}`;
  btn.href = "#";
  btn.title = BTN_TITLE;
  btn.textContent = BTN_LABEL;
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onCopyClick(btn);
  });

  const reply = container.querySelector(".js-replyClick");
  if (reply?.parentElement) reply.parentElement.insertBefore(btn, reply.nextSibling);
  else container.appendChild(btn);
}

/* ------------------------------- observer ------------------------------ */

let observer: MutationObserver | null = null;
let queued = false;

function refresh(): void {
  try {
    const tooltip = document.querySelector(".tooltip--selectToQuote, .tooltip[data-content='selectToQuote']");
    if (tooltip) injectButton(tooltip);
  } catch (err) {
    logger.error(SCOPE, `refresh failed: ${String(err)}`);
  }
}

function ensureObserver(): void {
  if (observer) return;
  observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      refresh();
    });
  });
  observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
}

function disconnectObserver(): void {
  observer?.disconnect();
  observer = null;
  queued = false;
}

export const selectionLinkModule: ContentModule = {
  id: "selectionLink",

  init(): void {
    /* no-op: кнопка появляется вместе с тултипом форума */
  },

  apply(_ctx: ModuleContext): void {
    try {
      if (_ctx.settings.tweaks.copySelectedLink) {
        refresh();
        ensureObserver();
      } else {
        disconnectObserver();
      }
    } catch (err) {
      logger.error(SCOPE, `apply failed: ${String(err)}`);
    }
  },

  destroy(): void {
    disconnectObserver();
  },
};
