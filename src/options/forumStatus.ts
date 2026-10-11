/**
 * Helpers for talking to the content script from dashboard panels.
 *
 * Host permission is limited to the forum origin, so tab URLs are readable
 * for matching tabs only — exactly what we need, with no extra permission.
 */
import type { ContentStatus, DebugReport, RfsResponse } from "../shared/messages";
import { logger } from "../shared/logger";

const SCOPE = "forumStatus";

export const FORUM_ORIGIN = "https://forum.rodina-rp.com";
const FORUM_MATCH = `${FORUM_ORIGIN}/*`;

/** Ids of open tabs running on the forum (may be several). */
export async function forumTabIds(): Promise<number[]> {
  try {
    const tabs = await chrome.tabs.query({ url: FORUM_MATCH });
    return tabs
      .map((tab) => tab.id)
      .filter((id): id is number => typeof id === "number");
  } catch (err) {
    logger.warn(SCOPE, `tabs.query failed: ${String(err)}`);
    return [];
  }
}

/**
 * Ask the newest forum tab for its status.
 * Resolves `null` when no tab is open or the content script is not ready
 * (e.g. the anti-DDoS challenge page is still showing) — callers must
 * surface that state to the user instead of pretending everything is fine.
 */
export async function fetchContentStatus(): Promise<ContentStatus | null> {
  const ids = await forumTabIds();
  // Prefer the active tab; otherwise the last one (most recent).
  for (const id of [...ids].reverse()) {
    try {
      const response = (await chrome.tabs.sendMessage(id, { type: "status" })) as RfsResponse | undefined;
      if (response?.ok && response.status) return response.status;
    } catch {
      // Tab without an injected content script — try the next one.
    }
  }
  return null;
}

/** Request a full re-apply on the forum tab. Returns true when acknowledged. */
export async function requestApplyNow(): Promise<boolean> {
  const ids = await forumTabIds();
  for (const id of [...ids].reverse()) {
    try {
      const response = (await chrome.tabs.sendMessage(id, { type: "apply-now" })) as RfsResponse | undefined;
      if (response?.ok) return true;
    } catch {
      // try next tab
    }
  }
  return false;
}

/** Fetch the debug report from the forum tab (advanced panel export). */
export async function fetchDebugReport(): Promise<DebugReport | null> {
  const ids = await forumTabIds();
  for (const id of [...ids].reverse()) {
    try {
      const response = (await chrome.tabs.sendMessage(id, { type: "debug-report" })) as RfsResponse | undefined;
      if (response?.ok && response.report) return response.report;
    } catch {
      // try next tab
    }
  }
  return null;
}

/** Open (or focus) a forum tab — used by "Открыть форум" actions. */
export async function openForum(): Promise<void> {
  try {
    const ids = await forumTabIds();
    if (ids.length > 0) {
      const id = ids[ids.length - 1]!;
      await chrome.tabs.update(id, { active: true });
      const win = await chrome.tabs.get(id);
      if (typeof win.windowId === "number") await chrome.windows.update(win.windowId, { focused: true });
      return;
    }
  } catch (err) {
    logger.warn(SCOPE, `focus existing tab failed: ${String(err)}`);
  }
  await chrome.tabs.create({ url: FORUM_ORIGIN });
}
