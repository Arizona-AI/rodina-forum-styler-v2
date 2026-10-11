/**
 * Navbar panel — appended under the «Интерфейс форума» schema rows.
 *
 * Two tools (port of Arizona Forum Styler):
 *  1. per-button hiding — checkboxes over the list the content script
 *     publishes under rfs.navButtons (live via storage subscription);
 *  2. custom items — name/url/newTab links appended to the forum navbar;
 *     validation and the 10-item cap are enforced by settings validation,
 *     the panel only produces candidate values.
 *
 * Everything goes through PanelContext — validation, live sync to open
 * forum tabs and toast feedback come for free.
 */
import { h, icon, clear } from "../ui/dom";
import type { PanelContext } from "../panelContext";
import { t } from "../../i18n/index";
import { storageGet, onStorageChange } from "../../shared/browser";
import { sanitizeLabel, sanitizeUrl } from "../../shared/validators";
import { NAV_BUTTONS_KEY, type NavButton } from "../../shared/navButtons";
import type { CustomNavItem } from "../../types/settings";
import { logger } from "../../shared/logger";

const SCOPE = "navbarPanel";
const MAX_ITEMS = 10;

export function renderNavbarPanel(root: HTMLElement, ctx: PanelContext): () => void {
  const wrap = h("div", { class: "card navbar-panel" });
  root.appendChild(wrap);
  wrap.appendChild(
    h("h3", { class: "card-title" }, [icon("forumUi", 16), h("span", { text: t("navbar.title") })]),
  );
  wrap.appendChild(h("p", { class: "card-note", text: t("navbar.description") }));

  /* ---------------- header buttons (hide per button) ---------------- */

  const buttonsBox = h("div", { class: "navbar-list" });
  const buttonsHint = h("p", { class: "card-note", text: t("navbar.buttonsHint") });
  wrap.append(buttonsHint, buttonsBox);

  function renderButtons(): void {
    clear(buttonsBox);
    const hidden = new Set(ctx.settings().tweaks.hiddenNavIds);
    if (buttons.length === 0) {
      buttonsBox.appendChild(h("div", { class: "empty-state" }, [h("p", { text: t("navbar.empty") })]));
      return;
    }
    for (const btn of buttons) {
      const box = h("input", { class: "navbar-check", attrs: { type: "checkbox" } }) as HTMLInputElement;
      box.checked = hidden.has(btn.id);
      box.addEventListener("change", () => {
        const next = new Set(ctx.settings().tweaks.hiddenNavIds);
        if (box.checked) next.add(btn.id);
        else next.delete(btn.id);
        void ctx.update("tweaks.hiddenNavIds", [...next]);
      });
      buttonsBox.appendChild(
        h("label", { class: "navbar-item", title: btn.id }, [
          box,
          h("span", { class: "navbar-item-name", text: btn.name }),
        ]),
      );
    }
  }

  let buttons: NavButton[] = [];
  async function loadButtons(): Promise<void> {
    try {
      const stored = await storageGet<unknown>(NAV_BUTTONS_KEY);
      buttons = Array.isArray(stored)
        ? stored
            .filter(
              (entry): entry is NavButton =>
                entry !== null &&
                typeof entry === "object" &&
                typeof (entry as NavButton).id === "string" &&
                typeof (entry as NavButton).name === "string",
            )
            .slice(0, 40)
        : [];
    } catch (err) {
      logger.error(SCOPE, `loadButtons failed: ${String(err)}`);
      buttons = [];
    }
    renderButtons();
  }
  void loadButtons();
  const unsubscribeNav = onStorageChange(NAV_BUTTONS_KEY, () => void loadButtons());

  /* ---------------- custom items (add / remove) ---------------- */

  const itemsBox = h("div", { class: "navbar-list" });
  const nameInput = h("input", {
    class: "rfs-input",
    attrs: { type: "text", maxlength: "40" },
    placeholder: t("navbar.name"),
    ariaLabel: t("navbar.name"),
  }) as HTMLInputElement;
  const urlInput = h("input", {
    class: "rfs-input",
    attrs: { type: "url", maxlength: "2048" },
    placeholder: t("navbar.url"),
    ariaLabel: t("navbar.url"),
  }) as HTMLInputElement;
  const newTabBox = h("input", { class: "navbar-check", attrs: { type: "checkbox", id: "rfs-nav-newtab" } }) as HTMLInputElement;
  const addBtn = h("button", { type: "button", class: "btn btn-primary" }, [
    icon("plus", 15),
    h("span", { text: t("navbar.add") }),
  ]);

  function renderItems(): void {
    clear(itemsBox);
    const items = ctx.settings().tweaks.customNavItems;
    for (const item of items) {
      const remove = h("button", { type: "button", class: "btn btn-ghost icon-btn", title: t("action.delete"), ariaLabel: t("action.delete") }, [
        icon("trash", 15),
      ]);
      remove.addEventListener("click", () => {
        void ctx
          .update(
            "tweaks.customNavItems",
            ctx.settings().tweaks.customNavItems.filter((other) => other.id !== item.id),
          )
          .then(() => ctx.toast(t("navbar.itemRemoved")));
      });
      itemsBox.appendChild(
        h("div", { class: "navbar-item" }, [
          h("span", { class: "navbar-item-name", text: item.name }),
          h("span", { class: "navbar-item-url", text: item.url, title: item.url }),
          item.newTab ? h("span", { class: "chip", text: t("navbar.newTabShort") }) : null,
          remove,
        ]),
      );
    }
  }

  function addItem(): void {
    const current = ctx.settings().tweaks.customNavItems;
    if (current.length >= MAX_ITEMS) {
      ctx.toast(t("navbar.limit"), "error");
      return;
    }
    const name = sanitizeLabel(nameInput.value, 40);
    const url = sanitizeUrl(urlInput.value);
    nameInput.classList.toggle("is-invalid", !name);
    urlInput.classList.toggle("is-invalid", !url);
    if (!name || !url) {
      ctx.toast(t("state.error"), "error");
      return;
    }
    const item: CustomNavItem = {
      id: `nav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      url,
      newTab: newTabBox.checked,
    };
    void ctx.update("tweaks.customNavItems", [...current, item]).then(() => {
      nameInput.value = "";
      urlInput.value = "";
      nameInput.classList.remove("is-invalid");
      urlInput.classList.remove("is-invalid");
      ctx.toast(t("navbar.itemAdded"));
    });
  }

  addBtn.addEventListener("click", addItem);
  for (const input of [nameInput, urlInput]) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addItem();
      }
    });
  }

  wrap.append(
    h("h4", { class: "navbar-subtitle", text: t("navbar.custom") }),
    h("p", { class: "card-note", text: t("navbar.customHint") }),
    itemsBox,
    h("div", { class: "navbar-form" }, [
      nameInput,
      urlInput,
      addBtn,
      h("label", { class: "navbar-form-check" }, [newTabBox, h("span", { text: t("navbar.newTab") })]),
    ]),
  );
  renderItems();

  /* Settings changed elsewhere (popup, another tab) — re-sync checkmarks. */
  const unsubscribeSettings = ctx.onSettingsChange(() => {
    renderButtons();
    renderItems();
  });

  return () => {
    unsubscribeNav();
    unsubscribeSettings();
  };
}
