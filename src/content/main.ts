/**
 * Content script entry point.
 *
 * Responsibilities:
 *  1. Detect a real forum page (skips the anti-DDoS challenge page).
 *  2. Load settings + resolve the active theme.
 *  3. Inject base CSS, theme variables, feature flags.
 *  4. Run content modules (background, effects, fonts, cursor, transitions…).
 *  5. Keep everything in sync: storage changes, forum navigations,
 *     system motion preferences, editor preview.
 *
 * Performance rules: no polling, one debounced settings pipeline, all heavy
 * work (canvas) paused when the tab is hidden.
 */
import baseCss from "./styles/base.css";
import chromeCss from "./styles/chrome.css";
import componentsCss from "./styles/components.css";
import flagsCss from "./styles/flags.css";
import glassCss from "./styles/glass.css";
import fontsCss from "./styles/fonts.css";
import effectsCss from "./styles/effects.css";

import { styleHost } from "./styleHost";
import { applyFlags, isReducedMotion } from "./flags";
import { loadSettings, subscribeSettings, CUSTOM_THEMES_KEY, EDITOR_DRAFT_KEY } from "../settings/store";
import type { Settings } from "../types/settings";
import { resolveActiveTokens } from "../theme/resolve";
import { compileThemeVariables } from "../theme/compile";
import type { ThemeTokens } from "../types/theme";
import { adapter } from "../forum/adapter";
import { observePage } from "../forum/observers";
import { logger } from "../shared/logger";
import { debounce } from "../shared/timing";
import { auditSelectorHealth } from "../forum/selectors";
import { onStorageChange, extensionVersion } from "../shared/browser";
import type { ContentModule, ModuleContext } from "./modules/types";
import type { ContentStatus, DebugReport, RfsRequest, RfsResponse } from "../shared/messages";
import { backgroundModule } from "./modules/backgroundLayer";
import { effectsCanvasModule } from "./modules/effectsCanvas";
import { fontModule } from "./modules/fonts";
import { cursorModule } from "./modules/cursor";
import { transitionsModule } from "./modules/transitions";
import { userChromeModule } from "./modules/userChrome";
import { navbarModule } from "./modules/navbar";
import { selectionLinkModule } from "./modules/selectionLink";
import { logoModule } from "./modules/logo";
import { variationSyncModule } from "./modules/variationSync";
import { pauseButtonModule } from "./modules/pauseButton";

const CONTENT_CSS = [baseCss, chromeCss, componentsCss, flagsCss, glassCss, fontsCss, effectsCss]
  .join("\n")
  .replace(/\n{3,}/g, "\n\n");

const MODULES: ContentModule[] = [
  backgroundModule,
  fontModule,
  cursorModule,
  effectsCanvasModule,
  transitionsModule,
  userChromeModule,
  navbarModule,
  selectionLinkModule,
  logoModule,
  variationSyncModule,
  pauseButtonModule,
];

const SCOPE = "content";

interface RuntimeState {
  settings: Settings;
  tokens: ThemeTokens;
  applyCount: number;
  lastApplyMs: number | null;
  initializedModules: Set<string>;
  activeModules: Set<string>;
}

let state: RuntimeState | null = null;
let moduleContext: ModuleContext | null = null;
const initialized = new Set<string>();

async function buildContext(settings: Settings): Promise<ModuleContext> {
  const tokens = await resolveActiveTokens(settings);
  return { settings, host: styleHost, adapter, tokens };
}

function safeApply(module: ContentModule, ctx: ModuleContext, phase: "init" | "apply" | "navigate" | "destroy"): boolean {
  try {
    if (phase === "init" && !initialized.has(module.id)) {
      module.init(ctx);
      initialized.add(module.id);
    } else if (phase === "apply") {
      module.apply(ctx);
    } else if (phase === "navigate") {
      module.onNavigate?.(ctx);
    } else if (phase === "destroy") {
      module.destroy?.(ctx);
      initialized.delete(module.id);
    }
    if (state && phase !== "destroy") state.activeModules.add(module.id);
    return true;
  } catch (err) {
    logger.error(SCOPE, `module ${module.id}.${phase} failed: ${String(err)}`);
    if (state) state.activeModules.delete(module.id);
    return false;
  }
}

/** Full (re)apply pipeline. Idempotent. */
async function applyAll(reason: string): Promise<void> {
  const started = performance.now();
  const settings = state ? state.settings : await loadSettings();
  logger.setEnabled(settings.advanced.debugMode);

  if (!settings.master.enabled) {
    logger.debug(SCOPE, `disable (${reason})`);
    for (const module of MODULES) {
      if (initialized.has(module.id) && moduleContext) safeApply(module, moduleContext, "destroy");
    }
    styleHost.setEnabled(false);
    if (state) {
      state.activeModules.clear();
      state.lastApplyMs = performance.now() - started;
    }
    return;
  }

  const ctx = await buildContext(settings);
  moduleContext = ctx;
  state = {
    settings,
    tokens: ctx.tokens,
    applyCount: (state?.applyCount ?? 0) + 1,
    lastApplyMs: null,
    initializedModules: initialized,
    activeModules: state?.activeModules ?? new Set(),
  };

  styleHost.setEnabled(true);
  styleHost.setBaseCss(CONTENT_CSS);
  styleHost.setThemeCss(compileThemeVariables(ctx.tokens));
  applyFlags(settings, styleHost);

  for (const module of MODULES) {
    safeApply(module, ctx, "init");
    safeApply(module, ctx, "apply");
  }

  state.lastApplyMs = performance.now() - started;
  logger.debug(SCOPE, `applied (${reason}) in ${state.lastApplyMs.toFixed(1)}ms, apply #${state.applyCount}`);
}

/** Debounced pipeline — collapses bursts of storage change events. */
const scheduleApply = debounce((reason: string) => {
  void applyAll(reason).catch((err) => logger.error(SCOPE, `apply failed: ${String(err)}`));
}, 90);

function onNavigate(): void {
  adapter.reset();
  if (!state || !state.settings.master.enabled) return;
  const ctx = moduleContext;
  if (ctx) {
    for (const module of MODULES) {
      if (initialized.has(module.id)) {
        try {
          module.onNavigate?.({ ...ctx, settings: state.settings, tokens: state.tokens });
        } catch (err) {
          logger.error(SCOPE, `module ${module.id}.onNavigate failed: ${String(err)}`);
        }
      }
    }
  }
  scheduleApply("navigate");
}

function onLayerLost(id: string): void {
  logger.warn(SCOPE, `restoring lost layer ${id}`);
  scheduleApply("layer-lost");
}

function buildStatus(): ContentStatus {
  const info = adapter.info();
  return {
    enabled: state?.settings.master.enabled ?? false,
    template: info.template,
    xenforoVersion: info.xenforoVersion,
    activeThemeId: state?.settings.theme.activeId ?? "unknown",
    modules: MODULES.map((m) => ({ id: m.id, active: initialized.has(m.id), ok: state?.activeModules.has(m.id) ?? false })),
    selectorHealth: auditSelectorHealth().map(({ id, found, matched }) => ({ id, found, matched })),
  };
}

async function buildDebugReport(): Promise<DebugReport> {
  const settings = state?.settings ?? (await loadSettings());
  const info = adapter.info();
  const summary: Record<string, unknown> = {};
  const flatten = (obj: unknown, prefix = ""): void => {
    if (obj === null || typeof obj !== "object") return;
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === "object" && !Array.isArray(value)) flatten(value, path);
      else summary[path] = value;
    }
  };
  flatten(settings);
  delete summary["ai.apiKey"];
  let storageBytes: number | null = null;
  try {
    storageBytes = await chrome.storage.local.getBytesInUse(null);
  } catch {
    /* storage may be unavailable in tests */
  }
  return {
    generatedAt: new Date().toISOString(),
    extensionVersion: extensionVersion(),
    userAgent: navigator.userAgent,
    url: location.href,
    forum: { template: info.template, xenforoVersion: info.xenforoVersion, loggedIn: info.loggedIn },
    status: buildStatus(),
    settingsSummary: summary,
    logs: logger.drain(),
    performance: {
      applyTimeMs: state?.lastApplyMs ?? null,
      styleBytes: CONTENT_CSS.length,
      storageBytes,
    },
  };
}

function listenForMessages(): void {
  chrome.runtime.onMessage.addListener((message: RfsRequest, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;
    const respond = (response: RfsResponse): void => sendResponse(response);
    switch (message.type) {
      case "status":
        respond({ ok: true, status: buildStatus() });
        return true;
      case "debug-report":
        void buildDebugReport()
          .then((report) => respond({ ok: true, report }))
          .catch((err) => respond({ ok: false, error: String(err) }));
        return true; // async response
      case "apply-now":
        void applyAll("message")
          .then(() => respond({ ok: true }))
          .catch((err) => respond({ ok: false, error: String(err) }));
        return true;
      default:
        return false;
    }
  });
}

function watchSystemMotion(): void {
  try {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (): void => {
      if (!state) return;
      styleHost.setAttribute("data-rfs-reduced-motion", isReducedMotion(state.settings) ? "1" : null);
    };
    query.addEventListener?.("change", handler);
  } catch {
    /* matchMedia unavailable — nothing to watch */
  }
}

async function boot(): Promise<void> {
  if (!adapter.isForumPage()) {
    logger.debug(SCOPE, "not a forum page yet (challenge or foreign document) — idling");
    return;
  }

  const settings = await loadSettings();
  logger.setEnabled(settings.advanced.debugMode);
  logger.info(SCOPE, `boot v${extensionVersion()} template=${adapter.info().template}`);

  state = {
    settings,
    tokens: await resolveActiveTokens(settings),
    applyCount: 0,
    lastApplyMs: null,
    initializedModules: initialized,
    activeModules: new Set(),
  };

  await applyAll("boot");

  observePage({ onNavigate, onLayerLost });

  subscribeSettings((next) => {
    if (!state) return;
    state.settings = next;
    logger.setEnabled(next.advanced.debugMode);
    scheduleApply("settings");
  });

  /* Theme catalog / preview changes also need a re-apply. */
  onStorageChange(CUSTOM_THEMES_KEY, () => scheduleApply("custom-themes"));
  onStorageChange(EDITOR_DRAFT_KEY, () => scheduleApply("editor-preview"));

  listenForMessages();
  watchSystemMotion();

  /* Expose a tiny introspection surface for the forum's own console. */
  (window as unknown as Record<string, unknown>).__RFS__ = {
    version: extensionVersion(),
    status: buildStatus,
    reapply: () => applyAll("manual"),
    settings: () => state?.settings ?? null,
  };
}

void boot().catch((err) => logger.error(SCOPE, `boot failed: ${String(err)}`));
