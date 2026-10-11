/**
 * Theme editor: full token editing with live preview, undo/redo,
 * in-panel contrast checks and forum live preview via the editor draft.
 *
 * Part 1: state, groups and toolbar wiring. Preview + actions live in the
 * second half of this file.
 */
import { h, icon, clear } from "../ui/dom";
import { sectionHeader } from "../ui/controls";
import { showToast } from "../ui/toast";
import { confirmDialog, promptDialog } from "../ui/modal";
import { downloadJson } from "../ui/format";
import type { PanelContext } from "../panelContext";
import { sectionById } from "../sections";
import { t } from "../../i18n/index";
import {
  DEFAULT_FONT_STACK,
  type ThemeCategory,
  type ThemeColorField,
  type ThemeDefinition,
  type ThemeMode,
  type ThemeTokens,
} from "../../types/theme";
import { DEFAULT_THEME_TOKENS, sanitizeTheme, sanitizeTokens } from "../../theme/validate";
import { resolveThemeById, loadCustomThemes, upsertCustomTheme, DEFAULT_THEME_ID } from "../../theme/resolve";
import { contrastRatio, contrastGrade, luminance, parseColor } from "../../shared/color";
import { sanitizeColor, sanitizeLabel } from "../../shared/validators";
import { debounce } from "../../shared/timing";
import { saveDraft, clearDraft, loadDraft, type EditorDraft } from "../../settings/store";
import { logger } from "../../shared/logger";

const SCOPE = "editor";

/** Base theme for a fresh editor session (set by the themes grid). */
let editorBaseId: string | null = null;

export function setEditorBaseTheme(id: string): void {
  editorBaseId = id;
}

const RADIUS_RE = /^([0-9]|1[0-9]|2[0-4])(\.\d)?px$/;
const MAX_HISTORY = 50;

/** Token fields grouped for the left column. */
const GROUPS: Array<{ titleKey: string; colors: ThemeColorField[]; lengths: string[] }> = [
  {
    titleKey: "editor.sectionColors",
    colors: ["pageBg", "pageBgSecondary", "text", "textMuted", "textFaint", "success", "warning", "danger", "info"],
    lengths: [],
  },
  {
    titleKey: "editor.sectionSurfaces",
    colors: ["surface", "surfaceAlt", "surfaceHover", "headerBg", "sidebarBg", "footerBg"],
    lengths: [],
  },
  {
    titleKey: "editor.sectionBrand",
    colors: ["primary", "primaryHover", "primaryFg", "secondary", "accent", "buttonBg", "buttonFg", "buttonBorder"],
    lengths: [],
  },
  {
    titleKey: "editor.sectionShape",
    colors: ["border", "borderStrong", "shadowColor"],
    lengths: ["radiusSmall", "radiusMedium", "radiusLarge"],
  },
  {
    titleKey: "editor.sectionType",
    colors: [],
    lengths: ["fontFamily"],
  },
];

/** Russian labels for token fields (kept next to the grouping data). */
const FIELD_LABELS: Record<string, string> = {
  pageBg: "Фон страницы",
  pageBgSecondary: "Фон страницы (2)",
  surface: "Карточки",
  surfaceAlt: "Панели",
  surfaceHover: "Наведение",
  text: "Основной текст",
  textMuted: "Вторичный текст",
  textFaint: "Слабый текст",
  border: "Рамки",
  borderStrong: "Рамки (сильные)",
  primary: "Акцент",
  primaryHover: "Акцент (наведение)",
  primaryFg: "Текст на акценте",
  secondary: "Второй акцент",
  accent: "Мелкий акцент",
  success: "Успех",
  warning: "Предупреждение",
  danger: "Ошибка",
  info: "Информация",
  buttonBg: "Фон кнопок",
  buttonFg: "Текст кнопок",
  buttonBorder: "Рамка кнопок",
  radiusSmall: "Радиус (мелкий)",
  radiusMedium: "Радиус (средний)",
  radiusLarge: "Радиус (крупный)",
  shadowColor: "Цвет тени",
  fontFamily: "Шрифт темы",
  headerBg: "Шапка",
  sidebarBg: "Боковая панель",
  footerBg: "Футер",
};

const FONT_CHOICES = [
  DEFAULT_FONT_STACK,
  'Montserrat, "Segoe UI", sans-serif',
  '"Golos Text", system-ui, sans-serif',
  'Onest, system-ui, sans-serif',
  '"Playfair Display", Georgia, serif',
  '"JetBrains Mono", ui-monospace, monospace',
];

/** Best-effort mode detection for saving (pageBg luminance). */
function detectMode(tokens: ThemeTokens): ThemeMode {
  const rgb = parseColor(tokens.pageBg);
  return rgb && luminance(rgb) < 0.45 ? "dark" : "light";
}

function detectCategory(mode: ThemeMode): ThemeCategory {
  return mode;
}

function slugFromName(name: string): string | null {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base && /^[a-z0-9][a-z0-9-]{0,63}$/.test(base) ? base : null;
}

interface ContrastResult {
  label: string;
  ratio: number;
}

function contrastPairs(tokens: ThemeTokens): ContrastResult[] {
  const pairs: ContrastResult[] = [
    { label: "Текст / карточка", ratio: contrastRatio(tokens.text, tokens.surface) },
    { label: "Текст / фон", ratio: contrastRatio(tokens.text, tokens.pageBg) },
    { label: "Текст на кнопке", ratio: contrastRatio(tokens.primaryFg, tokens.primary) },
  ];
  return pairs;
}

export function renderEditorPanel(root: HTMLElement, ctx: PanelContext): () => void {
  /* ---------------- state ---------------- */
  let base: ThemeDefinition | null = null;
  let tokens: ThemeTokens = { ...DEFAULT_THEME_TOKENS };
  let name = "";
  let description = "";
  let dirty = false;
  let livePreview = false;
  const undoStack: ThemeTokens[] = [];
  const redoStack: ThemeTokens[] = [];

  const section = sectionById("editor");
  const el = h("section", { class: "rfs-section", dataset: { section: "editor" } });
  if (section) el.appendChild(sectionHeader(section));

  /* ---------------- history helpers ---------------- */
  function pushHistory(): void {
    undoStack.push({ ...tokens });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
    historyButtons();
  }

  function applyTokens(next: ThemeTokens, record: boolean): void {
    if (record) pushHistory();
    tokens = { ...next };
    dirty = true;
    paintControls();
    paintPreview();
    paintContrast();
    historyButtons();
    scheduleDraft();
  }

  function historyButtons(): void {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  function undo(): void {
    const prev = undoStack.pop();
    if (!prev) return;
    redoStack.push({ ...tokens });
    tokens = prev;
    dirty = true;
    paintControls();
    paintPreview();
    paintContrast();
    historyButtons();
    scheduleDraft();
  }

  function redo(): void {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push({ ...tokens });
    tokens = next;
    dirty = true;
    paintControls();
    paintPreview();
    paintContrast();
    historyButtons();
    scheduleDraft();
  }

  /* ---------------- live preview draft ---------------- */
  const scheduleDraft = debounce(() => {
    if (!livePreview) return;
    void saveDraft({
      tokens: { ...tokens },
      baseThemeId: base?.id ?? DEFAULT_THEME_ID,
      updatedAt: Date.now(),
      previewOnly: true,
    }).catch((err) => logger.warn(SCOPE, `saveDraft failed: ${String(err)}`));
  }, 250);

  /* ---------------- toolbar ---------------- */
  const nameInput = h("input", {
    class: "rfs-input editor-name",
    placeholder: t("editor.namePlaceholder"),
    attrs: { spellcheck: "false", maxlength: "60" },
    ariaLabel: t("editor.nameLabel"),
  });
  nameInput.addEventListener("input", () => {
    name = nameInput.value;
    dirty = true;
    paintUnsaved();
  });

  const descInput = h("input", {
    class: "rfs-input editor-desc",
    placeholder: "Описание темы (необязательно)",
    attrs: { spellcheck: "false", maxlength: "160" },
    ariaLabel: "Описание темы",
  });
  descInput.addEventListener("input", () => {
    description = descInput.value;
    dirty = true;
    paintUnsaved();
  });

  const unsavedChip = h("span", { class: "chip is-warn editor-unsaved", text: t("editor.unsaved") });
  unsavedChip.hidden = true;
  function paintUnsaved(): void {
    unsavedChip.hidden = !dirty;
  }

  const undoBtn = h("button", { type: "button", class: "btn btn-ghost icon-btn", ariaLabel: t("action.undo"), attrs: { title: t("action.undo") } }, [icon("undo", 16)]);
  undoBtn.addEventListener("click", undo);
  const redoBtn = h("button", { type: "button", class: "btn btn-ghost icon-btn", ariaLabel: t("action.redo"), attrs: { title: t("action.redo") } }, [icon("redo", 16)]);
  redoBtn.addEventListener("click", redo);

  const previewToggle = h("input", {
    class: "rfs-switch-input",
    attrs: { type: "checkbox" },
    ariaLabel: t("editor.livePreview"),
  });
  previewToggle.addEventListener("change", async () => {
    livePreview = previewToggle.checked;
    if (livePreview) {
      scheduleDraft();
      showToast(t("editor.livePreview"), "info");
    } else {
      scheduleDraft.cancel();
      await clearDraft();
      showToast(t("state.saved"), "success");
    }
  });

  el.appendChild(
    h("div", { class: "editor-toolbar" }, [
      h("div", { class: "editor-toolbar-fields" }, [nameInput, descInput]),
      h("div", { class: "editor-toolbar-side" }, [
        unsavedChip,
        undoBtn,
        redoBtn,
        h("label", { class: "editor-live" }, [
          h("span", { class: "rfs-switch-wrap" }, [
            previewToggle,
            h("span", { class: "rfs-switch", attrs: { "aria-hidden": "true" } }, [h("span", { class: "rfs-switch-knob" })]),
          ]),
          h("span", { class: "editor-live-label", text: t("editor.livePreview") }),
        ]),
      ]),
    ]),
  );

  /* ---------------- token controls ---------------- */
  interface ColorControl {
    field: ThemeColorField;
    swatch: HTMLInputElement;
    text: HTMLInputElement;
  }
  const colorControls: ColorControl[] = [];
  const lengthControls: Array<{ field: string; input: HTMLInputElement }> = [];
  const resetButtons: Array<{ field: string; btn: HTMLButtonElement }> = [];

  function setColor(field: ThemeColorField, raw: string): void {
    const clean = sanitizeColor(raw.trim());
    if (!clean) {
      colorControls.find((c) => c.field === field)?.text.classList.add("is-invalid");
      return;
    }
    colorControls.find((c) => c.field === field)?.text.classList.remove("is-invalid");
    applyTokens({ ...tokens, [field]: clean }, true);
  }

  function colorControl(field: ThemeColorField): HTMLElement {
    const baseValue = base?.tokens[field] ?? DEFAULT_THEME_TOKENS[field];
    const swatch = h("input", {
      class: "rfs-color-swatch",
      attrs: { type: "color" },
      ariaLabel: FIELD_LABELS[field] ?? field,
    }) as HTMLInputElement;
    const text = h("input", {
      class: "rfs-input rfs-color-text",
      attrs: { spellcheck: "false" },
      ariaLabel: FIELD_LABELS[field] ?? field,
    }) as HTMLInputElement;
    swatch.value = tokens[field];
    text.value = tokens[field];

    swatch.addEventListener("input", () => setColor(field, swatch.value));
    text.addEventListener("change", () => setColor(field, text.value));

    const resetBtn = h("button", {
      type: "button",
      class: "rfs-reset-btn",
      title: t("editor.resetTheme"),
      ariaLabel: `${t("action.reset")}: ${FIELD_LABELS[field] ?? field}`,
    }, [icon("refresh", 14)]);
    resetBtn.addEventListener("click", () => {
      applyTokens({ ...tokens, [field]: baseValue }, true);
    });
    resetButtons.push({ field, btn: resetBtn });
    colorControls.push({ field, swatch, text });

    return h("div", { class: "editor-field" }, [
      h("span", { class: "editor-field-label", text: FIELD_LABELS[field] ?? field }),
      h("div", { class: "editor-field-control" }, [swatch, text, resetBtn]),
    ]);
  }

  function lengthControl(field: string): HTMLElement {
    const baseValue = base?.tokens[field as keyof ThemeTokens] ?? DEFAULT_THEME_TOKENS[field as keyof ThemeTokens];
    const isFont = field === "fontFamily";
    let input: HTMLInputElement | HTMLSelectElement;

    if (isFont) {
      const select = h("select", { class: "rfs-select", ariaLabel: FIELD_LABELS[field] }) as HTMLSelectElement;
      const choices = new Set<string>([...FONT_CHOICES, tokens.fontFamily]);
      for (const choice of choices) {
        select.appendChild(h("option", { value: choice }, [choice.split(",")[0] ?? choice]));
      }
      select.value = tokens.fontFamily;
      select.addEventListener("change", () => {
        applyTokens({ ...tokens, fontFamily: select.value }, true);
      });
      input = select;
    } else {
      const numberInput = h("input", {
        class: "rfs-input rfs-radius-text",
        attrs: { spellcheck: "false", inputmode: "numeric" },
        ariaLabel: FIELD_LABELS[field] ?? field,
      }) as HTMLInputElement;
      numberInput.value = tokens[field as "radiusSmall" | "radiusMedium" | "radiusLarge"];
      numberInput.addEventListener("change", () => {
        const value = numberInput.value.trim();
        if (!RADIUS_RE.test(value)) {
          numberInput.classList.add("is-invalid");
          showToast("Радиус: формат 0–24px", "error");
          return;
        }
        numberInput.classList.remove("is-invalid");
        applyTokens({ ...tokens, [field]: value }, true);
      });
      input = numberInput;
      lengthControls.push({ field, input: numberInput });
    }

    const baseFont = String(baseValue);
    const resetBtn = h("button", {
      type: "button",
      class: "rfs-reset-btn",
      title: t("editor.resetTheme"),
      ariaLabel: `${t("action.reset")}: ${FIELD_LABELS[field] ?? field}`,
    }, [icon("refresh", 14)]);
    resetBtn.addEventListener("click", () => {
      applyTokens({ ...tokens, [field]: baseFont } as ThemeTokens, true);
    });
    resetButtons.push({ field, btn: resetBtn });

    return h("div", { class: "editor-field" }, [
      h("span", { class: "editor-field-label", text: FIELD_LABELS[field] ?? field }),
      h("div", { class: "editor-field-control" }, [input, resetBtn]),
    ]);
  }

  const leftColumn = h("div", { class: "editor-col editor-col-left" });
  for (const group of GROUPS) {
    const rows = h("div", { class: "editor-group-rows" });
    for (const field of group.colors) rows.appendChild(colorControl(field));
    for (const field of group.lengths) rows.appendChild(lengthControl(field));
    leftColumn.appendChild(
      h("section", { class: "card editor-group" }, [
        h("h3", { class: "card-title" }, [h("span", { text: t(group.titleKey) })]),
        rows,
      ]),
    );
  }

  function paintControls(): void {
    for (const ctrl of colorControls) {
      if (document.activeElement === ctrl.text) continue;
      ctrl.swatch.value = tokens[ctrl.field];
      ctrl.text.value = tokens[ctrl.field];
      ctrl.text.classList.remove("is-invalid");
    }
    for (const ctrl of lengthControls) {
      if (document.activeElement === ctrl.input) continue;
      ctrl.input.value = tokens[ctrl.field as "radiusSmall" | "radiusMedium" | "radiusLarge" | "fontFamily"];
      ctrl.input.classList.remove("is-invalid");
    }
    for (const item of resetButtons) {
      const baseTokens = base?.tokens ?? DEFAULT_THEME_TOKENS;
      const baseValue = baseTokens[item.field as keyof ThemeTokens];
      const current = tokens[item.field as keyof ThemeTokens];
      item.btn.hidden = baseValue === current;
    }
    nameInput.value = name;
    descInput.value = description;
  }

  /* ---------------- live preview mock ---------------- */
  const mock = h("div", { class: "editor-mock" });
  const mockHeader = h("div", { class: "mock-header" }, [
    h("span", { class: "mock-logo", text: "R" }),
    h("span", { class: "mock-nav-item", text: "Форум" }),
    h("span", { class: "mock-nav-item", text: "Сообщения" }),
    h("span", { class: "mock-nav-item", text: "Участники" }),
  ]);
  const mockPost = h("div", { class: "mock-post" }, [
    h("div", { class: "mock-post-head" }, [
      h("span", { class: "mock-avatar" }),
      h("span", { class: "mock-author", text: "Игрок" }),
      h("span", { class: "mock-time", text: "2 мин. назад" }),
    ]),
    h("p", { class: "mock-text", text: "Пример текста сообщения для проверки читаемости палитры." }),
    h("div", { class: "mock-post-actions" }, [
      h("button", { class: "mock-btn mock-btn-primary", type: "button", text: "Ответить" }),
      h("button", { class: "mock-btn mock-btn-secondary", type: "button", text: "Цитировать" }),
      h("span", { class: "mock-link", text: "Ссылка" }),
      h("span", { class: "mock-badge", text: "Новое" }),
    ]),
  ]);
  const mockSidebar = h("div", { class: "mock-sidebar" }, [
    h("div", { class: "mock-side-title", text: "Разделы" }),
    h("div", { class: "mock-side-item", text: "Обсуждения" }),
    h("div", { class: "mock-side-item", text: "Правила" }),
  ]);
  mock.append(mockHeader, h("div", { class: "mock-body" }, [mockPost, mockSidebar]));

  const previewCard = h("div", { class: "card editor-preview-card" }, [
    h("h3", { class: "card-title" }, [icon("eye", 16), h("span", { text: t("editor.preview") })]),
    mock,
  ]);

  function paintPreview(): void {
    const s = mock.style;
    s.setProperty("--mock-bg", tokens.pageBg);
    s.setProperty("--mock-surface", tokens.surface);
    s.setProperty("--mock-surface-alt", tokens.surfaceAlt);
    s.setProperty("--mock-text", tokens.text);
    s.setProperty("--mock-muted", tokens.textMuted);
    s.setProperty("--mock-border", tokens.border);
    s.setProperty("--mock-primary", tokens.primary);
    s.setProperty("--mock-primary-fg", tokens.primaryFg);
    s.setProperty("--mock-secondary", tokens.secondary);
    s.setProperty("--mock-button-bg", tokens.buttonBg);
    s.setProperty("--mock-button-fg", tokens.buttonFg);
    s.setProperty("--mock-button-border", tokens.buttonBorder);
    s.setProperty("--mock-header-bg", tokens.headerBg);
    s.setProperty("--mock-sidebar-bg", tokens.sidebarBg);
    s.setProperty("--mock-radius", tokens.radiusMedium);
    s.setProperty("--mock-radius-sm", tokens.radiusSmall);
    s.setProperty("--mock-font", tokens.fontFamily);
    s.setProperty("--mock-shadow", `0 6px 18px ${tokens.shadowColor}55`);
  }

  /* ---------------- contrast meter ---------------- */
  const contrastBox = h("div", { class: "editor-contrast" });
  const warningBox = h("div", { class: "card editor-warnings" });

  function paintContrast(): void {
    clear(contrastBox);
    const failing: string[] = [];
    for (const pair of contrastPairs(tokens)) {
      const grade = contrastGrade(pair.ratio);
      const ok = pair.ratio >= 4.5;
      if (!ok) failing.push(`${pair.label} (${pair.ratio.toFixed(1)})`);
      contrastBox.appendChild(
        h("div", { class: "contrast-row" }, [
          h("span", { class: "contrast-label", text: pair.label }),
          h("span", { class: `chip ${ok ? "is-ok" : "is-warn"}`, text: `${pair.ratio.toFixed(1)} · ${grade}` }),
        ]),
      );
    }
    clear(warningBox);
    if (failing.length > 0) {
      warningBox.appendChild(
        h("p", { class: "card-note is-warn-text", text: t("editor.contrastWarn", { pairs: failing.join(", ") }) }),
      );
      warningBox.hidden = false;
    } else {
      warningBox.appendChild(
        h("p", { class: "card-note is-ok-text", text: t("editor.contrastOk") }),
      );
      warningBox.hidden = false;
    }
  }

  previewCard.appendChild(
    h("div", { class: "contrast-block" }, [
      h("h4", { class: "diag-title", text: t("editor.checkContrast") }),
      contrastBox,
    ]),
  );

  /* ---------------- actions ---------------- */
  const saveChangesBtn = h("button", { type: "button", class: "btn btn-primary" }, [
    icon("save", 15), h("span", { text: t("editor.saveChanges") }),
  ]);
  saveChangesBtn.disabled = true;
  saveChangesBtn.addEventListener("click", async () => {
    if (!base) return;
    try {
      const mode = detectMode(tokens);
      await upsertCustomTheme({
        id: base.id,
        name: sanitizeLabel(name, 60) || base.name,
        description: sanitizeLabel(description, 160),
        category: detectCategory(mode),
        mode,
        tokens: { ...tokens },
      });
      dirty = false;
      paintUnsaved();
      showToast(t("state.saved"), "success");
    } catch (err) {
      logger.error(SCOPE, `saveChanges failed: ${String(err)}`);
      showToast(t("state.error"), "error");
    }
  });

  const saveAsBtn = h("button", { type: "button", class: "btn btn-secondary" }, [
    icon("plus", 15), h("span", { text: t("editor.saveAsTheme") }),
  ]);
  saveAsBtn.addEventListener("click", async () => {
    const chosen = await promptDialog(t("editor.saveAsTheme"), name || t("editor.namePlaceholder"));
    if (chosen === null) return;
    const cleanName = sanitizeLabel(chosen, 60).trim();
    if (!cleanName) {
      showToast("Название обязательно", "error");
      return;
    }
    try {
      const mode = detectMode(tokens);
      const saved = await upsertCustomTheme({
        name: cleanName,
        description: sanitizeLabel(description, 160),
        category: detectCategory(mode),
        mode,
        tokens: { ...tokens },
        basedOn: base?.id,
      });
      editorBaseId = saved.id;
      base = saved;
      name = saved.name;
      description = saved.description;
      dirty = false;
      paintUnsaved();
      paintControls();
      saveChangesBtn.disabled = false;
      showToast(t("state.saved"), "success");
      await ctx.applyTheme(saved.id);
    } catch (err) {
      logger.error(SCOPE, `saveAsTheme failed: ${String(err)}`);
      showToast(t("state.error"), "error");
    }
  });

  const duplicateBtn = h("button", { type: "button", class: "btn btn-secondary" }, [
    icon("copy", 15), h("span", { text: t("editor.duplicate") }),
  ]);
  duplicateBtn.addEventListener("click", async () => {
    try {
      const mode = detectMode(tokens);
      const copy = await upsertCustomTheme({
        name: `${sanitizeLabel(name, 60) || base?.name || "Тема"} (копия)`,
        description: sanitizeLabel(description, 160),
        category: detectCategory(mode),
        mode,
        tokens: { ...tokens },
        basedOn: base?.id,
      });
      editorBaseId = copy.id;
      base = copy;
      name = copy.name;
      dirty = false;
      paintUnsaved();
      paintControls();
      saveChangesBtn.disabled = false;
      showToast(t("state.saved"), "success");
    } catch (err) {
      logger.error(SCOPE, `duplicate failed: ${String(err)}`);
      showToast(t("state.error"), "error");
    }
  });

  const exportBtn = h("button", { type: "button", class: "btn btn-secondary" }, [
    icon("download", 15), h("span", { text: t("editor.exportTheme") }),
  ]);
  exportBtn.addEventListener("click", () => {
    const mode = detectMode(tokens);
    downloadJson(`rfs-theme-${base?.id ?? "draft"}.json`, {
      id: base?.id ?? slugFromName(name) ?? "my-theme",
      name: sanitizeLabel(name, 60) || base?.name || "Тема",
      description: sanitizeLabel(description, 160),
      category: detectCategory(mode),
      mode,
      tokens: { ...tokens },
    });
    showToast(t("state.saved"), "success");
  });

  const importInput = h("input", {
    class: "editor-import-input",
    attrs: { type: "file", accept: "application/json,.json" },
    ariaLabel: t("editor.importTheme"),
  }) as HTMLInputElement;
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;
    if (file.size > 64 * 1024) {
      showToast("Файл больше 64 КБ", "error");
      return;
    }
    try {
      const text = await file.text();
      const raw: unknown = JSON.parse(text);
      const plain = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
      const importedId =
        typeof plain["id"] === "string" && plain["id"].length > 0
          ? plain["id"]
          : slugFromName(String(plain["name"] ?? ""));
      const theme = sanitizeTheme({ ...plain, id: importedId });
      if (!theme) {
        showToast(t("error.import", { errors: "не удалось распознать тему" }), "error");
        return;
      }
      const mode = detectMode(theme.tokens);
      const saved = await upsertCustomTheme({
        name: theme.name,
        description: theme.description,
        category: detectCategory(mode),
        mode,
        tokens: theme.tokens,
      });
      editorBaseId = saved.id;
      base = saved;
      name = saved.name;
      description = saved.description;
      tokens = { ...saved.tokens };
      dirty = false;
      undoStack.length = 0;
      redoStack.length = 0;
      historyButtons();
      paintControls();
      paintPreview();
      paintContrast();
      paintUnsaved();
      saveChangesBtn.disabled = false;
      showToast(t("io.importDone"), "success");
    } catch (err) {
      logger.error(SCOPE, `import failed: ${String(err)}`);
      showToast(t("error.import", { errors: String(err).slice(0, 200) }), "error");
    }
  });
  const importBtn = h("label", { class: "btn btn-secondary editor-import-label" }, [
    icon("upload", 15), h("span", { text: t("editor.importTheme") }), importInput,
  ]);

  const resetBtn = h("button", { type: "button", class: "btn btn-ghost" }, [
    icon("refresh", 15), h("span", { text: t("editor.resetTheme") }),
  ]);
  resetBtn.addEventListener("click", async () => {
    const ok = await confirmDialog(t("editor.resetTheme"), {
      confirmLabel: t("action.reset"),
      danger: true,
    });
    if (ok !== true) return;
    const source = base?.tokens ?? DEFAULT_THEME_TOKENS;
    undoStack.length = 0;
    redoStack.length = 0;
    tokens = { ...source };
    dirty = false;
    paintControls();
    paintPreview();
    paintContrast();
    paintUnsaved();
    historyButtons();
    scheduleDraft();
    showToast(t("state.reset"), "success");
  });

  const actions = h("div", { class: "editor-actions card" }, [
    saveChangesBtn, saveAsBtn, duplicateBtn, exportBtn, importBtn, resetBtn,
  ]);

  /* ---------------- layout ---------------- */
  const rightColumn = h("div", { class: "editor-col editor-col-right" }, [
    previewCard, warningBox, actions,
  ]);
  el.appendChild(h("div", { class: "editor-layout" }, [leftColumn, rightColumn]));

  /* ---------------- init ---------------- */
  async function init(): Promise<void> {
    try {
      const requested = editorBaseId ?? ctx.settings().theme.activeId ?? DEFAULT_THEME_ID;
      const catalogCustom = await loadCustomThemes();
      const customMatch = catalogCustom.find((theme) => theme.id === requested);
      base = customMatch ?? (await resolveThemeById(requested));
      editorBaseId = null; // one-shot: next open falls back to the active theme
    } catch (err) {
      logger.error(SCOPE, `init failed: ${String(err)}`);
      base = null;
      tokens = { ...DEFAULT_THEME_TOKENS };
      name = "Моя тема";
      description = "";
      showToast(t("state.error"), "error");
      paintControls();
      paintPreview();
      paintContrast();
      paintUnsaved();
      historyButtons();
      saveChangesBtn.disabled = true;
      return;
    }

    // A broken/missing draft must not hide the base theme — report and go on.
    let draft: EditorDraft | null = null;
    try {
      draft = await loadDraft();
    } catch (err) {
      logger.warn(SCOPE, `loadDraft failed: ${String(err)}`);
      draft = null;
    }

    const draftTokens =
      draft && draft.baseThemeId === base.id ? sanitizeTokens(draft.tokens, base.tokens) : null;
    tokens = draftTokens ? { ...draftTokens } : { ...base.tokens };
    name = base.name;
    description = base.description;
    dirty = draftTokens !== null && JSON.stringify(draftTokens) !== JSON.stringify(base.tokens);
    livePreview = draft?.previewOnly === true;
    previewToggle.checked = livePreview;

    paintControls();
    paintPreview();
    paintContrast();
    paintUnsaved();
    historyButtons();
    // "Save changes" applies only to user-created themes; built-ins are read-only bases.
    saveChangesBtn.disabled = !(base && !BUILTIN_IDS.has(base.id));
  }

  const BUILTIN_IDS = new Set<string>();
  void import("../../theme/library")
    .then(({ BUILTIN_THEMES }) => {
      for (const theme of BUILTIN_THEMES) BUILTIN_IDS.add(theme.id);
      void init();
    })
    .catch((err) => {
      // Bundled statically by esbuild — this only fires if the bundle is
      // damaged; render with what we have instead of an empty panel.
      logger.error(SCOPE, `library import failed: ${String(err)}`);
      void init();
    });

  root.appendChild(el);
  return () => {
    scheduleDraft.cancel();
  };
}

