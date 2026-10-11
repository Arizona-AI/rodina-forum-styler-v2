/**
 * Cursor module — builds SVG data-URI cursors from preset/color/size/
 * thickness settings and writes them into a dynamic style block.
 *
 * Contract:
 *  dynamic block id: "rfs-dyn-cursor" containing
 *    [data-rfs-cursor] { cursor: url("data:image/svg+xml,…") X Y, auto; }
 *  Interactive elements (links, buttons, inputs) keep cursor:pointer.
 *  Custom preset uses a sanitized https URL (settings.cursor.customUrl).
 */
import type { ContentModule, ModuleContext } from "./types";
import { logger } from "../../shared/logger";
import { sanitizeColor, sanitizeUrl } from "../../shared/validators";
import { luminance, parseColor } from "../../shared/color";

const SCOPE = "cursor";
const DYN_ID = "rfs-dyn-cursor";
/** Запасной цвет, если sanitizeColor не пропустил настройку. */
const FALLBACK_COLOR = "#d9204f";
/** Браузеры тяжело жуют длинные data-URI; пресеты укладываются в 800. */
const MAX_DATA_URI = 800;

export const cursorModule: ContentModule = {
  id: "cursor",

  init(_ctx: ModuleContext): void {
    /* no-op: блок создаётся в apply() */
  },

  apply(ctx: ModuleContext): void {
    try {
      const cur = ctx.settings.cursor;
      if (!cur.enabled) {
        ctx.host.setDynamicCss(DYN_ID, null);
        return;
      }

      const size = Math.round(Math.min(64, Math.max(16, cur.size)));
      const thickness = Math.round(Math.min(6, Math.max(1, cur.thickness)));
      // colorMode "theme" — курсор автоматически красится в акцент активной темы.
      const rawColor = cur.colorMode === "theme" ? ctx.tokens.primary : cur.color;
      let color = sanitizeColor(rawColor);
      if (!color) {
        logger.warn(SCOPE, `не удалось получить цвет курсора — ${FALLBACK_COLOR}`);
        color = FALLBACK_COLOR;
      }

      let preset = cur.preset;
      let cursorValue: string;

      if (preset === "custom") {
        const url = sanitizeUrl(cur.customUrl);
        if (!url) {
          logger.warn(SCOPE, "недопустимая ссылка на свой курсор — прицел");
          preset = "crosshair";
          cursorValue = presetUri(preset, color, size, thickness);
        } else {
          const safe = url.replace(/["\\]/g, "%22");
          cursorValue = `url("${safe}") ${Math.round(size / 2)} ${Math.round(size / 2)}, auto`;
        }
      } else {
        cursorValue = presetUri(preset, color, size, thickness);
      }

      if (cursorValue === "") {
        ctx.host.setDynamicCss(DYN_ID, null);
        return;
      }
      ctx.host.setDynamicCss(DYN_ID, buildCss(cursorValue));
    } catch (err) {
      logger.error(SCOPE, `apply failed: ${String(err)}`);
    }
  },

  destroy(ctx: ModuleContext): void {
    ctx.host.setDynamicCss(DYN_ID, null);
  },
};

/* ------------------------------ internals ------------------------------ */

/**
 * Собирает data-URI пресета. Пустая строка = слишком длинный URI
 * (защитный потолок) — тогда курсор остаётся системным.
 */
function presetUri(preset: string, color: string, size: number, thickness: number): string {
  const svg = buildSvg(preset, color, size, thickness);
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  if (uri.length > MAX_DATA_URI) {
    logger.warn(SCOPE, `SVG-курсор слишком длинный (${uri.length} > ${MAX_DATA_URI}) — системный курсор`);
    return "";
  }
  return `url("${uri}") ${Math.round(size / 2)} ${Math.round(size / 2)}, auto`;
}

function buildSvg(preset: string, color: string, size: number, thickness: number): string {
  const s = size;
  const c = s / 2;
  const t = thickness;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">`;

  switch (preset) {
    case "ring": {
      const r = Math.max(2, c - t);
      const dot = Math.max(1, Math.min(t, c - 1));
      return `${head}<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${t}"/><circle cx="${c}" cy="${c}" r="${dot}" fill="${color}"/></svg>`;
    }
    case "dot": {
      const r = Math.max(2, c - 1);
      const outline = outlineFor(color);
      return `${head}<circle cx="${c}" cy="${c}" r="${r}" fill="${color}" stroke="${outline}" stroke-width="1"/></svg>`;
    }
    case "chevron": {
      // Стрелка-шеврон, как системный указатель, но с hotspot по центру.
      return `${head}<path d="M${n(s * 0.72)} ${n(s * 0.16)}L${n(s * 0.3)} ${n(s * 0.5)}L${n(s * 0.72)} ${n(s * 0.84)}" fill="none" stroke="${color}" stroke-width="${t}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
    case "crosshair":
    default: {
      // Крест с разрывом в центре (gap) — «прицел».
      const gap = Math.max(3, Math.round(s * 0.18));
      return `${head}<path d="M${c} 0V${n(c - gap)}M${c} ${n(c + gap)}V${s}M0 ${c}H${n(c - gap)}M${n(c + gap)} ${c}H${s}" fill="none" stroke="${color}" stroke-width="${t}" stroke-linecap="round"/></svg>`;
    }
  }
}

/** Контрастная обводка для залитой точки (чтобы её было видно на любом фоне). */
function outlineFor(color: string): string {
  const rgb = parseColor(color);
  if (!rgb) return "#ffffff";
  return luminance(rgb) > 0.45 ? "#000000" : "#ffffff";
}

/** Округление до 1 знака — компактный path в SVG. */
function n(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Блок CSS: пресетный курсор на <html> наследуется всему дереву, а
 * интерактивные элементы возвращают pointer — иначе теряется аффорданс.
 */
function buildCss(cursorValue: string): string {
  const hover =
    "[data-rfs-cursor] a,[data-rfs-cursor] button,[data-rfs-cursor] .button," +
    '[data-rfs-cursor] [role="button"],[data-rfs-cursor] input,[data-rfs-cursor] textarea,' +
    "[data-rfs-cursor] select,[data-rfs-cursor] label{cursor:pointer}";
  return `[data-rfs-cursor]{cursor:${cursorValue}}${hover}`;
}
