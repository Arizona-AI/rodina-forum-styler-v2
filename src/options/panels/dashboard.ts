/**
 * Dashboard home: master switch banner, statistics, current theme card,
 * quick actions and live forum-tab status.
 *
 * All state flows through PanelContext — the panel itself is read-only
 * except for the master toggle and random-theme action.
 */
import { h, icon, clear } from "../ui/dom";
import { sectionHeader } from "../ui/controls";
import { showToast } from "../ui/toast";
import { themePreview, themeChip, categoryLabel } from "../ui/themeBits";
import { formatBytes } from "../ui/format";
import type { PanelContext } from "../panelContext";
import { sectionById } from "../sections";
import { t } from "../../i18n/index";
import { getThemeCatalog, loadCustomThemes } from "../../theme/resolve";
import { BUILTIN_THEMES } from "../../theme/library";
import { storageBytesInUse, extensionVersion } from "../../shared/browser";
import { lookPatch, type LookPresetId } from "../../shared/lookPresets";
import { fetchContentStatus, openForum } from "../forumStatus";
import { logger } from "../../shared/logger";
import type { ContentStatus } from "../../shared/messages";

const SCOPE = "dashboard";

function statCard(value: string, label: string): { el: HTMLElement; setValue(v: string): void } {
  const valueEl = h("div", { class: "stat-value", text: value });
  const el = h("div", { class: "stat" }, [valueEl, h("div", { class: "stat-label", text: label })]);
  return { el, setValue: (v) => { valueEl.textContent = v; } };
}

export function renderDashboardPanel(root: HTMLElement, ctx: PanelContext): () => void {
  const section = sectionById("dashboard");
  const el = h("section", { class: "rfs-section", dataset: { section: "dashboard" } });
  if (section) el.appendChild(sectionHeader(section));

  /* ---------------- master banner ---------------- */
  const bannerStrong = h("strong");
  const bannerSpan = h("span");
  const masterInput = h("input", {
    class: "rfs-switch-input",
    attrs: { type: "checkbox" },
    ariaLabel: t("popup.toggle"),
  });
  const banner = h("div", { class: "master-banner" }, [
    h("div", { class: "master-banner-text" }, [bannerStrong, bannerSpan]),
    h("span", { class: "rfs-switch-wrap" }, [
      masterInput,
      h("span", { class: "rfs-switch", attrs: { "aria-hidden": "true" } }, [
        h("span", { class: "rfs-switch-knob" }),
      ]),
    ]),
  ]);
  masterInput.addEventListener("change", () => {
    void ctx.update("master.enabled", masterInput.checked).catch(() => {
      masterInput.checked = !masterInput.checked;
    });
  });

  function paintBanner(settings: ReturnType<PanelContext["settings"]>): void {
    const enabled = settings.master.enabled;
    banner.classList.toggle("is-off", !enabled);
    masterInput.checked = enabled;
    bannerStrong.textContent = enabled
      ? "Стилизация форума включена"
      : "Стилизация форума выключена";
    bannerSpan.textContent = enabled
      ? "Изменения применяются к вкладкам форума сразу"
      : "Форум отображается без изменений";
  }
  paintBanner(ctx.settings());
  el.appendChild(banner);

  /* ---------------- stats ---------------- */
  const statThemes = statCard("…", t("dashboard.builtinThemes"));
  const statCustom = statCard("…", t("dashboard.customThemes"));
  const statFavorites = statCard("…", t("dashboard.favorites"));
  const statStorage = statCard("…", t("dashboard.storage"));
  el.appendChild(
    h("div", { class: "stats-grid" }, [
      statThemes.el, statCustom.el, statFavorites.el, statStorage.el,
    ]),
  );

  /* ---------------- current theme card ---------------- */
  const previewBox = h("div", { class: "current-theme-preview" });
  const themeName = h("div", { class: "current-theme-name" });
  const themeDesc = h("div", { class: "current-theme-desc" });
  const themeChips = h("div", { class: "current-theme-chips" });

  const randomBtn = h("button", { type: "button", class: "btn btn-secondary" }, [
    icon("random", 15), h("span", { text: t("action.random") }),
  ]);
  randomBtn.addEventListener("click", async () => {
    try {
      const catalog = await getThemeCatalog();
      if (catalog.length === 0) {
        showToast(t("state.empty"), "error");
        return;
      }
      const pick = catalog[Math.floor(Math.random() * catalog.length)]!;
      await ctx.applyTheme(pick.id);
    } catch (err) {
      logger.error(SCOPE, `random theme failed: ${String(err)}`);
      showToast(t("error.themeApply"), "error");
    }
  });

  const toThemes = h("button", { type: "button", class: "btn btn-secondary", text: t("nav.themes") });
  toThemes.addEventListener("click", () => ctx.openSection("themes"));
  const toEditor = h("button", { type: "button", class: "btn btn-primary", text: t("nav.editor") });
  toEditor.addEventListener("click", () => ctx.openSection("editor"));

  el.appendChild(
    h("div", { class: "card current-theme-card" }, [
      h("h3", { class: "card-title" }, [icon("themes", 16), h("span", { text: t("dashboard.currentTheme") })]),
      h("div", { class: "current-theme-row" }, [
        previewBox,
        h("div", { class: "current-theme-info" }, [themeName, themeDesc, themeChips]),
      ]),
      h("div", { class: "card-actions" }, [randomBtn, toThemes, toEditor]),
    ]),
  );

  async function paintTheme(): Promise<void> {
    try {
      const catalog = await getThemeCatalog();
      const active = catalog.find((theme) => theme.id === ctx.settings().theme.activeId) ?? catalog[0];
      if (!active) {
        themeName.textContent = t("state.empty");
        themeDesc.textContent = "";
        clear(previewBox);
        clear(themeChips);
        return;
      }
      clear(previewBox);
      previewBox.appendChild(themePreview(active));
      themeName.textContent = active.name;
      themeDesc.textContent = active.description;
      clear(themeChips);
      themeChips.appendChild(themeChip(categoryLabel(active.category)));
      themeChips.appendChild(themeChip(active.mode === "dark" ? "Тёмная" : "Светлая"));
      const isCustom = !BUILTIN_THEMES.some((theme) => theme.id === active.id);
      if (isCustom) themeChips.appendChild(themeChip("Моя тема", "ok"));
    } catch (err) {
      logger.error(SCOPE, `paintTheme failed: ${String(err)}`);
      themeName.textContent = t("error.themeApply");
    }
  }
  void paintTheme();

  /* ---------------- quick look styles ---------------- */
  async function applyLook(kind: LookPresetId): Promise<void> {
    try {
      await ctx.patch(lookPatch(kind));
      showToast(kind === "arizona" ? t("styles.applied") : t("state.saved"), "success");
    } catch {
      /* patch() already reported the failure */
    }
  }

  const arizonaBtn = h("button", { type: "button", class: "btn btn-primary", text: t("styles.arizona") });
  arizonaBtn.addEventListener("click", () => void applyLook("arizona"));
  const resetLookBtn = h("button", { type: "button", class: "btn btn-secondary", text: t("styles.reset") });
  resetLookBtn.addEventListener("click", () => void applyLook("reset"));

  el.appendChild(
    h("div", { class: "card" }, [
      h("h3", { class: "card-title" }, [icon("sparkles", 16), h("span", { text: t("styles.title") })]),
      h("p", { class: "card-hint", text: t("styles.arizonaHint") }),
      h("div", { class: "card-actions" }, [arizonaBtn, resetLookBtn]),
    ]),
  );

  /* ---------------- quick actions ---------------- */
  const actions: Array<{ id: Parameters<PanelContext["openSection"]>[0]; label: string; iconName: Parameters<typeof icon>[0] }> = [
    { id: "background", label: t("popup.openBackground"), iconName: "background" },
    { id: "effects", label: t("nav.effects"), iconName: "effects" },
    { id: "glass", label: t("nav.glass"), iconName: "glass" },
    { id: "fonts", label: t("nav.fonts"), iconName: "fonts" },
    { id: "forumUi", label: t("nav.forumUi"), iconName: "forumUi" },
    { id: "io", label: t("nav.io"), iconName: "io" },
  ];
  const actionGrid = h("div", { class: "quick-grid" });
  for (const action of actions) {
    const btn = h("button", { type: "button", class: "quick-btn" }, [
      icon(action.iconName, 16),
      h("span", { text: action.label }),
    ]);
    btn.addEventListener("click", () => ctx.openSection(action.id));
    actionGrid.appendChild(btn);
  }
  el.appendChild(
    h("div", { class: "card" }, [
      h("h3", { class: "card-title" }, [icon("sparkles", 16), h("span", { text: t("dashboard.quickActions") })]),
      actionGrid,
    ]),
  );

  /* ---------------- forum status ---------------- */
  const statusChip = h("span", { class: "chip" });
  const statusText = h("span", { class: "status-text" });
  const refreshBtn = h("button", { type: "button", class: "btn btn-ghost icon-btn", attrs: { title: t("action.apply") } }, [
    icon("refresh", 16),
  ]);
  const openBtn = h("button", { type: "button", class: "btn btn-secondary" }, [
    icon("external", 15), h("span", { text: t("action.openForum") }),
  ]);
  openBtn.addEventListener("click", () => void openForum());
  refreshBtn.addEventListener("click", () => void paintStatus(true));

  el.appendChild(
    h("div", { class: "card status-card" }, [
      h("h3", { class: "card-title" }, [icon("info", 16), h("span", { text: "Форум" })]),
      h("div", { class: "status-row" }, [statusChip, statusText, h("span", { class: "status-actions" }, [refreshBtn, openBtn])]),
    ]),
  );

  async function paintStatus(userInitiated = false): Promise<void> {
    statusChip.className = "chip";
    statusChip.textContent = t("state.loading");
    statusText.textContent = "";
    const status: ContentStatus | null = await fetchContentStatus();
    if (!status) {
      statusChip.textContent = t("state.notConnected");
      statusChip.classList.add("is-warn");
      statusText.textContent = t("state.noForum");
      return;
    }
    statusChip.textContent = status.enabled ? t("state.enabled") : t("state.disabled");
    statusChip.classList.add(status.enabled ? "is-ok" : "is-err");
    const version = status.xenforoVersion ? `XenForo ${status.xenforoVersion}` : status.template;
    const modules = `${status.modules.filter((m) => m.active).length}/${status.modules.length}`;
    statusText.textContent = `${version} · ${t("dashboard.modules")}: ${modules}`;
    if (userInitiated) showToast(t("state.saved"), "success");
  }

  /* ---------------- reactive repaints ---------------- */
  const unsubscribe = ctx.onSettingsChange((settings) => {
    paintBanner(settings);
    statFavorites.setValue(String(settings.theme.favorites.length));
    void paintTheme();
  });

  /* ---------------- initial async loads ---------------- */
  void (async () => {
    try {
      const [custom, bytes] = await Promise.all([loadCustomThemes(), storageBytesInUse()]);
      statThemes.setValue(String(BUILTIN_THEMES.length));
      statCustom.setValue(String(custom.length));
      statFavorites.setValue(String(ctx.settings().theme.favorites.length));
      statStorage.setValue(formatBytes(bytes));
    } catch (err) {
      logger.error(SCOPE, `stats load failed: ${String(err)}`);
    }
    el.appendChild(
      h("div", { class: "dashboard-foot" }, [
        h("span", { class: "version-chip chip", text: `v${extensionVersion()}` }),
      ]),
    );
    await paintStatus();
  })();

  root.appendChild(el);
  return () => unsubscribe();
}
