/**
 * Page transition module — enter animations for full loads and XenForo
 * Ajax navigations (fade / slideUp / scale / blur / cascade).
 *
 * Contract:
 *  - attributes come from flags.ts (data-rfs-transition + duration vars)
 *  - this module re-triggers the animation class on #top.p-pageWrapper
 *    after each navigation ("rfs-tr-enter", cascade: "rfs-tr-cascade").
 *  - cascade delays: inline animation-delay on up to 12 direct children
 *    (CSS cannot index children dynamically).
 *  - respects data-rfs-reduced-motion (no animation classes applied).
 *  - keyframes live in effects.css; classes/delays are fully removed when
 *    the feature is off or the module is destroyed.
 */
import type { ContentModule, ModuleContext } from "./types";
import { isReducedMotion } from "../flags";
import { logger } from "../../shared/logger";

const SCOPE = "transitions";
const ENTER_CLASS = "rfs-tr-enter";
const CASCADE_CLASS = "rfs-tr-cascade";
const MAX_CASCADE_CHILDREN = 12;

/** Дети, на которые мы вешали inline-задержки — чтобы аккуратно снять их. */
let delayedChildren: HTMLElement[] = [];
/** Обёрочка и ключ настроек, для которых анимация уже проиграна. */
let appliedWrapper: HTMLElement | null = null;
let appliedKey: string | null = null;

export const transitionsModule: ContentModule = {
  id: "transitions",

  init(_ctx: ModuleContext): void {
    /* no-op: классы навешиваются в apply() */
  },

  apply(ctx: ModuleContext): void {
    try {
      project(ctx, false);
    } catch (err) {
      logger.error(SCOPE, `apply failed: ${String(err)}`);
    }
  },

  onNavigate(ctx: ModuleContext): void {
    try {
      // force: даже если настройки не менялись, анимация должна проиграться
      // заново на новой странице (XF подменяет контент внутри обёртки).
      project(ctx, true);
    } catch (err) {
      logger.error(SCOPE, `onNavigate failed: ${String(err)}`);
    }
  },

  destroy(ctx: ModuleContext): void {
    disable(ctx.adapter.wrapper());
  },
};

/* ------------------------------ internals ------------------------------ */

function project(ctx: ModuleContext, force: boolean): void {
  const wrapper = ctx.adapter.wrapper();
  if (!wrapper) return;

  const tr = ctx.settings.transition;
  if (tr.style === "none" || isReducedMotion(ctx.settings)) {
    disable(wrapper);
    return;
  }

  const stagger = Math.round(Math.min(150, Math.max(0, tr.stagger)));
  const key = `${tr.style}|${stagger}`;
  const changed = force || wrapper !== appliedWrapper || key !== appliedKey;
  if (!changed) return; // идемпотентный apply: ничего не дёргаем повторно

  clearDelays();
  if (tr.style === "cascade") applyCascadeDelays(wrapper, stagger);
  restart(wrapper, tr.style === "cascade");
  appliedWrapper = wrapper;
  appliedKey = key;
}

/**
 * Перезапуск CSS-анимации: снять класс → форс-рефлоу → повесить снова.
 * Без промежуточного рефлоу браузер не перезапустит keyframes.
 */
function restart(wrapper: HTMLElement, cascade: boolean): void {
  wrapper.classList.remove(ENTER_CLASS, CASCADE_CLASS);
  void wrapper.offsetWidth;
  wrapper.classList.add(ENTER_CLASS);
  if (cascade) wrapper.classList.add(CASCADE_CLASS);
  void wrapper.offsetWidth;
}

/**
 * Задержки на прямых детях обёртки (не больше 12). Свои служебные узлы
 * (#rfs-bg-layer и т.п.) пропускаем — анимировать их бессмысленно.
 */
function applyCascadeDelays(wrapper: HTMLElement, stagger: number): void {
  const children: HTMLElement[] = [];
  for (const child of wrapper.children) {
    if (child instanceof HTMLElement && !child.id.startsWith("rfs-")) {
      children.push(child);
      if (children.length >= MAX_CASCADE_CHILDREN) break;
    }
  }
  children.forEach((child, i) => {
    child.style.animationDelay = `${i * stagger}ms`;
    delayedChildren.push(child);
  });
}

function clearDelays(): void {
  for (const child of delayedChildren) {
    if (child.isConnected) child.style.animationDelay = "";
  }
  delayedChildren = [];
}

/** Полное выключение: классы и задержки не должны остаться на странице. */
function disable(wrapper: HTMLElement | null): void {
  wrapper?.classList.remove(ENTER_CLASS, CASCADE_CLASS);
  if (appliedWrapper && appliedWrapper !== wrapper) {
    appliedWrapper.classList.remove(ENTER_CLASS, CASCADE_CLASS);
  }
  clearDelays();
  appliedWrapper = null;
  appliedKey = null;
}
