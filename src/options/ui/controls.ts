/**
 * Schema-driven settings controls.
 *
 * Every setting from `src/settings/schema.ts` is rendered from its definition —
 * there is no hand-written markup per setting. Each row exposes `sync()` so an
 * external change (content script, import, reset, another tab) updates it in
 * place without losing focus or scroll position.
 *
 * Notes on data flow:
 *  - values are read through dotted paths (`getAtPath(settings, def.key)`),
 *  - writes go through ControlHandlers (PanelContext.update / reset),
 *  - visibility conditions (`def.when` + `def.whenAnd`) are re-evaluated on every sync.
 */
import { h, icon } from "./dom";
import type { SectionDef } from "../sections";
import type { SettingDef, SettingsGroup, WhenCondition } from "../../settings/schema";
import type { Settings as SettingsModel } from "../../types/settings";
import { SETTINGS_SCHEMA } from "../../settings/schema";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import { getAtPath } from "../../shared/paths";
import { sanitizeColor, sanitizeUrl } from "../../shared/validators";
import { debounce } from "../../shared/timing";
import { t } from "../../i18n/index";

/* ------------------------------------------------------------------ *
 * Contracts
 * ------------------------------------------------------------------ */

export interface ControlHandlers {
  /** Persist one setting (dotted key). Errors are surfaced by the shell. */
  update(key: string, value: unknown): Promise<void>;
  /** Reset one setting to its default. */
  reset(key: string): Promise<void>;
}

export interface Row {
  el: HTMLElement;
  def: SettingDef;
  /** Re-evaluate value + visibility from a settings snapshot. */
  sync(settings: SettingsModel): void;
}

export interface SectionRender {
  el: HTMLElement;
  sync(settings: SettingsModel): void;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Russian group headings (schema groups are tags, not labels). */
const GROUP_LABELS: Record<SettingsGroup, string> = {
  master: "Главное",
  appearance: "Оформление",
  theme: "Тема",
  background: "Фон страницы",
  glass: "Стекло",
  font: "Шрифты",
  cursor: "Курсор",
  effects: "Эффекты",
  transition: "Появление страницы",
  tweaks: "Элементы интерфейса",
  performance: "Производительность",
  accessibility: "Доступность",
  advanced: "Диагностика",
  ai: "AI",
  experimental: "Эксперименты",
};

/** Display label for a schema group (reset pickers, group headings). */
export function groupLabel(group: SettingsGroup): string {
  return GROUP_LABELS[group] ?? group;
}

function defaultValueOf(def: SettingDef): unknown {
  return getAtPath(DEFAULT_SETTINGS, def.key);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return false;
}

function matchesCondition(cond: WhenCondition, settings: SettingsModel): boolean {
  const actual = getAtPath(settings, cond.key);
  if (cond.equals !== undefined) return actual === cond.equals;
  if (cond.notEquals !== undefined) return actual !== cond.notEquals;
  if (cond.oneOf !== undefined) return cond.oneOf.includes(actual as string | number | boolean);
  return true;
}

function isVisible(def: SettingDef, settings: SettingsModel): boolean {
  if (def.when && !matchesCondition(def.when, settings)) return false;
  for (const cond of def.whenAnd ?? []) {
    if (!matchesCondition(cond, settings)) return false;
  }
  return true;
}

/** Human-readable current value for the value slot next to a control. */
function formatValue(def: SettingDef, value: unknown): string {
  if (typeof value === "boolean") return value ? "Вкл" : "Выкл";
  if (def.control === "slider" && typeof value === "number") {
    return def.unit ? `${value}${def.unit}` : String(value);
  }
  if (typeof value === "number" && def.control === "select") {
    const option = def.options?.find((o) => String(o.value) === String(value));
    if (option) return t(option.label);
  }
  if (typeof value === "string" && def.control === "select") {
    const option = def.options?.find((o) => o.value === value);
    if (option) return t(option.label);
  }
  return "";
}

function stepOf(def: SettingDef): number {
  return def.step ?? 1;
}

/* ------------------------------------------------------------------ *
 * Individual controls
 * ------------------------------------------------------------------ */

function toggleControl(def: SettingDef, initial: unknown, handlers: ControlHandlers): {
  el: HTMLElement;
  sync(value: unknown): void;
} {
  const input = h("input", {
    class: "rfs-switch-input",
    attrs: { type: "checkbox" },
    ariaLabel: t(def.label),
  });
  input.checked = initial === true;
  input.addEventListener("change", () => {
    void handlers.update(def.key, input.checked);
  });
  const track = h("span", { class: "rfs-switch", attrs: { "aria-hidden": "true" } },
    [h("span", { class: "rfs-switch-knob" })],
  );
  return {
    el: h("div", { class: "rfs-switch-wrap" }, [input, track]),
    sync(value) {
      input.checked = value === true;
    },
  };
}

function selectControl(def: SettingDef, initial: unknown, handlers: ControlHandlers): {
  el: HTMLElement;
  sync(value: unknown): void;
} {
  const select = h("select", { class: "rfs-select", ariaLabel: t(def.label) });
  for (const option of def.options ?? []) {
    const opt = h("option", { value: String(option.value) }, [t(option.label)]);
    select.appendChild(opt);
  }
  select.value = String(initial ?? "");
  select.addEventListener("change", () => {
    // Preserve the declared value type (numbers stay numbers).
    const declared = def.options?.find((o) => String(o.value) === select.value);
    void handlers.update(def.key, declared ? declared.value : select.value);
  });
  return {
    el: select,
    sync(value) {
      if (document.activeElement === select) return;
      select.value = String(value ?? "");
    },
  };
}

function sliderControl(def: SettingDef, initial: unknown, handlers: ControlHandlers): {
  el: HTMLElement;
  sync(value: unknown): void;
} {
  const min = def.min ?? 0;
  const max = def.max ?? 100;
  const step = stepOf(def);

  const range = h("input", {
    class: "rfs-slider-input",
    attrs: { type: "range", min: String(min), max: String(max), step: String(step) },
    ariaLabel: t(def.label),
  });
  const fill = h("span", { class: "rfs-slider-fill" });
  const rail = h("span", { class: "rfs-slider-rail" }, [fill]);
  const valueEl = h("output", { class: "rfs-slider-value" });

  const paint = (raw: unknown): void => {
    const num = typeof raw === "number" ? raw : Number(raw);
    const safe = Number.isFinite(num) ? num : min;
    valueEl.textContent = formatValue(def, safe);
    const pct = max === min ? 0 : ((safe - min) / (max - min)) * 100;
    fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  };
  range.value = String(initial ?? min);
  paint(range.value);

  range.addEventListener("input", () => paint(range.value));
  range.addEventListener("change", () => {
    const num = Number(range.value);
    void handlers.update(def.key, Number.isFinite(num) ? num : min);
  });

  return {
    el: h("div", { class: "rfs-slider" }, [rail, range, valueEl]),
    sync(value) {
      if (document.activeElement === range) return;
      range.value = String(value ?? min);
      paint(range.value);
    },
  };
}

/** Text + URL fields commit on a short debounce to avoid storage churn. */
function textControl(
  def: SettingDef,
  initial: unknown,
  handlers: ControlHandlers,
  kind: "text" | "url",
): {
  el: HTMLElement;
  sync(value: unknown): void;
} {
  const input = h("input", {
    class: "rfs-input",
    placeholder: kind === "url" ? "https://…" : "",
    attrs: { spellcheck: "false", inputmode: kind === "url" ? "url" : "text" },
    ariaLabel: t(def.label),
  });
  input.value = typeof initial === "string" ? initial : "";

  const hint = kind === "url" ? h("p", { class: "rfs-row-hint is-error", attrs: { hidden: "" } }) : null;

  const commit = debounce(() => {
    const value = input.value;
    if (kind === "url" && value.trim() !== "") {
      const clean = sanitizeUrl(value.trim());
      if (clean === null) {
        input.classList.add("is-invalid");
        input.setAttribute("aria-invalid", "true");
        if (hint) {
          hint.textContent = t("error.invalidUrl");
          hint.hidden = false;
        }
        return;
      }
    }
    input.classList.remove("is-invalid");
    input.removeAttribute("aria-invalid");
    if (hint) hint.hidden = true;
    void handlers.update(def.key, value.trim());
  }, 300);

  input.addEventListener("input", commit);
  input.addEventListener("blur", commit);

  const el = hint
    ? h("div", { class: "rfs-text-field" }, [input, hint])
    : input;

  return {
    el,
    sync(value) {
      if (document.activeElement === input) return;
      input.value = typeof value === "string" ? value : "";
      input.classList.remove("is-invalid");
      if (hint) hint.hidden = true;
    },
  };
}

function colorControl(def: SettingDef, initial: unknown, handlers: ControlHandlers): {
  el: HTMLElement;
  sync(value: unknown): void;
} {
  const swatch = h("input", {
    class: "rfs-color-swatch",
    attrs: { type: "color" },
    ariaLabel: t(def.label),
  });
  const text = h("input", {
    type: "text",
    class: "rfs-input rfs-color-text",
    attrs: { spellcheck: "false" },
    ariaLabel: t(def.label),
  });

  const applyLocal = (raw: string): void => {
    const valid = sanitizeColor(raw);
    text.value = raw;
    swatch.value = valid ?? "#000000";
    swatch.disabled = valid === null;
    text.classList.toggle("is-invalid", raw.trim() !== "" && valid === null);
  };
  applyLocal(typeof initial === "string" ? initial : "#000000");

  swatch.addEventListener("input", () => {
    text.value = swatch.value;
    text.classList.remove("is-invalid");
    void handlers.update(def.key, swatch.value);
  });

  const commitText = debounce(() => {
    const raw = text.value.trim();
    if (raw === "") return;
    const valid = sanitizeColor(raw);
    if (valid === null) {
      text.classList.add("is-invalid");
      text.setAttribute("aria-invalid", "true");
      return;
    }
    text.classList.remove("is-invalid");
    text.removeAttribute("aria-invalid");
    swatch.value = valid;
    void handlers.update(def.key, valid);
  }, 300);
  text.addEventListener("input", commitText);
  text.addEventListener("blur", commitText);

  return {
    el: h("div", { class: "rfs-color" }, [swatch, text]),
    sync(value) {
      if (document.activeElement === text) return;
      applyLocal(typeof value === "string" ? value : "#000000");
    },
  };
}

function buildControl(
  def: SettingDef,
  settings: SettingsModel,
  handlers: ControlHandlers,
): { el: HTMLElement; sync(value: unknown): void } {
  const initial = getAtPath(settings, def.key);
  switch (def.control) {
    case "toggle":
      return toggleControl(def, initial, handlers);
    case "select":
      return selectControl(def, initial, handlers);
    case "slider":
      return sliderControl(def, initial, handlers);
    case "color":
      return colorControl(def, initial, handlers);
    case "url":
      return textControl(def, initial, handlers, "url");
    case "text":
    default:
      return textControl(def, initial, handlers, "text");
  }
}

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

export function settingRow(
  def: SettingDef,
  settings: SettingsModel,
  handlers: ControlHandlers,
): Row {
  const control = buildControl(def, settings, handlers);

  const label = h("span", { class: "rfs-row-label" }, [t(def.label)]);
  const description = def.description
    ? h("span", { class: "rfs-row-desc" }, [t(def.description)])
    : null;
  const valueText = def.control === "slider" || def.control === "toggle"
    ? h("span", { class: "rfs-row-value" })
    : null;

  const textChildren: Array<Node | null> = [label, description, valueText];
  const text = h("div", { class: "rfs-row-text" }, textChildren);

  const resetBtn = h("button", {
    type: "button",
    class: "rfs-reset-btn",
    title: t("action.reset"),
    ariaLabel: `${t("action.reset")}: ${t(def.label)}`,
  }, [icon("refresh", 15)]);
  resetBtn.addEventListener("click", () => {
    void handlers.reset(def.key);
  });

  const el = h("div", { class: "rfs-row", dataset: { key: def.key } }, [
    text,
    h("div", { class: "rfs-row-control" }, [control.el]),
    h("div", { class: "rfs-row-reset" }, [resetBtn]),
  ]);

  const sync = (current: SettingsModel): void => {
    const value = getAtPath(current, def.key);
    control.sync(value);
    if (valueText) valueText.textContent = formatValue(def, value);
    const isDefault = sameValue(value, defaultValueOf(def));
    el.classList.toggle("is-default", isDefault);
    resetBtn.hidden = isDefault;
    const visible = isVisible(def, current);
    el.classList.toggle("is-hidden", !visible);
    if (!visible) el.setAttribute("aria-hidden", "true");
    else el.removeAttribute("aria-hidden");
  };
  sync(settings);

  return { el, def, sync };
}

/* ------------------------------------------------------------------ *
 * Section rendering
 * ------------------------------------------------------------------ */

function rowsForGroups(groups: readonly SettingsGroup[]): SettingDef[] {
  const wanted = new Set<string>(groups);
  return SETTINGS_SCHEMA.filter((def) => wanted.has(def.group));
}

/** Render a plain list of rows for one schema group (used by custom panels). */
export function renderGroupRows(
  groups: readonly SettingsGroup[],
  settings: SettingsModel,
  handlers: ControlHandlers,
): Row[] {
  return rowsForGroups(groups).map((def) => settingRow(def, settings, handlers));
}

/**
 * Section header (icon + title + subtitle). Used by schema sections and by
 * custom panels so every page of the dashboard opens consistently.
 */
export function sectionHeader(section: SectionDef): HTMLElement {
  const subKey = `sectionSub.${section.id}`;
  return h("header", { class: "rfs-section-head" }, [
    h("span", { class: "rfs-section-icon", attrs: { "aria-hidden": "true" } }, [
      icon(section.id, 20),
    ]),
    h("div", { class: "rfs-section-titles" }, [
      h("h2", { class: "rfs-section-title" }, [t(section.titleKey)]),
      h("p", { class: "rfs-section-sub" }, [t(subKey)]),
    ]),
  ]);
}

/**
 * Render a whole settings section: header, grouped rows, search haystack.
 * Rows keep schema order; duplicate keys (e.g. background.url for image and
 * video) each get their own row and de-duplicate through their `when` rules.
 */
export function renderSettingsSection(
  section: SectionDef,
  settings: SettingsModel,
  handlers: ControlHandlers,
): SectionRender {
  const defs = rowsForGroups(section.groups ?? []);
  const rows: Row[] = [];
  const body = h("div", { class: "rfs-section-body" });

  // Split defs into runs by group to draw subgroup headings.
  let currentGroup: string | null = null;
  let groupRows: Row[] = [];
  let groupEl: HTMLElement | null = null;
  let rowsBox: HTMLElement | null = null;

  const flushGroup = (): void => {
    if (!groupEl || groupRows.length === 0) return;
    const haystack = groupRows
      .map((row) => row.el.textContent ?? "")
      .join(" ")
      .toLowerCase();
    groupEl.dataset.search = haystack;
    body.appendChild(groupEl);
  };

  for (const def of defs) {
    if (def.group !== currentGroup) {
      flushGroup();
      currentGroup = def.group;
      groupRows = [];
      rowsBox = h("div", { class: "rfs-group-rows" });
      groupEl = h("section", { class: "rfs-group" }, [
        h("h3", { class: "rfs-group-title" }, [GROUP_LABELS[def.group] ?? def.group]),
        rowsBox,
      ]);
    }
    const row = settingRow(def, settings, handlers);
    rows.push(row);
    (rowsBox ?? body).appendChild(row.el);
    groupRows.push(row);
  }
  flushGroup();

  const el = h("div", { class: "rfs-section", dataset: { section: section.id } }, [
    sectionHeader(section),
    body,
  ]);

  return {
    el,
    sync(current) {
      for (const row of rows) row.sync(current);
    },
  };
}

