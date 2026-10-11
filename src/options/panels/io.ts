/**
 * Import / export section: JSON file bundle, share codes and paste import.
 * Validation runs before any write; results (including warnings and skipped
 * items) are always reported to the user — never silently dropped.
 */
import { h, icon } from "../ui/dom";
import { sectionHeader } from "../ui/controls";
import { showToast } from "../ui/toast";
import { confirmDialog } from "../ui/modal";
import { downloadJson } from "../ui/format";
import type { PanelContext } from "../panelContext";
import { sectionById } from "../sections";
import { t } from "../../i18n/index";
import {
  buildBundle,
  serializeBundle,
  encodeShareCode,
  importFromText,
  parseShareCode,
  applyBundle,
  type ImportMode,
  type ImportResult,
} from "../../storage/exportImport";
import { logger } from "../../shared/logger";

const SCOPE = "io";

function reportResult(result: ImportResult): void {
  if (!result.ok) {
    showToast(t("error.import", { errors: result.errors.join("; ") }), "error");
    return;
  }
  const notes = result.warnings.length > 0 ? ` (${result.warnings.join("; ")})` : "";
  showToast(`${t("io.importDone")}${notes}`, result.warnings.length > 0 ? "info" : "success");
}

export function renderIoPanel(root: HTMLElement, ctx: PanelContext): () => void {
  const section = sectionById("io");
  const el = h("section", { class: "rfs-section", dataset: { section: "io" } });
  if (section) el.appendChild(sectionHeader(section));

  let mode: ImportMode = "merge";
  const modeRadios: HTMLInputElement[] = [];

  function modePicker(): HTMLElement {
    const box = h("div", { class: "io-modes", attrs: { role: "radiogroup", "aria-label": "Режим импорта" } });
    for (const value of ["merge", "replace"] as const) {
      const input = h("input", {
        attrs: { type: "radio", name: "rfs-import-mode", value },
        ariaLabel: value === "merge" ? t("io.modeMerge") : t("io.modeReplace"),
      }) as HTMLInputElement;
      input.checked = value === mode;
      input.addEventListener("change", () => {
        if (input.checked) mode = value;
      });
      modeRadios.push(input);
      box.appendChild(
        h("label", { class: "io-mode" }, [
          input,
          h("span", { text: value === "merge" ? t("io.modeMerge") : t("io.modeReplace") }),
        ]),
      );
    }
    return box;
  }

  async function runImport(text: string, byShareCode: boolean): Promise<void> {
    try {
      if (byShareCode) {
        const parsed = parseShareCode(text.trim());
        if (!parsed.ok) {
          reportResult(parsed);
          return;
        }
        const notes = await applyBundle(parsed.bundle, mode);
        if (notes.length > 0) showToast(`${t("io.importDone")} (${notes.join("; ")})`, "info");
        else showToast(t("io.importDone"), "success");
      } else {
        reportResult(await importFromText(text, mode));
      }
      ctx.refresh();
    } catch (err) {
      logger.error(SCOPE, `import failed: ${String(err)}`);
      showToast(t("error.import", { errors: String(err).slice(0, 200) }), "error");
    }
  }

  /* ---------------- export JSON ---------------- */
  const exportHint = h("p", { class: "card-note", text: t("io.exportHint") });
  const exportBtn = h("button", { type: "button", class: "btn btn-primary" }, [
    icon("download", 15), h("span", { text: t("action.export") }),
  ]);
  exportBtn.addEventListener("click", async () => {
    try {
      const bundle = await buildBundle();
      const stamp = bundle.exportedAt.slice(0, 10);
      downloadJson(`rodina-forum-styler-${stamp}.json`, JSON.parse(serializeBundle(bundle)) as unknown);
      showToast(t("state.saved"), "success");
    } catch (err) {
      logger.error(SCOPE, `export failed: ${String(err)}`);
      showToast(t("state.error"), "error");
    }
  });
  el.appendChild(
    h("div", { class: "card" }, [
      h("h3", { class: "card-title" }, [icon("save", 16), h("span", { text: t("io.exportFull") })]),
      exportHint,
      exportBtn,
    ]),
  );

  /* ---------------- import JSON ---------------- */
  const fileInput = h("input", {
    class: "io-file-input",
    attrs: { type: "file", accept: "application/json,.json" },
    ariaLabel: t("io.importJson"),
  }) as HTMLInputElement;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    if (file.size > 512 * 1024) {
      showToast(t("error.import", { errors: "файл больше 512 КБ" }), "error");
      return;
    }
    const text = await file.text();
    await runImport(text, false);
  });

  const dropZone = h("div", { class: "io-drop" }, [
    icon("upload", 20),
    h("span", { text: t("io.dropFile") }),
    fileInput,
  ]);
  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("is-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-over"));
  dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-over");
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      showToast(t("error.import", { errors: "файл больше 512 КБ" }), "error");
      return;
    }
    await runImport(await file.text(), false);
  });

  const replaceConfirm = h("div", { class: "io-danger-row" });
  const importJsonCard = h("div", { class: "card" }, [
    h("h3", { class: "card-title" }, [icon("upload", 16), h("span", { text: t("io.importJson") })]),
    modePicker(),
    dropZone,
  ]);
  replaceConfirm.appendChild(h("p", { class: "card-note", text: "«Заменить всё» перезаписывает текущие настройки данными из файла." }));
  importJsonCard.appendChild(replaceConfirm);
  el.appendChild(importJsonCard);

  /* ---------------- share code: export ---------------- */
  const codeArea = h("textarea", {
    class: "rfs-input io-code",
    attrs: { rows: "4", spellcheck: "false" },
    ariaLabel: t("io.pasteCode"),
  }) as HTMLTextAreaElement;
  codeArea.placeholder = t("io.exportCode");
  const copyBtn = h("button", { type: "button", class: "btn btn-secondary" }, [
    icon("copy", 15), h("span", { text: t("action.copy") }),
  ]);
  copyBtn.addEventListener("click", async () => {
    if (!codeArea.value) return;
    try {
      await navigator.clipboard.writeText(codeArea.value);
      showToast(t("action.copied"), "success");
    } catch (err) {
      logger.error(SCOPE, `clipboard failed: ${String(err)}`);
      codeArea.select();
      showToast("Скопируйте вручную (Ctrl+C)", "error");
    }
  });
  const genCodeBtn = h("button", { type: "button", class: "btn btn-secondary" }, [
    icon("sparkles", 15), h("span", { text: t("io.exportCode") }),
  ]);
  genCodeBtn.addEventListener("click", async () => {
    try {
      const bundle = await buildBundle();
      codeArea.value = encodeShareCode(bundle);
      codeArea.select();
      showToast(t("state.saved"), "success");
    } catch (err) {
      logger.error(SCOPE, `encode failed: ${String(err)}`);
      showToast(t("state.error"), "error");
    }
  });
  el.appendChild(
    h("div", { class: "card" }, [
      h("h3", { class: "card-title" }, [icon("key", 16), h("span", { text: t("io.exportCode") })]),
      codeArea,
      h("div", { class: "card-actions" }, [genCodeBtn, copyBtn]),
    ]),
  );

  /* ---------------- share code: import ---------------- */
  const pasteArea = h("textarea", {
    class: "rfs-input io-code",
    attrs: { rows: "4", spellcheck: "false", placeholder: t("io.pasteCode") },
    ariaLabel: t("io.pasteCode"),
  }) as HTMLTextAreaElement;
  const applyCodeBtn = h("button", { type: "button", class: "btn btn-primary" }, [
    icon("upload", 15), h("span", { text: t("io.importCode") }),
  ]);
  applyCodeBtn.addEventListener("click", async () => {
    const value = pasteArea.value.trim();
    if (!value) {
      showToast(t("error.import", { errors: "код пуст" }), "error");
      return;
    }
    const ok = await confirmDialog(
      mode === "replace" ? t("advanced.confirmResetAll") : "Импортировать данные из кода?",
      { confirmLabel: t("action.apply") },
    );
    if (ok !== true) return;
    // A pasted value may be a share code OR raw JSON — try both.
    if (value.startsWith("{")) await runImport(value, false);
    else await runImport(value, true);
    pasteArea.value = "";
  });
  el.appendChild(
    h("div", { class: "card" }, [
      h("h3", { class: "card-title" }, [icon("download", 16), h("span", { text: t("io.importCode") })]),
      modePicker(),
      pasteArea,
      h("div", { class: "card-actions" }, [applyCodeBtn]),
    ]),
  );

  /* keep radios coherent (two pickers share state) */
  const syncRadios = (): void => {
    for (const radio of modeRadios) radio.checked = radio.value === mode;
  };
  for (const radio of modeRadios) {
    radio.addEventListener("change", syncRadios);
  }

  root.appendChild(el);
  return () => undefined;
}
