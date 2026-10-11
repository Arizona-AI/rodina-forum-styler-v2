/**
 * Page lifecycle observation.
 *
 * The forum must stay styled after:
 *  - full page loads (initial apply),
 *  - XenForo Ajax updates (verified XF events: xf:page-load-complete,
 *    xf:reinit, xf:layout — grepped from /js/xf/core-compiled.js),
 *  - history navigation (popstate),
 *  - any other DOM rewrite (attribute observer on <html>).
 *
 * Everything is event-driven; there are no polling timers.
 */
import { logger } from "../shared/logger";

export interface PageCallbacks {
  /** Fired when the forum navigated or replaced content. */
  onNavigate: () => void;
  /** Fired when one of our injected layers was removed by the page. */
  onLayerLost: (elementId: string) => void;
}

/** Ids of nodes we inject into the page; their removal triggers re-creation. */
export const LAYER_IDS = ["rfs-bg-layer", "rfs-bg-overlay", "rfs-fx-canvas", "rfs-pause"] as const;

const XF_PAGE_EVENTS = ["xf:page-load-complete", "xf:reinit", "xf:layout"] as const;

/**
 * Start observing. Returns a disposer (content scripts live for the page
 * lifetime, but tests and re-inits use it).
 */
export function observePage(callbacks: PageCallbacks): () => void {
  const handleNavigate = (): void => {
    const template = document.documentElement.getAttribute("data-template");
    logger.debug("observer", `navigate (template=${template ?? "?"})`);
    try {
      callbacks.onNavigate();
    } catch (err) {
      logger.error("observer", `onNavigate handler failed: ${String(err)}`);
    }
  };

  const eventListeners: Array<[EventTarget, string, EventListener]> = [];
  for (const name of XF_PAGE_EVENTS) {
    const listener = (): void => handleNavigate();
    document.addEventListener(name, listener);
    eventListeners.push([document, name, listener]);
  }
  const onPopState = (): void => handleNavigate();
  window.addEventListener("popstate", onPopState);

  /* Attribute observer: XF swaps data-template/data-content-key on soft nav. */
  const attrObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.attributeName === "data-template" || record.attributeName === "data-content-key") {
        handleNavigate();
        return;
      }
    }
  });
  attrObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-template", "data-content-key"] });

  /* Removal observer: detect the forum wiping our injected layers. */
  const layerObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const id = (node as Element).id;
        if ((LAYER_IDS as readonly string[]).includes(id)) {
          logger.warn("observer", `layer #${id} removed by page`);
          callbacks.onLayerLost(id);
        }
      }
    }
  });
  layerObserver.observe(document.body, { childList: true, subtree: true });

  return () => {
    for (const [target, name, listener] of eventListeners) target.removeEventListener(name, listener);
    window.removeEventListener("popstate", onPopState);
    attrObserver.disconnect();
    layerObserver.disconnect();
  };
}
