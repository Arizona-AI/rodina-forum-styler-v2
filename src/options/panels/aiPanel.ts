/**
 * AI section panel — the actual AI tools below the schema settings rows.
 *
 * Two providers, clearly labeled: the built-in local heuristic (offline,
 * NOT AI) and an OpenAI-compatible endpoint using the user's own key with
 * explicit consent. All results are validated before they can be applied.
 */
import { h, icon, clear } from "../ui/dom";
import { showToast } from "../ui/toast";
import type { PanelContext } from "../panelContext";
import { t } from "../../i18n/index";
import type { ThemeTokens } from "../../types/theme";
import { resolveActiveTokens, upsertCustomTheme } from "../../theme/resolve";
import { runAiTask, saveApiKey, loadApiKey, type ContrastIssue } from "../../ai/index";
import { detectModeMeta } from "./aiPanelHelpers";
import { logger } from "../../shared/logger";

const SCOPE = "aiPanel";

export function renderAiPanel(root: HTMLElement, ctx: PanelContext): void | (() => void) {
  const box = h("div", { class: "card ai-panel" });
  root.appendChild(box);

  let pendingTokens: ThemeTokens | null = null;
  let pendingName = "AI-тема";
  let disposed = false;

  /* ---------------- shared result area ---------------- */
  const resultSwatches = h("div", { class: "ai-swatches" });
  const resultNote = h("p", { class: "card-note" });
  const applyBtn = h("button", { type: "button", class: "btn btn-primary" }, [
    icon("check", 15), h("span", { text: t("ai.applyResult") }),
  ]);
  applyBtn.disabled = true;
  const resultBox = h("div", { class: "ai-result" }, [resultSwatches, resultNote, applyBtn]);
  resultBox.hidden = true;

  function showResult(tokens: ThemeTokens, note: string, name: string): void {
    pendingTokens = tokens;
    pendingName = name;
    clear(resultSwatches);
    for (const key of ["pageBg", "surface", "primary", "secondary", "accent", "text"] as const) {
      resultSwatches.appendChild(
        h("span", {
          class: "ai-swatch",
          attrs: { style: `background:${tokens[key]}`, title: `${key}: ${tokens[key]}` },
        }),
      );
    }
    resultNote.textContent = note;
    resultBox.hidden = false;
    applyBtn.disabled = false;
  }

  applyBtn.addEventListener("click", async () => {
    if (!pendingTokens) return;
    try {
      const meta = detectModeMeta(pendingTokens);
      const saved = await upsertCustomTheme({
        name: pendingName,
        description: "Создана с помощью инструментов панели",
        category: meta.category,
        mode: meta.mode,
        tokens: { ...pendingTokens },
      });
      await ctx.applyTheme(saved.id);
      resultBox.hidden = true;
      pendingTokens = null;
    } catch (err) {
      logger.error(SCOPE, `apply failed: ${String(err)}`);
      showToast(t("state.error"), "error");
    }
  });

  /* ---------------- empty state for disabled AI ---------------- */
  const disabledHint = h("div", { class: "empty-state" }, [
    h("p", { text: t("ai.needEnable") }),
  ]);

  /* ---------------- tools ---------------- */
  const providerBadge = h("span", { class: "chip" });
  const promptArea = h("textarea", {
    class: "rfs-input ai-prompt",
    attrs: { rows: "3", spellcheck: "false", placeholder: t("ai.generatorPlaceholder") },
    ariaLabel: t("ai.generatorPrompt"),
  }) as HTMLTextAreaElement;

  const generateBtn = h("button", { type: "button", class: "btn btn-primary" }, [
    icon("sparkles", 15), h("span", { text: t("ai.generate") }),
  ]);

  const generatorCard = h("div", { class: "card" }, [
    h("h3", { class: "card-title" }, [icon("sparkles", 16), h("span", { text: t("ai.generator") })]),
    h("label", { class: "card-note", text: t("ai.generatorPrompt") }),
    promptArea,
    h("div", { class: "card-actions" }, [generateBtn]),
  ]);

  generateBtn.addEventListener("click", () => {
    void run(generateBtn, async () => {
      const prompt = promptArea.value.trim();
      if (!prompt) {
        showToast("Опишите тему", "error");
        return;
      }
      const current = await resolveActiveTokens(ctx.settings());
      const result = await runAiTask("generate", { prompt, tokens: current });
      if (result.task !== "generate") return;
      const note = result.provider === "openai" ? t("ai.providerRemote") : t("ai.providerLocal");
      showResult(result.tokens, note, prompt.slice(0, 40));
    });
  });

  /* color assistant */
  const colorInput = h("input", {
    class: "rfs-color-swatch",
    attrs: { type: "color", value: "#d9204f" },
    ariaLabel: t("ai.assistant"),
  }) as HTMLInputElement;
  const harmonizeBtn = h("button", { type: "button", class: "btn btn-secondary" }, [
    icon("palette", 15), h("span", { text: t("ai.assistant") }),
  ]);
  const harmonySwatches = h("div", { class: "ai-swatches" });
  harmonizeBtn.addEventListener("click", () => {
    void run(harmonizeBtn, async () => {
      const result = await runAiTask("harmonize", { baseColor: colorInput.value });
      if (result.task !== "harmonize") return;
      clear(harmonySwatches);
      for (const value of [result.colors.accent, result.colors.secondary, result.colors.tertiary]) {
        harmonySwatches.appendChild(
          h("span", { class: "ai-swatch ai-swatch-lg", attrs: { style: `background:${value}`, title: value } }),
        );
      }
    });
  });
  const assistantCard = h("div", { class: "card" }, [
    h("h3", { class: "card-title" }, [icon("palette", 16), h("span", { text: t("ai.assistant") })]),
    h("p", { class: "card-note", text: t("ai.assistantHint") }),
    h("div", { class: "ai-inline" }, [colorInput, harmonizeBtn]),
    harmonySwatches,
  ]);

  /* accessibility check */
  const issuesBox = h("div", { class: "ai-issues" });
  const checkBtn = h("button", { type: "button", class: "btn btn-secondary" }, [
    icon("accessibility", 15), h("span", { text: t("ai.checkRun") }),
  ]);
  const improveBtn = h("button", { type: "button", class: "btn btn-primary" }, [
    icon("check", 15), h("span", { text: t("ai.improve") }),
  ]);
  checkBtn.addEventListener("click", () => {
    void run(checkBtn, async () => {
      const tokens = await resolveActiveTokens(ctx.settings());
      const result = await runAiTask("analyze", { tokens });
      if (result.task !== "analyze") return;
      clear(issuesBox);
      if (result.issues.length === 0) {
        issuesBox.appendChild(h("p", { class: "card-note is-ok-text", text: t("ai.noIssues") }));
      } else {
        issuesBox.appendChild(
          h("p", { class: "card-note is-warn-text", text: t("ai.issues", { count: result.issues.length }) }),
        );
        for (const issue of result.issues as ContrastIssue[]) {
          issuesBox.appendChild(
            h("div", { class: "contrast-row" }, [
              h("span", { class: "contrast-label", text: issue.label }),
              h("span", { class: "chip is-warn", text: `${issue.ratio.toFixed(1)} · ${issue.grade}` }),
            ]),
          );
        }
      }
    });
  });
  improveBtn.addEventListener("click", () => {
    void run(improveBtn, async () => {
      const tokens = await resolveActiveTokens(ctx.settings());
      const result = await runAiTask("improve", { tokens });
      if (result.task !== "improve") return;
      const note = result.fixedCount > 0
        ? `Исправлено пар: ${result.fixedCount}`
        : t("ai.noIssues");
      showResult(result.tokens, note, "Улучшенная тема");
    });
  });
  const checkCard = h("div", { class: "card" }, [
    h("h3", { class: "card-title" }, [icon("accessibility", 16), h("span", { text: t("ai.check") })]),
    h("div", { class: "card-actions" }, [checkBtn, improveBtn]),
    issuesBox,
  ]);

  /* remote settings */
  const keyInput = h("input", {
    class: "rfs-input",
    attrs: { type: "password", placeholder: t("ai.keyPlaceholder"), spellcheck: "false", autocomplete: "off" },
    ariaLabel: t("ai.keyLabel"),
  }) as HTMLInputElement;
  const saveKeyBtn = h("button", { type: "button", class: "btn btn-secondary" }, [
    icon("key", 15), h("span", { text: t("action.save") }),
  ]);
  saveKeyBtn.addEventListener("click", async () => {
    try {
      await saveApiKey(keyInput.value);
      keyInput.value = "";
      showToast(t("ai.keySaved"), "success");
    } catch (err) {
      logger.error(SCOPE, `save key failed: ${String(err)}`);
      showToast(t("state.error"), "error");
    }
  });
  const testBtn = h("button", { type: "button", class: "btn btn-primary" }, [
    icon("play", 15), h("span", { text: t("ai.testConnection") }),
  ]);
  const testResult = h("p", { class: "card-note" });
  testBtn.addEventListener("click", () => {
    void run(testBtn, async () => {
      const result = await runAiTask("testConnection", {});
      if (result.task !== "testConnection") return;
      if (result.result.ok) {
        testResult.textContent = t("ai.connectOk");
        testResult.className = "card-note is-ok-text";
      } else {
        testResult.textContent = t("ai.connectFail", { error: result.result.error ?? "?" });
        testResult.className = "card-note is-warn-text";
      }
    });
  });
  const remoteCard = h("div", { class: "card ai-remote" }, [
    h("h3", { class: "card-title" }, [icon("external", 16), h("span", { text: "Удалённый API" })]),
    h("p", { class: "card-note is-warn-text", text: t("ai.remoteWarning") }),
    h("div", { class: "ai-inline" }, [keyInput, saveKeyBtn]),
    h("div", { class: "card-actions" }, [testBtn]),
    testResult,
  ]);

  /* ---------------- helpers ---------------- */
  async function run(btn: HTMLButtonElement, task: () => Promise<void>): Promise<void> {
    if (btn.disabled) return;
    const original = btn.textContent;
    btn.disabled = true;
    try {
      await task();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(SCOPE, `task failed: ${message}`);
      showToast(message, "error");
    } finally {
      if (disposed) return;
      btn.disabled = false;
      if (original !== null) btn.textContent = original;
    }
  }

  /* ---------------- paint ---------------- */
  function paint(settings: ReturnType<PanelContext["settings"]>): void {
    clear(box);
    if (!settings.ai.enabled) {
      box.appendChild(disabledHint);
      return;
    }
    const openai = settings.ai.provider === "openai";
    providerBadge.textContent = openai ? t("ai.providerRemote") : t("ai.providerLocal");
    providerBadge.className = `chip ${openai ? "is-warn" : "is-ok"}`;
    box.appendChild(h("div", { class: "ai-head" }, [providerBadge]));
    box.appendChild(generatorCard);
    box.appendChild(assistantCard);
    box.appendChild(checkCard);
    if (openai) box.appendChild(remoteCard);
    box.appendChild(resultBox);
  }

  paint(ctx.settings());
  void loadApiKey()
    .then((key) => {
      if (key && !disposed) keyInput.placeholder = "•••••••• (ключ сохранён)";
    })
    .catch((err) => logger.debug(SCOPE, `loadApiKey: ${String(err)}`));

  const unsubscribe = ctx.onSettingsChange(paint);
  return () => {
    disposed = true;
    unsubscribe();
  };
}
