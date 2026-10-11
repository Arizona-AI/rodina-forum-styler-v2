/**
 * Advanced section: diagnostics, live status from the forum tab, debug
 * report export, storage info and the reset ladder.
 *
 * Everything that talks to the forum goes through forumStatus helpers; every
 * destructive action requires an explicit confirmation.
 */
import { h, icon, clear } from "../ui/dom";
import { sectionHeader, renderGroupRows, groupLabel, type Row } from "../ui/controls";
import { showToast } from "../ui/toast";
import { confirmDialog } from "../ui/modal";
import { formatBytes, formatDateTime, downloadJson } from "../ui/format";
import type { PanelContext } from "../panelContext";
import type { ControlHandlers } from "../ui/controls";
import { sectionById } from "../sections";
import { t } from "../../i18n/index";
import { SETTINGS_SCHEMA, type SettingsGroup } from "../../settings/schema";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import { getAtPath } from "../../shared/paths";
import { storageBytesInUse, extensionVersion } from "../../shared/browser";
import { loadMeta } from "../../settings/store";
import { fetchContentStatus, fetchDebugReport, requestApplyNow, openForum } from "../forumStatus";
import { logger } from "../../shared/logger";
import type { ContentStatus } from "../../shared/messages";

const SCOPE = "advanced";

/** Groups that the "reset category" picker can target. */
const RESETTABLE_GROUPS: SettingsGroup[] = [
  "appearance",
  "background",
  "effects",
  "transition",
  "font",
  "cursor",
  "glass",
  "tweaks",
  "performance",
  "accessibility",
  "ai",
  "experimental",
];

function chip(text: string, kind?: "ok" | "warn" | "err"): HTMLElement {
  return h("span", { class: kind ? `chip is-${kind}` : "chip", text });
}

export function renderAdvancedPanel(root: HTMLElement, ctx: PanelContext): () => void {
  const section = sectionById("advanced");
  const el = h("section", { class: "rfs-section", dataset: { section: "advanced" } });
  if (section) el.appendChild(sectionHeader(section));

  /* ---------------- debug toggle (schema rows) ---------------- */
  const handlers: ControlHandlers = {
    update: (key, value) => ctx.update(key, value),
    reset: (key) => {
      const fallback = getAtPath(DEFAULT_SETTINGS, key);
      return ctx.patch({ [key]: fallback });
    },
  };
  const debugRows: Row[] = renderGroupRows(["advanced"], ctx.settings(), handlers);
  const debugCard = h("div", { class: "card" }, [
    h("h3", { class: "card-title" }, [icon("advanced", 16), h("span", { text: t("advanced.debug") })]),
    h("div", { class: "rfs-group-rows debug-rows" }, debugRows.map((row) => row.el)),
  ]);
  el.appendChild(debugCard);

  /* ---------------- live status ---------------- */
  const statusBody = h("div", { class: "status-body" });
  const statusCard = h("div", { class: "card" }, [
    h("h3", { class: "card-title" }, [icon("info", 16), h("span", { text: t("advanced.forumInfo") })]),
    statusBody,
  ]);

  const refreshBtn = h("button", { type: "button", class: "btn btn-secondary" }, [
    icon("refresh", 15), h("span", { text: "Обновить" }),
  ]);
  const applyNowBtn = h("button", { type: "button", class: "btn btn-primary" }, [
    icon("play", 15), h("span", { text: t("action.apply") }),
  ]);
  const openForumBtn = h("button", { type: "button", class: "btn btn-secondary" }, [
    icon("external", 15), h("span", { text: "Открыть форум" }),
  ]);
  const statusActions = h("div", { class: "card-actions" }, [refreshBtn, applyNowBtn, openForumBtn]);
  statusCard.appendChild(statusActions);
  el.appendChild(statusCard);

  function paintNoStatus(): void {
    clear(statusBody);
    statusBody.appendChild(
      h("p", { class: "status-empty", text: t("state.noForum") }),
    );
  }

  function paintStatus(status: ContentStatus): void {
    clear(statusBody);

    const summary = h("div", { class: "status-summary" }, [
      chip(status.enabled ? t("state.enabled") : t("state.disabled"), status.enabled ? "ok" : "err"),
      h("span", { class: "status-template", text: status.template }),
      status.xenforoVersion ? chip(`XenForo ${status.xenforoVersion}`) : null,
    ].filter((node): node is HTMLElement => node !== null));
    statusBody.appendChild(summary);

    // Modules
    statusBody.appendChild(
      h("h4", { class: "diag-title", text: t("advanced.modulesStatus") }),
    );
    const moduleList = h("div", { class: "diag-list" });
    for (const mod of status.modules) {
      moduleList.appendChild(
        h("div", { class: "diag-row" }, [
          h("code", { class: "diag-id", text: mod.id }),
          chip(!mod.active ? "выкл" : mod.ok ? "ок" : "ошибка", !mod.active ? undefined : mod.ok ? "ok" : "err"),
        ]),
      );
    }
    statusBody.appendChild(moduleList);

    // Selector health
    statusBody.appendChild(
      h("h4", { class: "diag-title", text: t("advanced.selectorStatus") }),
    );
    const selectorList = h("div", { class: "diag-list" });
    for (const item of status.selectorHealth) {
      selectorList.appendChild(
        h("div", { class: "diag-row" }, [
          h("code", { class: "diag-id", text: item.id }),
          item.found
            ? chip("найден", "ok")
            : chip("не найден", "err"),
          item.matched
            ? h("code", { class: "diag-match", text: item.matched })
            : null,
        ].filter((node): node is HTMLElement => node !== null)),
      );
    }
    statusBody.appendChild(selectorList);
  }

  async function refreshStatus(): Promise<void> {
    clear(statusBody);
    statusBody.appendChild(h("p", { class: "status-empty", text: t("state.loading") }));
    const status = await fetchContentStatus();
    if (status) paintStatus(status);
    else paintNoStatus();
  }

  refreshBtn.addEventListener("click", () => void refreshStatus());
  applyNowBtn.addEventListener("click", async () => {
    const ok = await requestApplyNow();
    if (ok) showToast(t("state.saved"), "success");
    else showToast(t("state.noForum"), "error");
  });
  openForumBtn.addEventListener("click", () => void openForum());

  /* ---------------- debug report + storage ---------------- */
  const reportInfo = h("p", { class: "card-note" });
  const reportBtn = h("button", { type: "button", class: "btn btn-secondary" }, [
    icon("download", 15), h("span", { text: t("advanced.debugReport") }),
  ]);
  reportBtn.addEventListener("click", async () => {
    const report = await fetchDebugReport();
    if (!report) {
      showToast(t("state.noForum"), "error");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadJson(`rfs-debug-${stamp}.json`, report);
    showToast(t("state.saved"), "success");
  });

  const storageCard = h("div", { class: "card" }, [
    h("h3", { class: "card-title" }, [icon("save", 16), h("span", { text: t("advanced.storage") })]),
    reportInfo,
    reportBtn,
  ]);
  el.appendChild(storageCard);

  /* ---------------- reset ladder ---------------- */
  const groupSelect = h("select", { class: "rfs-select", ariaLabel: t("advanced.resetCategory") });
  for (const group of RESETTABLE_GROUPS) {
    groupSelect.appendChild(h("option", { value: group }, [groupLabel(group)]));
  }
  const groupResetBtn = h("button", { type: "button", class: "btn btn-secondary" }, [
    icon("refresh", 15), h("span", { text: t("advanced.resetCategory") }),
  ]);
  groupResetBtn.addEventListener("click", async () => {
    const group = groupSelect.value as SettingsGroup;
    const ok = await confirmDialog(t("confirm.resetSection"), { confirmLabel: t("action.reset") });
    if (ok !== true) return;
    const patch: Record<string, unknown> = {};
    for (const def of SETTINGS_SCHEMA) {
      if (def.group !== group) continue;
      patch[def.key] = getAtPath(DEFAULT_SETTINGS, def.key);
    }
    try {
      await ctx.patch(patch);
      showToast(t("state.reset"), "success");
    } catch (err) {
      logger.error(SCOPE, `group reset failed: ${String(err)}`);
    }
  });

  const resetAllBtn = h("button", { type: "button", class: "btn btn-danger" }, [
    icon("trash", 15), h("span", { text: t("action.resetAll") }),
  ]);
  resetAllBtn.addEventListener("click", async () => {
    const ok = await confirmDialog(t("advanced.confirmResetAll"), {
      confirmLabel: t("action.resetAll"),
      danger: true,
    });
    if (ok !== true) return;
    try {
      await ctx.resetAll(true);
      ctx.refresh();
    } catch (err) {
      logger.error(SCOPE, `resetAll failed: ${String(err)}`);
    }
  });

  const resetEverythingBtn = h("button", { type: "button", class: "btn btn-danger" }, [
    icon("trash", 15), h("span", { text: "Сбросить всё и удалить мои темы" }),
  ]);
  resetEverythingBtn.addEventListener("click", async () => {
    const ok = await confirmDialog(t("advanced.confirmResetAllThemes"), {
      confirmLabel: t("action.resetAll"),
      danger: true,
    });
    if (ok !== true) return;
    try {
      await ctx.resetAll(false);
      ctx.refresh();
    } catch (err) {
      logger.error(SCOPE, `resetAll+themes failed: ${String(err)}`);
    }
  });

  el.appendChild(
    h("div", { class: "card" }, [
      h("h3", { class: "card-title" }, [icon("warning", 16), h("span", { text: "Сбросы" })]),
      h("div", { class: "reset-row" }, [groupSelect, groupResetBtn]),
      h("div", { class: "card-actions" }, [resetAllBtn, resetEverythingBtn]),
    ]),
  );

  /* ---------------- reactive pieces ---------------- */
  const unsubscribe = ctx.onSettingsChange((settings) => {
    for (const row of debugRows) row.sync(settings);
  });

  /* ---------------- initial async load ---------------- */
  void (async () => {
    try {
      const [bytes, meta] = await Promise.all([storageBytesInUse(), loadMeta()]);
      reportInfo.textContent =
        `${t("advanced.storageUsed", { size: formatBytes(bytes) })} · ` +
        `v${extensionVersion()} · схема v${meta.schemaVersion} · ` +
        `установлено ${formatDateTime(meta.installedAt)}`;
    } catch (err) {
      logger.error(SCOPE, `meta load failed: ${String(err)}`);
      reportInfo.textContent = `v${extensionVersion()}`;
    }
    await refreshStatus();
  })();

  root.appendChild(el);
  return () => unsubscribe();
}
