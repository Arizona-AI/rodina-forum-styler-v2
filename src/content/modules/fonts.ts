/**
 * Font module — loads the selected Google Font (or a user-provided font
 * file) and emits @font-face for custom sources.
 *
 * Contract:
 *  - Google Fonts link: #rfs-font (managed by StyleHost.setFontLink)
 *  - Custom @font-face: dynamic block "rfs-dyn-fontface"
 *  - This module also sets --rfs-font-stack and --rfs-base-size (§3.2).
 *  - Scope/size/weight are projected by flags.ts (attributes + vars)
 *    and consumed by fonts.css.
 *
 * ВАЖНО: StyleHost.setVar() пропускает значение через sanitizeCssValue,
 * который отбрасывает всё с кавычками (' " \). Поэтому стек НИКОГДА не
 * содержит кавычек: многименные имена шрифтов в CSS вполне валидны и без
 * них (font-family: Segoe UI, Arial — последовательность идентификаторов).
 */
import type { ContentModule, ModuleContext } from "./types";
import { logger } from "../../shared/logger";
import { sanitizeFontFamily, sanitizeUrl } from "../../shared/validators";

const SCOPE = "fonts";

/** Системный стек — без кавычек, см. комментарий выше. */
const SYSTEM_STACK = "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial, sans-serif";
/** Имя Google-шрифта: только буквы/цифры/пробелы, до 40 символов. */
const GOOGLE_FAMILY_RE = /^[A-Za-z0-9 ]{1,40}$/;

/** Измеренный базовый размер <body> (один раз на жизнь контент-скрипта). */
let baseSizeCache: string | null = null;

export const fontModule: ContentModule = {
  id: "fonts",

  init(_ctx: ModuleContext): void {
    measureBaseSize();
  },

  apply(ctx: ModuleContext): void {
    try {
      const host = ctx.host;
      const font = ctx.settings.font;

      if (font.scope === "off") {
        host.setFontLink(null);
        host.setDynamicCss("rfs-dyn-fontface", null);
        host.setVar("--rfs-font-stack", "");
        host.setVar("--rfs-base-size", "");
        return;
      }

      host.setVar("--rfs-base-size", measureBaseSize());

      let stack: string | null = null;
      let googleHref: string | null = null;

      if (font.family === "theme") {
        stack = quoteFree(ctx.tokens.fontFamily);
      } else if (font.family === "system") {
        stack = SYSTEM_STACK;
      } else if (font.family === "custom") {
        stack = applyCustomFace(ctx);
        // Ссылка на Google больше не нужна — свой шрифт грузится из @font-face.
        host.setFontLink(null);
      } else {
        const family = font.family.trim();
        if (GOOGLE_FAMILY_RE.test(family)) {
          stack = `${family}, ${SYSTEM_STACK}`;
          googleHref = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, "+")}:wght@300;400;500;600;700&display=swap`;
        } else {
          logger.warn(SCOPE, `недопустимое имя шрифта «${family}» — шрифт темы`);
          stack = quoteFree(ctx.tokens.fontFamily);
        }
      }

      if (!stack) stack = quoteFree(ctx.tokens.fontFamily);
      host.setVar("--rfs-font-stack", stack);
      host.setFontLink(googleHref);
    } catch (err) {
      logger.error(SCOPE, `apply failed: ${String(err)}`);
    }
  },

  destroy(ctx: ModuleContext): void {
    ctx.host.setFontLink(null);
    ctx.host.setDynamicCss("rfs-dyn-fontface", null);
    ctx.host.setVar("--rfs-font-stack", "");
    ctx.host.setVar("--rfs-base-size", "");
    baseSizeCache = null;
  },
};

/* ------------------------------ internals ------------------------------ */

/** Кэширует вычисленный font-size <body> ("15px" как запасной вариант). */
function measureBaseSize(): string {
  if (baseSizeCache) return baseSizeCache;
  try {
    const raw = getComputedStyle(document.body).fontSize;
    baseSizeCache = /^\d+(\.\d+)?px$/.test(raw) ? raw : "15px";
  } catch {
    baseSizeCache = "15px";
  }
  return baseSizeCache;
}

/** Убирает кавычки — иначе setVar() отклонит значение (см. шапку файла). */
function quoteFree(stack: string): string {
  return stack.replace(/["']/g, "").replace(/\s*,\s*/g, ", ").trim();
}

/**
 * Собственная пара «семейство + файл»: стек + @font-face в динамическом
 * блоке. Невалидные данные → warn и null (стек падает на шрифт темы).
 */
function applyCustomFace(ctx: ModuleContext): string | null {
  const font = ctx.settings.font;
  const family = sanitizeFontFamily(font.customFamily);
  if (!family) {
    logger.warn(SCOPE, "недопустимое имя своего шрифта — шрифт темы");
    ctx.host.setDynamicCss("rfs-dyn-fontface", null);
    return null;
  }

  const source = sanitizeUrl(font.customSource);
  if (!source) {
    logger.warn(SCOPE, "недопустимая ссылка на файл шрифта — @font-face не создан");
    ctx.host.setDynamicCss("rfs-dyn-fontface", null);
    return `${family}, ${SYSTEM_STACK}`;
  }

  const faceCss = fontFaceCss(family, source);
  if (!faceCss) {
    ctx.host.setDynamicCss("rfs-dyn-fontface", null);
    return `${family}, ${SYSTEM_STACK}`;
  }
  ctx.host.setDynamicCss("rfs-dyn-fontface", faceCss);
  return `${family}, ${SYSTEM_STACK}`;
}

/** Формат по расширению; неизвестное расширение → warn + null (блок снят). */
function fontFaceCss(family: string, url: string): string | null {
  const path = (url.split("?")[0] ?? "").split("#")[0] ?? "";
  const lower = path.toLowerCase();
  let format: string;
  if (lower.endsWith(".woff2")) format = "woff2";
  else if (lower.endsWith(".woff")) format = "woff";
  else if (lower.endsWith(".ttf")) format = "truetype";
  else {
    logger.warn(SCOPE, `неизвестное расширение файла шрифта (ожидается woff2/woff/ttf)`);
    return null;
  }
  const safeUrl = url.replace(/["\\]/g, "%22");
  return `@font-face{font-family:"${family}";src:url("${safeUrl}") format("${format}");font-display:swap}`;
}
