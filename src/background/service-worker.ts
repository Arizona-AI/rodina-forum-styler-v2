/**
 * Background service worker (MV3).
 *
 * Kept deliberately small — everything heavy runs in the content script or
 * extension pages. Responsibilities:
 *  - first-run hooks (onboarding, storage migration),
 *  - badge state reflecting the master toggle,
 *  - message relay for opening the dashboard.
 */
import { loadMeta, saveMeta, CURRENT_SCHEMA_VERSION, loadSettings } from "../settings/store";
import { logger } from "../shared/logger";

const SCOPE = "background";

async function handleInstalled(): Promise<void> {
  const meta = await loadMeta();
  if (meta.schemaVersion < CURRENT_SCHEMA_VERSION) {
    meta.schemaVersion = CURRENT_SCHEMA_VERSION;
  }
  if (!meta.installedAt) meta.installedAt = Date.now();
  meta.lastLaunchedAt = Date.now();
  await saveMeta(meta);
  logger.info(SCOPE, `installed/updated (onboarding=${meta.onboardingDone ? "done" : "pending"})`);
  // There is no separate options page — the whole panel lives in the popup,
  // so the onboarding wizard appears on the first popup open (options app).
  await updateBadge();
}

async function updateBadge(): Promise<void> {
  try {
    const settings = await loadSettings();
    const enabled = settings.master.enabled;
    await chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
    if (!enabled) {
      await chrome.action.setBadgeBackgroundColor({ color: "#6b7280" });
    }
  } catch (err) {
    logger.warn(SCOPE, `updateBadge failed: ${String(err)}`);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void handleInstalled().catch((err) => logger.error(SCOPE, String(err)));
});

chrome.runtime.onStartup?.addListener(() => {
  void updateBadge();
});

/** Keep the badge in sync when the toggle changes from any context. */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes["rfs.settings"]) return;
  void updateBadge();
});

chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
  if (message?.type === "rfs:update-badge") {
    void updateBadge().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
