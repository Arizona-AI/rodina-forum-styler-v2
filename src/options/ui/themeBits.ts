/**
 * Shared theme presentation bits for dashboard panels (grid, editor, IO).
 * Keeping labels and swatch rendering in one place prevents drift between
 * the themes grid, the editor and the dashboard cards.
 */
import { h } from "./dom";
import type { ThemeCategory, ThemeDefinition, ThemeMode } from "../../types/theme";
import { t } from "../../i18n/index";

const CATEGORY_LABELS: Record<ThemeCategory, string> = {
  dark: "Тёмная",
  light: "Светлая",
  neon: "Неон",
  pastel: "Пастель",
  minimal: "Минимал",
  retro: "Ретро",
  nature: "Природа",
  fantasy: "Фэнтези",
  arizona: "Arizona",
};

export function categoryLabel(category: string): string {
  const known = (Object.keys(CATEGORY_LABELS) as ThemeCategory[]).find((c) => c === category);
  return known ? CATEGORY_LABELS[known] : category;
}

export function modeLabel(mode: ThemeMode): string {
  return mode === "dark" ? "Тёмная" : "Светлая";
}

/** Small pill describing theme mode/category. */
export function themeChip(text: string, kind?: "ok" | "warn"): HTMLElement {
  return h("span", { class: kind ? `chip is-${kind}` : "chip", text });
}

/**
 * Three-band gradient preview built from theme tokens
 * (page background → surface → primary accent → secondary accent).
 * The colors come from validated hex tokens, interpolated into a style
 * attribute — tokens are sanitized at load, so no injection is possible.
 */
export function themePreview(
  theme: Pick<ThemeDefinition, "name" | "tokens">,
  extraClass = "",
): HTMLElement {
  const { pageBg, surface, primary, secondary } = theme.tokens;
  return h("span", {
    class: `theme-preview${extraClass ? ` ${extraClass}` : ""}`,
    attrs: {
      style: `background:linear-gradient(135deg, ${pageBg} 0%, ${pageBg} 34%, ${surface} 34%, ${surface} 58%, ${primary} 58%, ${primary} 79%, ${secondary} 79%)`,
      "aria-hidden": "true",
    },
  });
}

/** Compact meta line: «Категория · Режим». */
export function themeMeta(theme: Pick<ThemeDefinition, "category" | "mode">): HTMLElement {
  return h("span", { class: "theme-meta" }, [
    h("span", { text: categoryLabel(theme.category) }),
    h("span", { class: "theme-meta-sep", text: "·" }),
    h("span", { text: modeLabel(theme.mode) }),
  ]);
}

/** Heart toggle button with an accessible label; `setFav` repaints without firing. */
export interface FavoriteButton extends HTMLButtonElement {
  setFav(next: boolean): void;
}

export function favoriteButton(
  isFavorite: boolean,
  onToggle: (next: boolean) => void,
): FavoriteButton {
  const paint = (btn: FavoriteButton, next: boolean): void => {
    btn.classList.toggle("is-fav", next);
    btn.textContent = next ? "♥" : "♡";
    btn.setAttribute("aria-pressed", String(next));
    btn.setAttribute("aria-label", next ? t("themes.unfavorite") : t("themes.favorite"));
  };
  const btn = h("button", {
    type: "button",
    class: "fav-btn",
    ariaLabel: isFavorite ? t("themes.unfavorite") : t("themes.favorite"),
    attrs: { "aria-pressed": String(isFavorite) },
  }) as FavoriteButton;
  btn.setFav = (next: boolean) => paint(btn, next);
  paint(btn, isFavorite);
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    const next = btn.getAttribute("aria-pressed") !== "true";
    paint(btn, next);
    onToggle(next);
  });
  return btn;
}
