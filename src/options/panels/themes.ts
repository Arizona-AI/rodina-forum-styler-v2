/**
 * Themes library: built-in catalog + user themes with search, category and
 * mode filters, favorites, apply/duplicate/delete.
 */
import { h, icon, clear } from "../ui/dom";
import { sectionHeader } from "../ui/controls";
import { showToast } from "../ui/toast";
import { confirmDialog } from "../ui/modal";
import {
  categoryLabel,
  themePreview,
  themeMeta,
  favoriteButton,
  type FavoriteButton,
} from "../ui/themeBits";
import type { PanelContext } from "../panelContext";
import { sectionById } from "../sections";
import { t } from "../../i18n/index";
import { BUILTIN_THEMES } from "../../theme/library";
import {
  getThemeCatalog,
  deleteCustomTheme,
  upsertCustomTheme,
} from "../../theme/resolve";
import { THEME_CATEGORIES, type ThemeDefinition } from "../../types/theme";
import { logger } from "../../shared/logger";
import { setEditorBaseTheme } from "./editor";

const SCOPE = "themes";

interface CardRefs {
  el: HTMLElement;
  applyBtn: HTMLButtonElement;
  heart: FavoriteButton;
  theme: ThemeDefinition;
  isCustom: boolean;
}

export function renderThemesPanel(root: HTMLElement, ctx: PanelContext): () => void {
  const section = sectionById("themes");
  const el = h("section", { class: "rfs-section", dataset: { section: "themes" } });
  if (section) el.appendChild(sectionHeader(section));

  /* ---------------- state ---------------- */
  let catalog: ThemeDefinition[] = [];
  let query = "";
  let category = "all";
  let mode = "all";
  let favOnly = false;
  const cards = new Map<string, CardRefs>();

  /* ---------------- toolbar ---------------- */
  const searchInput = h("input", {
    class: "rfs-input theme-search",
    placeholder: t("action.searchThemes"),
    attrs: { type: "search", spellcheck: "false" },
    ariaLabel: t("action.searchThemes"),
  });
  searchInput.addEventListener("input", () => {
    query = searchInput.value.trim().toLowerCase();
    paintGrid();
  });

  const catChips = h("div", { class: "chip-row", attrs: { role: "group", "aria-label": "Категории" } });
  const modeChips = h("div", { class: "chip-row", attrs: { role: "group", "aria-label": "Режим" } });
  const chipButtons: Array<{ key: string; kind: "cat" | "mode"; btn: HTMLButtonElement }> = [];

  function addChip(
    row: HTMLElement,
    kind: "cat" | "mode",
    key: string,
    label: string,
  ): void {
    const btn = h("button", {
      type: "button",
      class: `filter-chip${isDefaultFilter(kind, key) ? " is-on" : ""}`,
      text: label,
      attrs: { "aria-pressed": String(isDefaultFilter(kind, key)) },
    });
    btn.addEventListener("click", () => {
      if (kind === "cat") category = key;
      else mode = key;
      for (const chip of chipButtons) {
        const on = chip.kind === kind ? chip.key === key : isDefaultFilter(chip.kind, chip.key);
        chip.btn.classList.toggle("is-on", on);
        chip.btn.setAttribute("aria-pressed", String(on));
      }
      paintGrid();
    });
    chipButtons.push({ key, kind, btn });
    row.appendChild(btn);
  }

  function isDefaultFilter(kind: "cat" | "mode", key: string): boolean {
    if (kind === "cat") return key === "all";
    return key === "all";
  }

  addChip(catChips, "cat", "all", "Все");
  for (const cat of THEME_CATEGORIES) addChip(catChips, "cat", cat, categoryLabel(cat));
  addChip(modeChips, "mode", "all", "Все");
  addChip(modeChips, "mode", "dark", "Тёмные");
  addChip(modeChips, "mode", "light", "Светлые");

  const favBtn = h("button", {
    type: "button",
    class: "filter-chip",
    ariaLabel: t("themes.favorite"),
    attrs: { "aria-pressed": "false" },
  }, [h("span", { text: "♥" }), h("span", { text: "Избранное" })]);
  favBtn.addEventListener("click", () => {
    favOnly = !favOnly;
    favBtn.classList.toggle("is-on", favOnly);
    favBtn.setAttribute("aria-pressed", String(favOnly));
    paintGrid();
  });

  const randomBtn = h("button", { type: "button", class: "btn btn-secondary" }, [
    icon("random", 15), h("span", { text: t("action.random") }),
  ]);
  randomBtn.addEventListener("click", async () => {
    const visible = filtered();
    if (visible.length === 0) {
      showToast(t("state.empty"), "error");
      return;
    }
    const pick = visible[Math.floor(Math.random() * visible.length)]!;
    await apply(pick);
  });

  el.append(
    h("div", { class: "theme-toolbar" }, [
      searchInput,
      h("div", { class: "toolbar-side" }, [favBtn, randomBtn]),
    ]),
    h("div", { class: "theme-filters" }, [catChips, modeChips]),
  );

  const countLine = h("p", { class: "theme-count" });
  el.appendChild(countLine);

  /* ---------------- groups ---------------- */
  const builtinGroup = h("div", { class: "theme-group" }, [
    h("h3", { class: "rfs-group-title theme-group-title", text: t("themes.builtin") }),
  ]);
  const builtinGrid = h("div", { class: "theme-grid" });
  builtinGroup.appendChild(builtinGrid);

  const customGroup = h("div", { class: "theme-group" }, [
    h("h3", { class: "rfs-group-title theme-group-title", text: t("themes.custom") }),
  ]);
  const customGrid = h("div", { class: "theme-grid" });
  customGroup.appendChild(customGrid);

  el.append(builtinGroup, customGroup);

  /* ---------------- actions ---------------- */

  async function apply(theme: ThemeDefinition): Promise<void> {
    await ctx.applyTheme(theme.id);
  }

  async function toggleFavorite(theme: ThemeDefinition, next: boolean): Promise<void> {
    const favorites = new Set(ctx.settings().theme.favorites);
    if (next) {
      if (favorites.size >= 50) {
        showToast("Избранное заполнено (максимум 50)", "error");
        refreshStates();
        return;
      }
      favorites.add(theme.id);
    } else {
      favorites.delete(theme.id);
    }
    try {
      await ctx.update("theme.favorites", [...favorites]);
    } catch (err) {
      logger.error(SCOPE, `favorite toggle failed: ${String(err)}`);
      refreshStates();
    }
  }

  function cardFor(theme: ThemeDefinition): CardRefs {
    const isCustom = !BUILTIN_THEMES.some((builtin) => builtin.id === theme.id);

    const applyBtn = h("button", { type: "button", class: "btn btn-primary btn-sm", text: t("themes.apply") });
    applyBtn.addEventListener("click", () => void apply(theme));

    const heart = favoriteButton(
      ctx.settings().theme.favorites.includes(theme.id),
      (next) => void toggleFavorite(theme, next),
    );

    const actions = h("div", { class: "theme-card-actions" }, [heart, applyBtn]);

    if (isCustom) {
      const editBtn = h("button", {
        type: "button",
        class: "btn btn-ghost btn-sm",
        text: t("action.edit"),
      });
      editBtn.addEventListener("click", () => {
        setEditorBaseTheme(theme.id);
        ctx.openSection("editor");
      });
      const dupBtn = h("button", {
        type: "button",
        class: "btn btn-ghost btn-sm",
        text: t("action.duplicate"),
      });
      dupBtn.addEventListener("click", async () => {
        try {
          await upsertCustomTheme({
            name: `${theme.name} (копия)`,
            description: theme.description,
            category: theme.category,
            mode: theme.mode,
            tokens: theme.tokens,
            basedOn: theme.id,
          });
          showToast(t("state.saved"), "success");
          await reload();
        } catch (err) {
          logger.error(SCOPE, `duplicate failed: ${String(err)}`);
          showToast(t("state.error"), "error");
        }
      });
      const delBtn = h("button", {
        type: "button",
        class: "btn btn-ghost btn-sm danger-text",
        text: t("action.delete"),
      });
      delBtn.addEventListener("click", async () => {
        const ok = await confirmDialog(t("themes.deleteConfirm", { name: theme.name }), {
          confirmLabel: t("action.delete"),
          danger: true,
        });
        if (ok !== true) return;
        try {
          await deleteCustomTheme(theme.id);
          if (ctx.settings().theme.activeId === theme.id) {
            await ctx.patch({ "theme.activeId": BUILTIN_THEMES[0]?.id ?? "rodina-eclipse" });
          }
          showToast(t("state.reset"), "success");
          await reload();
        } catch (err) {
          logger.error(SCOPE, `delete failed: ${String(err)}`);
          showToast(t("state.error"), "error");
        }
      });
      actions.insertBefore(dupBtn, applyBtn);
      actions.insertBefore(editBtn, applyBtn);
      actions.appendChild(delBtn);
    }

    const card = h("article", {
      class: "theme-card",
      dataset: { themeId: theme.id },
      attrs: { "aria-current": "false" },
    }, [
      themePreview(theme, "theme-card-preview"),
      h("div", { class: "theme-card-body" }, [
        h("div", { class: "theme-card-head" }, [
          h("h4", { class: "theme-card-name", text: theme.name }),
          isCustom ? h("span", { class: "theme-card-badge", text: "Моя тема" }) : null,
        ].filter((node): node is HTMLElement => node !== null)),
        h("p", { class: "theme-card-desc", text: theme.description }),
        h("div", { class: "theme-card-meta" }, [themeMeta(theme)]),
        actions,
      ]),
    ]);

    card.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("button")) return;
      void apply(theme);
    });

    return { el: card, applyBtn, heart, theme, isCustom };
  }

  /* ---------------- painting ---------------- */

  function filtered(): ThemeDefinition[] {
    const favorites = new Set(ctx.settings().theme.favorites);
    return catalog.filter((theme) => {
      if (category !== "all" && theme.category !== category) return false;
      if (mode !== "all" && theme.mode !== mode) return false;
      if (favOnly && !favorites.has(theme.id)) return false;
      if (query) {
        const haystack = `${theme.name} ${theme.description} ${theme.id}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  function paintGrid(): void {
    const visible = filtered();
    const hasCustom = catalog.some((theme) => !BUILTIN_THEMES.some((b) => b.id === theme.id));
    cards.clear();
    clear(builtinGrid);
    clear(customGrid);
    for (const theme of visible) {
      const refs = cardFor(theme);
      cards.set(theme.id, refs);
      (refs.isCustom ? customGrid : builtinGrid).appendChild(refs.el);
    }
    builtinGroup.classList.toggle("is-hidden", builtinGrid.children.length === 0);
    customGroup.classList.toggle("is-hidden", customGrid.children.length === 0 && !hasCustom);
    noCustomHint.hidden = hasCustom;
    countLine.textContent = t("themes.count", { count: visible.length });
    countLine.classList.toggle("is-dim", visible.length === 0);
    refreshStates();
  }

  function refreshStates(): void {
    const settings = ctx.settings();
    const activeId = settings.theme.activeId;
    const favorites = settings.theme.favorites;
    for (const refs of cards.values()) {
      const active = refs.theme.id === activeId;
      refs.el.classList.toggle("is-active", active);
      refs.el.setAttribute("aria-current", active ? "true" : "false");
      refs.applyBtn.textContent = active ? "Активна" : t("themes.apply");
      refs.applyBtn.disabled = active;
      refs.heart.setFav(favorites.includes(refs.theme.id));
    }
  }

  const noCustomHint = h("div", { class: "empty-state is-custom-hint", text: t("themes.noCustom") });
  const createBtn = h("button", { type: "button", class: "btn btn-primary btn-sm", text: t("nav.editor") });
  createBtn.addEventListener("click", () => ctx.openSection("editor"));
  noCustomHint.appendChild(document.createTextNode(" "));
  noCustomHint.appendChild(createBtn);
  customGroup.appendChild(noCustomHint);

  async function reload(): Promise<void> {
    try {
      catalog = await getThemeCatalog();
    } catch (err) {
      logger.error(SCOPE, `catalog load failed: ${String(err)}`);
      showToast(t("state.error"), "error");
      catalog = [...BUILTIN_THEMES];
    }
    paintGrid();
  }

  const unsubscribe = ctx.onSettingsChange(() => refreshStates());
  void reload();

  root.appendChild(el);
  return () => unsubscribe();
}
