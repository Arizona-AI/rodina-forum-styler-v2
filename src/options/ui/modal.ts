/**
 * Blocking dialogs: confirm, prompt and a generic info dialog.
 *
 * - Only the top dialog of the stack reacts to Escape / backdrop clicks.
 * - Focus moves into the dialog and returns to the opener on close.
 * - All text is assigned through textContent (no HTML from user data).
 */
import { h } from "./dom";
import { t } from "../../i18n/index";

interface DialogTask {
  el: HTMLElement;
  settle: (value: unknown) => void;
}

const stack: DialogTask[] = [];

function rootContainer(): HTMLElement {
  let root = document.getElementById("rfs-modal-root");
  if (!root) {
    root = h("div", { id: "rfs-modal-root" });
    document.body.appendChild(root);
  }
  return root;
}

function focusFirst(root: HTMLElement): void {
  const target = root.querySelector<HTMLElement>(
    "[data-autofocus], button, input, textarea, select",
  );
  target?.focus();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  const top = stack[stack.length - 1];
  if (!top) return;
  event.preventDefault();
  event.stopPropagation();
  top.settle(false);
}

interface ModalOptions {
  title: string;
  body: HTMLElement;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Third action button ("Delete"); resolves as `"alt"`. */
  altLabel?: string;
  danger?: boolean;
  /** Input mode: confirm resolves with the entered text, cancel with null. */
  promptMode?: boolean;
  promptValue?: string;
}

function openModal(opts: ModalOptions): Promise<unknown> {
  const opener =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  return new Promise<unknown>((resolveOuter) => {
    let settled = false;

    const cancelBtn = h("button", {
      type: "button",
      class: "btn btn-ghost",
      text: opts.cancelLabel ?? t("action.cancel"),
    });
    const confirmBtn = h("button", {
      type: "button",
      class: opts.danger ? "btn btn-danger" : "btn btn-primary",
      text: opts.confirmLabel ?? t("action.apply"),
      dataset: { autofocus: "true" },
    });
    const altBtn = opts.altLabel
      ? h("button", { type: "button", class: "btn btn-secondary", text: opts.altLabel })
      : null;

    let promptInput: HTMLInputElement | null = null;
    if (opts.promptMode) {
      promptInput = h("input", {
        class: "rfs-input",
        value: opts.promptValue ?? "",
        ariaLabel: opts.title,
        attrs: { spellcheck: "false" },
      });
    }

    const closeX = h("button", {
      type: "button",
      class: "rfs-modal-x",
      ariaLabel: t("action.close"),
      text: "×",
    });

    const card = h("div", {
      class: "rfs-modal-card",
      attrs: { role: "dialog", "aria-modal": "true", "aria-label": opts.title },
    }, [
      h("div", { class: "rfs-modal-head" }, [
        h("h3", { class: "rfs-modal-title" }, [opts.title]),
        closeX,
      ]),
      h("div", { class: "rfs-modal-body" }, [promptInput ?? opts.body]),
      h("div", { class: "rfs-modal-actions" }, [
        ...(altBtn ? [altBtn] : []),
        cancelBtn,
        confirmBtn,
      ]),
    ]);

    const overlay = h("div", { class: "rfs-modal-overlay" }, [card]);

    const settle = (value: unknown): void => {
      if (settled) return;
      settled = true;
      const idx = stack.findIndex((task) => task.el === overlay);
      if (idx >= 0) stack.splice(idx, 1);
      overlay.classList.remove("is-open");
      overlay.classList.add("is-leaving");
      const remove = (): void => overlay.remove();
      overlay.addEventListener("transitionend", remove, { once: true });
      window.setTimeout(remove, 400);
      if (stack.length === 0) document.removeEventListener("keydown", onKeydown, true);
      else focusFirst(stack[stack.length - 1]!.el);
      opener?.focus();
      resolveOuter(value);
    };

    const cancelValue = opts.promptMode ? null : false;
    cancelBtn.addEventListener("click", () => settle(cancelValue));
    closeX.addEventListener("click", () => settle(cancelValue));
    confirmBtn.addEventListener("click", () =>
      settle(opts.promptMode ? (promptInput?.value ?? "") : true),
    );
    altBtn?.addEventListener("click", () => settle("alt"));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) settle(cancelValue);
    });
    promptInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        settle(promptInput?.value ?? "");
      }
    });

    if (stack.length === 0) document.addEventListener("keydown", onKeydown, true);
    stack.push({ el: overlay, settle });
    rootContainer().appendChild(overlay);
    void overlay.offsetWidth; // force layout so the entry transition runs
    overlay.classList.add("is-open");
    focusFirst(card);
    if (promptInput) {
      promptInput.setSelectionRange(promptInput.value.length, promptInput.value.length);
    }
  });
}

/**
 * Blocking confirmation. Resolves `true` on confirm, `false` on cancel,
 * or `"alt"` when the optional third (destructive) button is pressed.
 */
export function confirmDialog(
  message: string,
  opts: { confirmLabel?: string; altLabel?: string; danger?: boolean } = {},
): Promise<boolean | "alt"> {
  return openModal({
    title: opts.danger ? t("action.resetAll") : t("action.apply"),
    body: h("p", { class: "rfs-modal-text" }, [message]),
    confirmLabel: opts.confirmLabel ?? t("action.apply"),
    ...(opts.altLabel ? { altLabel: opts.altLabel } : {}),
    ...(opts.danger !== undefined ? { danger: opts.danger } : {}),
  }) as Promise<boolean | "alt">;
}

/** Text prompt. Resolves `null` when cancelled. */
export function promptDialog(title: string, initialValue = ""): Promise<string | null> {
  return openModal({
    title,
    body: h("div"),
    confirmLabel: t("action.save"),
    promptMode: true,
    promptValue: initialValue,
  }) as Promise<string | null>;
}

/** Informational dialog with custom content; closes on confirm. */
export function openInfoDialog(
  title: string,
  body: HTMLElement,
  confirmLabel?: string,
): Promise<boolean> {
  return openModal({
    title,
    body,
    ...(confirmLabel ? { confirmLabel } : {}),
  }) as Promise<boolean>;
}

/** Close every open dialog (used when its section unmounts). */
export function closeAllDialogs(): void {
  while (stack.length > 0) {
    stack[stack.length - 1]!.settle(false);
  }
}

/** True while a modal is open (shell can gate keyboard shortcuts). */
export function isDialogOpen(): boolean {
  return stack.length > 0;
}
