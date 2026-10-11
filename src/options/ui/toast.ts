/**
 * Toast notifications for the dashboard.
 *
 * ARIA-live region so screen readers announce results; stacked, auto-dimming,
 * and deduplicated (the same message twice in a row replaces the old one).
 */
import { h, icon } from "./dom";
import { t } from "../../i18n/index";
import type { ToastKind } from "../panelContext";

const VISIBLE_MS: Record<ToastKind, number> = {
  info: 3200,
  success: 3200,
  error: 6500,
};

const ICONS: Record<ToastKind, "info" | "check" | "warning"> = {
  info: "info",
  success: "check",
  error: "warning",
};

let container: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (container && document.body.contains(container)) return container;
  container = h("div", {
    id: "rfs-toasts",
    class: "rfs-toasts",
    attrs: { role: "status", "aria-live": "polite" },
  });
  document.body.appendChild(container);
  return container;
}

function dismiss(el: HTMLElement): void {
  if (!el.isConnected) return;
  el.classList.add("is-leaving");
  const remove = (): void => el.remove();
  el.addEventListener("transitionend", remove, { once: true });
  // Safety net when transitions are disabled system-wide.
  window.setTimeout(remove, 500);
}

export function showToast(message: string, kind: ToastKind = "info"): void {
  if (!message.trim()) return;
  const root = ensureContainer();

  // Deduplicate identical visible messages.
  for (const existing of Array.from(root.children)) {
    if (existing instanceof HTMLElement && existing.dataset.message === message) {
      dismiss(existing);
    }
  }

  const closeBtn = h("button", {
    type: "button",
    class: "rfs-toast-close",
    ariaLabel: t("action.close"),
    text: "×",
  });
  const el = h("div", { class: `rfs-toast is-${kind}`, dataset: { message } }, [
    h("span", { class: "rfs-toast-icon" }, [icon(ICONS[kind], 16)]),
    h("span", { class: "rfs-toast-text" }, [message]),
    closeBtn,
  ]);
  closeBtn.addEventListener("click", () => dismiss(el));

  root.appendChild(el);
  window.setTimeout(() => dismiss(el), VISIBLE_MS[kind]);

  // Keep the stack short.
  while (root.children.length > 4) {
    const first = root.firstElementChild;
    if (first instanceof HTMLElement) dismiss(first);
    else break;
  }
}
