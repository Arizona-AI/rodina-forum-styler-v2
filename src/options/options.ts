/**
 * Dashboard shell: sidebar navigation, hash routing, section rendering,
 * live settings sync and the PanelContext handed to every panel.
 *
 * Storage events are the single source of truth for change notification:
 * local writes go through the store, `chrome.storage.onChanged` fires, and
 * this shell re-syncs the visible rows in place (no re-render → focus and
 * scroll are preserved).
 */
import { h, icon, clear, type IconName } from "./ui/dom";
import { renderSettingsSection, type ControlHandlers, type SectionRender } from "./ui/controls";
import { showToast } from "./ui/toast";
import { confirmDialog, closeAllDialogs } from "./ui/modal";
import { SECTIONS, sectionById, type SectionDef } from "./sections";
import type { PanelContext, ToastKind } from "./panelContext";
import type { SectionId } from "../settings/schema";
import type { Settings } from "../types/settings";
import {
  loadSettings,
  saveSettings,
  updateSetting,
  resetSetting,
  resetGroup,
  subscribeSettings,
  loadMeta,
  saveMeta,
  validateSettings,
  resetAll as storeResetAll,
} from "../settings/store";
import { setLocale, detectLocale, t } from "../i18n/index";
import { setAtPath, deepClone } from "../shared/paths";
import { sanitizeId } from "../shared/validators";
import { resolveThemeById } from "../theme/resolve";
import { BUILTIN_THEMES } from "../theme/library";
import { extensionVersion } from "../shared/browser";
import { logger } from "../shared/logger";
import { renderDashboardPanel } from "./panels/dashboard";
import { renderAdvancedPanel } from "./panels/advanced";
import { renderThemesPanel } from "./panels/themes";
import { renderEditorPanel } from "./panels/editor";
import { renderIoPanel } from "./panels/io";
import { runOnboarding } from "./onboarding";

const SCOPE = "options";

/**
 * Popup mode: the panel is embedded in the action popup iframe
 * (src/popup/popup.html → options.html?popup=1). Layout adapts through
 * `:root[data-popup]` rules in options.css — the sidebar stays visible
 * instead of collapsing into a drawer at the popup's 800px width.
 */
const POPUP_MODE = new URLSearchParams(window.location.search).has("popup");
if (POPUP_MODE) document.documentElement.dataset.popup = "1";

type PanelRenderer = (root: HTMLElement, ctx: PanelContext) => void | (() => void);

/** Custom section renderers (kind: "custom" in sections.ts). */
const PANELS: Record<string, PanelRenderer> = {
  dashboard: renderDashboardPanel,
  themes: renderThemesPanel,
  editor: renderEditorPanel,
  io: renderIoPanel,
  advanced: renderAdvancedPanel,
};

/** Sidebar grouping labels (presentation only). */
const NAV_GROUPS: Array<{ before: SectionId; label: string }> = [
  { before: "dashboard", label: "Главное" },
  { before: "appearance", label: "Оформление форума" },
  { before: "performance", label: "Система" },
];

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

let current: Settings;
let activeSection: SectionDef | null = null;
let activeRender: SectionRender | null = null;
let activeCleanup: (() => void) | null = null;
let activeQuery = "";
const changeListeners = new Set<(settings: Settings) => void>();

const content = (): HTMLElement => document.getElementById("content") ?? document.body;

/* ------------------------------------------------------------------ *
 * PanelContext implementation
 * ------------------------------------------------------------------ */

async function updateOne(key: string, value: unknown): Promise<void> {
  try {
    const clean = key === "theme.activeId" ? (sanitizeId(value) ?? current.theme.activeId) : value;
    current = await updateSetting(key, clean);
  } catch (err) {
    logger.error(SCOPE, `update(${key}) failed: ${String(err)}`);
    showToast(t("error.storage"), "error");
    throw err;
  }
}

const ctx: PanelContext = {
  settings: () => current,

  update: (key, value) => updateOne(key, value),

  patch: async (changes) => {
    try {
      const next = deepClone(current) as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(changes)) {
        const clean = key === "theme.activeId" ? (sanitizeId(value) ?? current.theme.activeId) : value;
        setAtPath(next, key, clean);
      }
      current = validateSettings(next);
      await saveSettings(current);
    } catch (err) {
      logger.error(SCOPE, `patch failed: ${String(err)}`);
      showToast(t("error.storage"), "error");
      throw err;
    }
  },

  refresh: () => {
    if (activeSection) renderSection(activeSection.id);
  },

  toast: (message: string, kind?: ToastKind) => showToast(message, kind ?? "info"),

  confirm: async (message, confirmLabel) => {
    const result = await confirmDialog(
      message,
      confirmLabel ? { confirmLabel } : {},
    );
    return result === true;
  },

  openSection: (id) => {
    if (location.hash.slice(1) === id) renderSection(id);
    else location.hash = id;
  },

  onSettingsChange: (handler) => {
    changeListeners.add(handler);
    return () => changeListeners.delete(handler);
  },

  applyTheme: async (themeId) => {
    try {
      const theme = await resolveThemeById(themeId);
      const clean = sanitizeId(themeId) ?? "";
      if (!clean || theme.id !== clean) {
        showToast(t("error.themeApply"), "error");
        return;
      }
      const recent = [clean, ...current.theme.recent.filter((id) => id !== clean)].slice(0, 8);
      await ctx.patch({ "theme.activeId": clean, "theme.recent": recent });
      showToast(t("themes.applied"), "success");
    } catch (err) {
      logger.error(SCOPE, `applyTheme failed: ${String(err)}`);
      showToast(t("error.themeApply"), "error");
    }
  },

  resetAll: async (keepThemes) => {
    try {
      current = await storeResetAll(keepThemes);
      showToast(t("state.reset"), "success");
    } catch (err) {
      logger.error(SCOPE, `resetAll failed: ${String(err)}`);
      showToast(t("error.storage"), "error");
      throw err;
    }
  },
};

const handlers: ControlHandlers = {
  update: (key, value) => updateOne(key, value),
  reset: async (key) => {
    try {
      current = await resetSetting(key);
      showToast(t("state.reset"), "success");
    } catch (err) {
      logger.error(SCOPE, `reset(${key}) failed: ${String(err)}`);
      showToast(t("error.storage"), "error");
      throw err;
    }
  },
};

/* ------------------------------------------------------------------ *
 * Shell theme (dark / light / auto)
 * ------------------------------------------------------------------ */

const mediaLight = window.matchMedia("(prefers-color-scheme: light)");

function applyShellTheme(mode: Settings["appearance"]["shellTheme"]): void {
  const resolved = mode === "auto" ? (mediaLight.matches ? "light" : "dark") : mode;
  document.documentElement.dataset.shellTheme = resolved;
  document.documentElement.dataset.shellMode = mode;
  paintShellThemeBtn(mode);
}

function paintShellThemeBtn(mode: Settings["appearance"]["shellTheme"]): void {
  const btn = document.getElementById("shellThemeBtn");
  if (!btn) return;
  clear(btn);
  const iconName: IconName = mode === "light" ? "sun" : mode === "dark" ? "moon" : "contrast";
  btn.appendChild(icon(iconName, 17));
  const names: Record<string, string> = {
    dark: "Тёмная тема интерфейса",
    light: "Светлая тема интерфейса",
    auto: "Тема интерфейса как в системе",
  };
  btn.title = names[mode] ?? "";
  btn.setAttribute("aria-label", names[mode] ?? "");
}

function cycleShellTheme(): void {
  const order: Array<Settings["appearance"]["shellTheme"]> = ["dark", "light", "auto"];
  const next = order[(order.indexOf(current.appearance.shellTheme) + 1) % order.length] ?? "dark";
  void ctx.update("appearance.shellTheme", next);
  applyShellTheme(next);
}

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */

function buildNav(): void {
  const nav = document.getElementById("nav");
  if (!nav) return;
  clear(nav);

  for (const section of SECTIONS) {
    const group = NAV_GROUPS.find((g) => g.before === section.id);
    if (group) {
      nav.appendChild(h("div", { class: "nav-sep", text: group.label }));
    }
    const item = h("button", {
      type: "button",
      class: "nav-item",
      dataset: { section: section.id },
      ariaLabel: t(section.titleKey),
    }, [icon(section.id as IconName, 17), h("span", { text: t(section.titleKey) })]);
    item.addEventListener("click", () => {
      ctx.openSection(section.id);
      closeDrawer();
    });
    nav.appendChild(item);
  }
}

function markActiveNav(id: string): void {
  for (const el of document.querySelectorAll<HTMLElement>(".nav-item")) {
    const active = el.dataset.section === id;
    el.classList.toggle("is-active", active);
    if (active) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  }
}

function openDrawer(): void {
  document.getElementById("sidebar")?.classList.add("is-open");
  const scrim = document.getElementById("sidebarScrim");
  if (scrim) scrim.hidden = false;
  const toggle = document.getElementById("navToggle");
  toggle?.setAttribute("aria-expanded", "true");
}

function closeDrawer(): void {
  document.getElementById("sidebar")?.classList.remove("is-open");
  const scrim = document.getElementById("sidebarScrim");
  if (scrim) scrim.hidden = true;
  document.getElementById("navToggle")?.setAttribute("aria-expanded", "false");
}

/* ------------------------------------------------------------------ *
 * Section rendering
 * ------------------------------------------------------------------ */

function onHashChange(): void {
  const raw = location.hash.slice(1);
  const def = sectionById(raw as SectionId);
  if (!def) {
    // Unknown/empty hash → canonical dashboard location (no silent blank).
    history.replaceState(null, "", "#dashboard");
    renderSection("dashboard");
    return;
  }
  renderSection(def.id);
}

function renderSection(id: string): void {
  const def = sectionById(id as SectionId);
  if (!def) {
    logger.error(SCOPE, `unknown section: ${id}`);
    showToast(t("state.error"), "error");
    return;
  }

  closeAllDialogs();
  activeCleanup?.();
  activeCleanup = null;
  activeRender = null;
  activeSection = def;
  activeQuery = "";
  const searchInput = document.getElementById("searchInput") as HTMLInputElement | null;
  if (searchInput) {
    searchInput.value = "";
    searchInput.disabled = def.kind !== "settings";
  }
  markActiveNav(def.id);

  const root = content();
  clear(root);

  try {
    if (def.kind === "settings") {
      activeRender = renderSettingsSection(def, current, handlers);
      root.appendChild(activeRender.el);
      root.appendChild(sectionFooter(def));
      if (def.panel) {
        const panelRoot = h("div", { class: "rfs-section-panel" });
        root.appendChild(panelRoot);
        const cleanup = def.panel(panelRoot, ctx);
        if (typeof cleanup === "function") activeCleanup = cleanup;
      }
      activeRender.sync(current);
    } else {
      const renderer = PANELS[def.customId ?? def.id];
      if (!renderer) {
        logger.error(SCOPE, `no renderer for custom section ${def.id}`);
        root.appendChild(
          h("div", { class: "empty-state", text: `Раздел «${t(def.titleKey)}» не найден — обновите расширение.` }),
        );
        return;
      }
      const cleanup = renderer(root, ctx);
      if (typeof cleanup === "function") activeCleanup = cleanup;
    }
  } catch (err) {
    logger.error(SCOPE, `render ${def.id} failed: ${String(err)}`);
    root.appendChild(h("div", { class: "empty-state", text: t("state.error") }));
  }

  root.scrollTop = 0;
  window.scrollTo({ top: 0 });
}

/** Footer under schema sections: per-section reset with confirmation. */
function sectionFooter(def: SectionDef): HTMLElement {
  const groups = def.groups ?? [];
  const btn = h("button", { type: "button", class: "btn btn-ghost", text: t("action.resetSection") });
  btn.addEventListener("click", async () => {
    const ok = await confirmDialog(t("confirm.resetSection"), {
      confirmLabel: t("action.reset"),
    });
    if (ok !== true) return;
    try {
      for (const group of groups) current = await resetGroup(group);
      showToast(t("state.reset"), "success");
    } catch (err) {
      logger.error(SCOPE, `resetGroup failed: ${String(err)}`);
      showToast(t("error.storage"), "error");
    }
  });
  return h("div", { class: "rfs-section-footer" }, [btn]);
}

/* ------------------------------------------------------------------ *
 * Live sync + search
 * ------------------------------------------------------------------ */

function syncActive(): void {
  activeRender?.sync(current);
  applySearch();
}

function applySearch(): void {
  const root = content();
  const query = activeQuery.trim().toLowerCase();
  for (const group of root.querySelectorAll<HTMLElement>(".rfs-group")) {
    let visibleRows = 0;
    for (const row of group.querySelectorAll<HTMLElement>(".rfs-row")) {
      const hiddenByRule = row.classList.contains("is-hidden");
      const matches = query === "" || (row.textContent ?? "").toLowerCase().includes(query);
      const show = matches && !hiddenByRule;
      row.classList.toggle("is-filtered-out", !show);
      if (show) visibleRows += 1;
    }
    group.classList.toggle("is-filtered-out", visibleRows === 0);
  }
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  setLocale(detectLocale());
  current = await loadSettings();

  buildNav();

  const foot = document.getElementById("sidebarFoot");
  if (foot) {
    foot.appendChild(h("span", { text: `v${extensionVersion()}` }));
    foot.appendChild(h("span", { text: "Хранится только локально" }));
  }

  document.getElementById("shellThemeBtn")?.addEventListener("click", cycleShellTheme);
  document.getElementById("navToggle")?.addEventListener("click", () => {
    const sidebar = document.getElementById("sidebar");
    sidebar?.classList.contains("is-open") ? closeDrawer() : openDrawer();
  });
  document.getElementById("sidebarScrim")?.addEventListener("click", closeDrawer);

  const searchInput = document.getElementById("searchInput") as HTMLInputElement | null;
  searchInput?.addEventListener("input", () => {
    activeQuery = searchInput.value;
    applySearch();
  });

  window.addEventListener("hashchange", onHashChange);

  subscribeSettings((next) => {
    current = next;
    applyShellTheme(next.appearance.shellTheme);
    syncActive();
    for (const listener of changeListeners) {
      try {
        listener(next);
      } catch (err) {
        logger.error(SCOPE, `settings listener failed: ${String(err)}`);
      }
    }
  });

  applyShellTheme(current.appearance.shellTheme);
  mediaLight.addEventListener("change", () => {
    if (current.appearance.shellTheme === "auto") applyShellTheme("auto");
  });
  onHashChange();

  // First run → onboarding wizard (service worker opens the page for it).
  try {
    const meta = await loadMeta();
    if (!meta.onboardingDone) {
      const finished = await runOnboarding(ctx);
      if (finished) {
        meta.onboardingDone = true;
        await saveMeta(meta);
      }
    }
  } catch (err) {
    logger.error(SCOPE, `onboarding failed: ${String(err)}`);
  }
}

void main().catch((err) => {
  logger.error(SCOPE, `boot failed: ${String(err)}`);
  document.body.appendChild(h("div", { class: "empty-state", text: t("state.error") }));
});

// Expose for debugging in dev builds (no secrets, settings only).
declare global {
  interface Window {
    __rfsOptions?: { ctx: PanelContext; version: string; themeCount: number };
  }
}
window.__rfsOptions = { ctx, version: extensionVersion(), themeCount: BUILTIN_THEMES.length };
