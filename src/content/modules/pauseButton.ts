/**
 * Floating pause button (experimental) — a small unobtrusive control on the
 * forum page that toggles the master switch without opening the popup.
 *
 * Contract:
 *  #rfs-pause — fixed, bottom-right, pointer-events:auto
 *  Rendered only when settings.experimental.enabled && experimental.pauseButton
 *  (attribute data-rfs-pause-btn from flags.ts controls CSS visibility).
 *
 * Клик пишет master.enabled в chrome.storage.local; подписка subscribeSettings
 * в main.ts сама запустит apply/destroy — модуль НЕ вызывает apply напрямую.
 * Визуал (цвета, ховер, размеры) живёт в effects.css/flags.css; здесь только
 * позиционирование-гарантия, чтобы кнопка была кликабельна в любом случае.
 */
import type { ContentModule, ModuleContext } from "./types";
import type { Settings } from "../../types/settings";
import { logger } from "../../shared/logger";
import { loadSettings, saveSettings } from "../../settings/store";

const SCOPE = "pause";
const BTN_ID = "rfs-pause";
const LABEL_ON = "Приостановить оформление форума";
const LABEL_OFF = "Включить оформление форума";

/** Иконки строятся через createElementNS — разметка в DOM не попадает вообще. */
const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  return el;
}

function iconPause(): SVGElement {
  const svg = svgEl("svg", {
    width: "14", height: "14", viewBox: "0 0 14 14",
    fill: "currentColor", "aria-hidden": "true", focusable: "false",
  });
  svg.append(
    svgEl("rect", { x: "2", y: "1.5", width: "3.5", height: "11", rx: "1" }),
    svgEl("rect", { x: "8.5", y: "1.5", width: "3.5", height: "11", rx: "1" }),
  );
  return svg;
}

function iconPlay(): SVGElement {
  const svg = svgEl("svg", {
    width: "14", height: "14", viewBox: "0 0 14 14",
    fill: "currentColor", "aria-hidden": "true", focusable: "false",
  });
  svg.append(svgEl("path", { d: "M3 1.5 12 7 3 12.5Z" }));
  return svg;
}

/** Защита от двойного клика, пока тумблер пишет в storage. */
let toggling = false;

export const pauseButtonModule: ContentModule = {
  id: "pauseButton",

  init(_ctx: ModuleContext): void {
    /* no-op: кнопка создаётся в apply() */
  },

  apply(ctx: ModuleContext): void {
    try {
      const exp = ctx.settings.experimental;
      if (!(exp.enabled && exp.pauseButton)) {
        removeButton();
        return;
      }
      const btn = ensureButton();
      updateState(btn, ctx.settings);
    } catch (err) {
      logger.error(SCOPE, `apply failed: ${String(err)}`);
    }
  },

  destroy(): void {
    removeButton();
    toggling = false;
  },
};

/* ------------------------------ internals ------------------------------ */

function ensureButton(): HTMLButtonElement {
  const found = document.getElementById(BTN_ID);
  if (found instanceof HTMLButtonElement) return found;

  const btn = document.createElement("button");
  btn.id = BTN_ID;
  btn.type = "button";
  btn.classList.add("rfs-pause");
  // Позиционирование-гарантия; цвета/ховер — в styles/effects.css.
  btn.style.position = "fixed";
  btn.style.bottom = "16px";
  btn.style.right = "16px";
  btn.style.zIndex = "9999";
  btn.style.pointerEvents = "auto";
  btn.addEventListener("click", onClick);
  document.body.appendChild(btn);
  logger.debug(SCOPE, "button created");
  return btn;
}

function removeButton(): void {
  document.getElementById(BTN_ID)?.remove();
}

/** Иконка/подписи отражают состояние master.enabled. */
function updateState(btn: HTMLButtonElement, settings: Settings): void {
  const on = settings.master.enabled;
  btn.replaceChildren(on ? iconPause() : iconPlay());
  btn.title = on ? LABEL_ON : LABEL_OFF;
  btn.setAttribute("aria-label", on ? LABEL_ON : LABEL_OFF);
  // pressed = «оформление сейчас приостановлено».
  btn.setAttribute("aria-pressed", String(!on));
}

function onClick(): void {
  if (toggling) return;
  toggling = true;
  void (async (): Promise<void> => {
    try {
      const current = await loadSettings();
      const next: Settings = {
        ...current,
        master: { ...current.master, enabled: !current.master.enabled },
      };
      await saveSettings(next);
      // Хранилище само разошлёт событие (main перезапустит apply/destroy);
      // здесь лишь синхронизируем иконку, пока узел ещё жив.
      const btn = document.getElementById(BTN_ID);
      if (btn instanceof HTMLButtonElement) updateState(btn, next);
    } catch (err) {
      logger.error(SCOPE, `toggle failed: ${String(err)}`);
    } finally {
      toggling = false;
    }
  })();
}
