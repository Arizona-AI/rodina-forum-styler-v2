/**
 * First-run onboarding wizard.
 *
 * A modal overlay with fixed steps: welcome → features → theme → basics →
 * AI consent → finish. Returns `true` when the wizard was completed or
 * explicitly skipped (the caller then persists `onboardingDone`, so it never
 * re-opens on every dashboard load).
 */
import { h, icon, clear } from "./ui/dom";
import type { PanelContext } from "./panelContext";
import { t } from "../i18n/index";
import { getThemeCatalog } from "../theme/resolve";
import { SETTINGS_SCHEMA } from "../settings/schema";

/** Russian label for a schema setting (labels live in the schema itself). */
function labelFor(key: string): string {
  return SETTINGS_SCHEMA.find((def) => def.key === key)?.label ?? key;
}

interface Step {
  title: string;
  text: string;
  body?: (card: HTMLElement, ctx: PanelContext) => void;
}

function themeTile(
  theme: { id: string; name: string; tokens: { pageBg: string; primary: string; secondary: string } },
  ctx: PanelContext,
): HTMLElement {
  const tile = h("button", {
    type: "button",
    class: "onb-theme",
    ariaLabel: theme.name,
  }, [
    h("span", {
      class: "onb-theme-swatch",
      attrs: {
        style: `background:linear-gradient(135deg, ${theme.tokens.pageBg} 0%, ${theme.tokens.pageBg} 46%, ${theme.tokens.primary} 46%, ${theme.tokens.primary} 72%, ${theme.tokens.secondary} 72%)`,
      },
    }),
    h("span", { class: "onb-theme-name", text: theme.name }),
  ]);
  tile.addEventListener("click", () => {
    tile.classList.add("is-picked");
    void ctx.applyTheme(theme.id);
  });
  return tile;
}

function switchRow(label: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
  const input = h("input", {
    class: "rfs-switch-input",
    attrs: { type: "checkbox" },
    ariaLabel: label,
  });
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "onb-switch" }, [
    h("span", { class: "onb-switch-text", text: label }),
    h("span", { class: "rfs-switch-wrap" }, [
      input,
      h("span", { class: "rfs-switch", attrs: { "aria-hidden": "true" } }, [
        h("span", { class: "rfs-switch-knob" }),
      ]),
    ]),
  ]);
}

function buildSteps(ctx: PanelContext): Step[] {
  const settings = ctx.settings();
  return [
    {
      title: t("onboarding.welcomeTitle"),
      text: t("onboarding.welcomeText"),
    },
    {
      title: t("onboarding.featuresTitle"),
      text: "",
      body: (card) => {
        const list = h("ul", { class: "onboarding-list" });
        for (const key of [
          "onboarding.featureThemes",
          "onboarding.featureBackground",
          "onboarding.featureEffects",
          "onboarding.featureTweaks",
        ]) {
          list.appendChild(
            h("li", {}, [icon("check", 15), h("span", { text: t(key) })]),
          );
        }
        card.appendChild(list);
      },
    },
    {
      title: t("onboarding.themeTitle"),
      text: t("onboarding.themeText"),
      body: (card) => {
        const grid = h("div", { class: "onb-themes" });
        card.appendChild(grid);
        void getThemeCatalog().then((themes) => {
          // Freshness guard: the wizard may have moved on already.
          if (!grid.isConnected) return;
          for (const theme of themes.slice(0, 9)) {
            grid.appendChild(themeTile(theme, ctx));
          }
        });
      },
    },
    {
      title: t("onboarding.basicTitle"),
      text: t("onboarding.basicText"),
      body: (card) => {
        card.appendChild(
          switchRow(t("popup.toggle"), settings.master.enabled, (value) => {
            void ctx.update("master.enabled", value);
          }),
        );
        card.appendChild(
          switchRow(labelFor("glass.enabled"), settings.glass.enabled, (value) => {
            void ctx.update("glass.enabled", value);
          }),
        );
        card.appendChild(
          switchRow(labelFor("effects.snow"), settings.effects.snow, (value) => {
            void ctx.update("effects.snow", value);
          }),
        );
      },
    },
    {
      title: t("onboarding.aiTitle"),
      text: t("onboarding.aiText"),
      body: (card) => {
        card.appendChild(
          switchRow(t("onboarding.aiEnable"), settings.ai.enabled, (value) => {
            void ctx.update("ai.enabled", value);
          }),
        );
        card.appendChild(
          h("p", { class: "onboarding-text", text: t("ai.providerLocal") }),
        );
      },
    },
    {
      title: t("onboarding.finishTitle"),
      text: t("onboarding.finishText"),
    },
  ];
}

/**
 * Run the wizard. Resolves `true` when it should be marked done
 * (finish or explicit skip), `false` only if the DOM was torn down early.
 */
export function runOnboarding(ctx: PanelContext): Promise<boolean> {
  return new Promise((resolve) => {
    const steps = buildSteps(ctx);
    let index = 0;
    let settled = false;

    const finish = (markDone: boolean): void => {
      if (settled) return;
      settled = true;
      overlay.classList.remove("is-open");
      overlay.classList.add("is-leaving");
      const remove = (): void => overlay.remove();
      overlay.addEventListener("transitionend", remove, { once: true });
      window.setTimeout(remove, 400);
      resolve(markDone);
    };

    const dots = h("div", { class: "onboarding-steps", attrs: { "aria-hidden": "true" } });
    const title = h("h2", { class: "onboarding-title" });
    const text = h("p", { class: "onboarding-text" });
    const bodyBox = h("div", { class: "onboarding-body" });

    const skipBtn = h("button", { type: "button", class: "btn btn-ghost", text: t("action.skip") });
    const backBtn = h("button", { type: "button", class: "btn btn-secondary", text: t("action.back") });
    const nextBtn = h("button", { type: "button", class: "btn btn-primary", text: t("action.next") });

    const card = h("div", { class: "onboarding-card" }, [
      dots,
      title,
      text,
      bodyBox,
      h("div", { class: "onboarding-actions" }, [skipBtn, h("div", { class: "onb-actions-right" }, [backBtn, nextBtn])]),
    ]);
    const overlay = h("div", { class: "onboarding", attrs: { role: "dialog", "aria-modal": "true" } }, [card]);

    const renderStep = (): void => {
      const step = steps[index];
      if (!step) {
        finish(true);
        return;
      }
      clear(dots);
      steps.forEach((_, i) => {
        dots.appendChild(
          h("span", { class: `onboarding-dot${i === index ? " is-active" : i < index ? " is-done" : ""}` }),
        );
      });
      title.textContent = step.title;
      text.textContent = step.text;
      text.hidden = step.text === "";
      clear(bodyBox);
      step.body?.(bodyBox, ctx);
      backBtn.hidden = index === 0;
      skipBtn.hidden = index === steps.length - 1;
      nextBtn.textContent = index === steps.length - 1 ? t("action.done") : t("action.next");
      const focusTarget = card.querySelector<HTMLElement>("button:not([hidden])");
      focusTarget?.focus();
    };

    nextBtn.addEventListener("click", () => {
      index += 1;
      if (index >= steps.length) finish(true);
      else renderStep();
    });
    backBtn.addEventListener("click", () => {
      if (index > 0) {
        index -= 1;
        renderStep();
      }
    });
    skipBtn.addEventListener("click", () => finish(true));

    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") finish(true);
    };
    document.addEventListener("keydown", onKeydown, true);
    const observer = new MutationObserver(() => {
      if (!overlay.isConnected) {
        document.removeEventListener("keydown", onKeydown, true);
        observer.disconnect();
        if (!settled) resolve(false);
      }
    });

    document.body.appendChild(overlay);
    observer.observe(document.body, { childList: true });
    void overlay.offsetWidth;
    overlay.classList.add("is-open");
    renderStep();
  });
}
