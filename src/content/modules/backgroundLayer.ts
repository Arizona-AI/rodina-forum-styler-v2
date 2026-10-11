/**
 * Background layer module — places the chosen background (color/gradient/
 * image/GIF/built-in scene/video) behind all forum content plus a readability
 * overlay.
 *
 * DOM contract (created here, owned here):
 *  #rfs-bg-layer    fixed layer (z-index:-2) — color/gradient/image/scene/video
 *  #rfs-bg-overlay  fixed overlay (z-index:-1) — readability dimming
 *
 * The forum's <body> background stays transparent (base.css) so the layer
 * shows through. Both nodes are prepended as the FIRST children of the page
 * wrapper so they sit behind the content but above the <html> background.
 *
 * apply() is idempotent: nodes are reused, only styles change; every value
 * is sanitized (or resolved through the built-in scene whitelist) before it
 * reaches the DOM; apply never throws.
 */
import type { ContentModule, ModuleContext } from "./types";
import type { Settings } from "../../types/settings";
import { logger } from "../../shared/logger";
import { sanitizeColor, sanitizeGradient, sanitizeUrl } from "../../shared/validators";

const SCOPE = "background";
const LAYER_ID = "rfs-bg-layer";
const OVERLAY_ID = "rfs-bg-overlay";
/** Класс включает режим «фон едет вместе со скроллом» (правило в base.css). */
const SCROLL_CLASS = "rfs-bg-scroll";

/** Встроенные градиенты (settings.background.gradientPreset). */
const GRADIENT_PRESETS: Readonly<Record<string, string>> = {
  aurora: "linear-gradient(135deg, #051937, #00a3a3 45%, #7b2ff7)",
  sunset: "linear-gradient(160deg, #ff7e5f, #feb47b 45%, #ff4b6e)",
  ocean: "linear-gradient(150deg, #0f2027, #2c5364 55%, #203a43)",
  violet: "linear-gradient(135deg, #2b1055, #7597de)",
  ember: "linear-gradient(140deg, #1a0b0b, #b33000 55%, #ffb347)",
  forest: "linear-gradient(150deg, #0b2016, #1f6f3f 60%, #95d5b2)",
  candy: "linear-gradient(135deg, #ff9a9e, #fad0c4 45%, #a1c4fd)",
  midnight: "linear-gradient(180deg, #020014, #0f0c29 50%, #302b63)",
};

/**
 * background-position: schema values use hyphens ("top-left"), CSS wants
 * spaces ("top left") — map through a whitelist instead of string munging.
 */
const POSITION_MAP: Readonly<Record<string, string>> = {
  center: "center",
  top: "top",
  bottom: "bottom",
  left: "left",
  right: "right",
  "top-left": "top left",
  "top-right": "top right",
  "bottom-left": "bottom left",
  "bottom-right": "bottom right",
};

/* Module state (пересоздаётся при init/destroy, обновляется в apply). */
let layerEl: HTMLElement | null = null;
let overlayEl: HTMLElement | null = null;
let videoEl: HTMLVideoElement | null = null;
let lastSettings: Settings | null = null;
let visBound = false;
let lastVideoErrorSrc: string | null = null;

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
}

/** Экранирует кавычки/бэкслэши внутри url("...") для background-image. */
function cssUrl(url: string): string {
  return url.replace(/["\\]/g, "%22");
}

export const backgroundModule: ContentModule = {
  id: "background",

  init(_ctx: ModuleContext): void {
    bindVisibility();
  },

  apply(ctx: ModuleContext): void {
    try {
      lastSettings = ctx.settings;
      bindVisibility();

      const bg = ctx.settings.background;
      ensureNodes(ctx.adapter.wrapper());
      const layer = layerEl;
      const overlay = overlayEl;
      if (!layer || !overlay) return;

      /** true = на слой что-то выведено; только тогда включаем подложку. */
      let mediaShown = false;

      switch (bg.mode) {
        case "none": {
          clearLayerContent(layer);
          break;
        }

        case "color": {
          const color = sanitizeColor(bg.color);
          if (!color) {
            logger.warn(SCOPE, `недопустимый цвет фона (${String(bg.color)}) — фон темы`);
            clearLayerContent(layer);
            break;
          }
          clearLayerContent(layer);
          layer.style.background = color;
          mediaShown = true;
          break;
        }

        case "gradient": {
          const resolved = resolveGradient(bg.gradientPreset, bg.gradient);
          if (!resolved) {
            logger.warn(SCOPE, `градиент «${bg.gradientPreset}» не прошёл проверку — фон темы`);
            clearLayerContent(layer);
            break;
          }
          clearLayerContent(layer);
          layer.style.background = resolved;
          mediaShown = true;
          break;
        }

        case "image": {
          const url = sanitizeUrl(bg.url);
          if (!url) {
            logger.warn(SCOPE, "недопустимая ссылка на изображение — фон темы");
            clearLayerContent(layer);
            break;
          }
          clearLayerContent(layer);
          layer.style.backgroundImage = `url("${cssUrl(url)}")`;
          layer.style.backgroundSize = bg.size;
          layer.style.backgroundPosition = POSITION_MAP[bg.position] ?? "center";
          layer.style.backgroundRepeat = bg.repeat;
          mediaShown = true;
          break;
        }

        case "template": {
          const uri = resolveTemplate(bg.template);
          if (!uri) {
            logger.warn(SCOPE, `неизвестная сцена «${String(bg.template)}» — фон темы`);
            clearLayerContent(layer);
            break;
          }
          clearLayerContent(layer);
          layer.style.backgroundImage = `url("${cssUrl(uri)}")`;
          layer.style.backgroundSize = bg.size;
          layer.style.backgroundPosition = POSITION_MAP[bg.position] ?? "center";
          layer.style.backgroundRepeat = bg.repeat;
          mediaShown = true;
          break;
        }

        case "video": {
          const url = sanitizeUrl(bg.url);
          if (!url) {
            logger.warn(SCOPE, "недопустимая ссылка на видео — фон темы");
            clearLayerContent(layer);
            break;
          }
          // Статичные background-стили чистим, но <video> НЕ пересоздаём —
          // иначе каждый apply() перезапускал бы воспроизведение.
          layer.style.background = "";
          layer.style.backgroundImage = "";
          layer.style.backgroundSize = "";
          layer.style.backgroundPosition = "";
          layer.style.backgroundRepeat = "";
          mediaShown = applyVideo(ctx, layer, url);
          break;
        }
      }

      /* --- общие параметры слоя --- */
      layer.style.opacity = (clamp(bg.opacity, 10, 100) / 100).toFixed(2);
      const blur = Math.round(clamp(bg.blur, 0, 20));
      layer.style.filter = blur > 0 ? `blur(${blur}px)` : "none";
      applyAttachment(layer, bg.attachment);

      /* --- подложка (readability dimmer) --- */
      const overlayColor = sanitizeColor(bg.overlayColor);
      if (!overlayColor) logger.warn(SCOPE, `недопустимый цвет подложки — используем чёрный`);
      overlay.style.background = overlayColor ?? "#000000";
      if (!mediaShown) {
        // Без своего медиа-фона подложка затемняла бы фон темы — глушим её.
        overlay.style.opacity = "0";
      } else {
        let dim = clamp(bg.dim, 0, 90);
        // autoDim: консервативный пол 55% для image/video. Полный WCAG-расчёт
        // контраста — это фича интерфейса (dashboard), здесь только гарантия.
        if (ctx.settings.experimental.autoDim && (bg.mode === "image" || bg.mode === "video" || bg.mode === "template")) {
          dim = Math.max(dim, 55);
        }
        overlay.style.opacity = (dim / 100).toFixed(2);
      }
    } catch (err) {
      logger.error(SCOPE, `apply failed: ${String(err)}`);
    }
  },

  destroy(): void {
    if (visBound) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      visBound = false;
    }
    const layer = layerEl;
    if (layer) dropVideo(layer);
    layer?.remove();
    overlayEl?.remove();
    layerEl = null;
    overlayEl = null;
    videoEl = null;
    lastSettings = null;
  },
};

/* ------------------------------ internals ------------------------------ */

/** Идемпотентное создание/возврат обоих слоёв (переиспользует узлы). */
function ensureNodes(wrapper: HTMLElement | null): void {
  const host = wrapper ?? document.body; // fallback, пока обёртки нет на странице

  const foundLayer = document.getElementById(LAYER_ID);
  if (foundLayer && foundLayer !== layerEl) layerEl = foundLayer;
  if (!layerEl || !layerEl.isConnected) {
    layerEl = document.createElement("div");
    layerEl.id = LAYER_ID;
    layerEl.setAttribute("aria-hidden", "true");
    // Инлайн-гарантия контракта §5 (z-index/-fixed), даже если base.css
    // ещё не подключён — слои обязаны быть позади контента.
    layerEl.style.position = "fixed";
    layerEl.style.zIndex = "-2";
    logger.debug(SCOPE, "layer created");
  }

  const foundOverlay = document.getElementById(OVERLAY_ID);
  if (foundOverlay && foundOverlay !== overlayEl) overlayEl = foundOverlay;
  if (!overlayEl || !overlayEl.isConnected) {
    overlayEl = document.createElement("div");
    overlayEl.id = OVERLAY_ID;
    overlayEl.setAttribute("aria-hidden", "true");
    overlayEl.style.position = "fixed";
    overlayEl.style.zIndex = "-1";
    overlayEl.style.pointerEvents = "none";
  }

  // Слои — первыми детьми обёртки: позади контента, но над html-фоном.
  if (layerEl.parentElement !== host) host.prepend(layerEl);
  if (overlayEl.parentElement !== host) host.prepend(overlayEl);
}

/** Убирает медиа-контент со слоя (mode=none или ошибка валидации). */
function clearLayerContent(layer: HTMLElement): void {
  dropVideo(layer);
  layer.replaceChildren();
  layer.style.background = "";
  layer.style.backgroundImage = "";
  layer.style.backgroundSize = "";
  layer.style.backgroundPosition = "";
  layer.style.backgroundRepeat = "";
}

function resolveGradient(preset: string, custom: string): string | null {
  if (preset === "custom") return sanitizeGradient(custom);
  const found = GRADIENT_PRESETS[preset];
  if (!found) return null; // "none" и любые неизвестные пресеты → фон темы
  return sanitizeGradient(found);
}

/**
 * fixed → слой прибит к вьюпорту; scroll → absolute по высоте экрана
 * (правило .rfs-bg-scroll дублирует это в base.css, инлайн — надёжнее).
 */
function applyAttachment(layer: HTMLElement, attachment: Settings["background"]["attachment"]): void {
  if (attachment === "scroll") {
    layer.classList.add(SCROLL_CLASS);
    layer.style.position = "absolute";
    layer.style.top = "0";
    layer.style.left = "0";
    layer.style.width = "100%";
    layer.style.height = "100vh";
  } else {
    layer.classList.remove(SCROLL_CLASS);
    layer.style.position = "fixed";
    layer.style.top = "0";
    layer.style.left = "0";
    layer.style.width = "100%";
    layer.style.height = "100%";
  }
}

/** Находит/создаёт <video> внутри слоя. muted обязателен для autoplay. */
function videoForLayer(layer: HTMLElement): HTMLVideoElement {
  if (videoEl && videoEl.isConnected && videoEl.parentElement === layer) return videoEl;
  const existing = layer.querySelector("video");
  if (existing instanceof HTMLVideoElement) {
    videoEl = existing;
    return videoEl;
  }
  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true; // мутируем и до, и после атрибута — страховка
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.preload = "metadata";
  video.addEventListener("error", onVideoError);
  video.style.position = "absolute";
  video.style.inset = "0";
  video.style.width = "100%";
  video.style.height = "100%";
  layer.appendChild(video);
  videoEl = video;
  return video;
}

function dropVideo(layer: HTMLElement): void {
  const video = videoEl ?? layer.querySelector("video");
  videoEl = null;
  if (video instanceof HTMLVideoElement) {
    try {
      video.pause();
      video.removeAttribute("src");
      video.load(); // сбрасывает сетевую загрузку
    } catch {
      /* видео уже отключено — нечего сбрасывать */
    }
    video.removeEventListener("error", onVideoError);
    video.remove();
  }
}

function onVideoError(): void {
  const src = videoEl?.currentSrc || videoEl?.getAttribute("src") || "";
  if (src === lastVideoErrorSrc) return; // один варн на источник
  lastVideoErrorSrc = src;
  logger.warn(SCOPE, `видео не загрузилось (${src}) — остаётся прозрачный фон`);
}

/** Раскладывает видео по настройкам. Возвращает, что-то ли показано. */
function applyVideo(ctx: ModuleContext, layer: HTMLElement, url: string): boolean {
  const bg = ctx.settings.background;
  const video = videoForLayer(layer);
  if (video.getAttribute("src") !== url) {
    video.src = url;
    video.load();
  }
  video.loop = bg.videoLoop;
  // size языка (30%/50%) для видео не применим — маппим на object-fit.
  video.style.objectFit = bg.size === "contain" ? "contain" : "cover";
  // Режим "battery" = статика: первый кадр виден (preload=metadata), без play().
  const wantPlay = bg.videoAutoplay && ctx.settings.performance.mode !== "battery";
  video.autoplay = wantPlay;
  if (wantPlay) tryPlay(video, ctx.settings);
  else video.pause();
  return true;
}

/** Запуск воспроизведения с мирным отказом, если браузер запретил autoplay. */
function tryPlay(video: HTMLVideoElement, settings: Settings): void {
  if (document.hidden && settings.background.pauseWhenHidden) return;
  try {
    const p = video.play();
    if (p) p.catch(() => { /* autoplay заблокирован — видео просто стоит кадром */ });
  } catch {
    /* play() кинул — игнорируем */
  }
}

function bindVisibility(): void {
  if (visBound) return;
  document.addEventListener("visibilitychange", onVisibilityChange);
  visBound = true;
}

/** Пауза/возобновление видео при скрытии вкладки (settings.pauseWhenHidden). */
function onVisibilityChange(): void {
  const settings = lastSettings;
  const video = videoEl;
  if (!settings || !video || !video.isConnected) return;
  if (document.hidden) {
    if (settings.background.pauseWhenHidden) video.pause();
    return;
  }
  if (settings.background.mode === "video" && settings.background.videoAutoplay) {
    if (settings.performance.mode === "battery") return;
    tryPlay(video, settings);
  }
}

/* --------------------- Готовые сцены (mode: template) --------------------- */

/** Задний план города (дальний силуэт): [x, ширина, высота]. */
const CITY_BACK: ReadonlyArray<readonly [number, number, number]> = [
  [60, 220, 300], [340, 260, 240], [650, 240, 340], [950, 260, 270], [1280, 240, 320],
];

/** Передний план города: [x, ширина, высота], основание на y=900. */
const CITY_FRONT: ReadonlyArray<readonly [number, number, number]> = [
  [-30, 170, 420], [150, 110, 300], [280, 180, 510], [480, 130, 380], [630, 190, 460],
  [840, 120, 320], [980, 170, 540], [1170, 140, 400], [1330, 190, 480], [1540, 120, 350],
];

/**
 * Встроенные сцены-фоны: settings.background.template → data:image/svg+xml.
 * Картинки рисуются самим расширением (без сети); наружу уходит только id
 * из белого списка, sanitizeUrl для этого не модифицируется.
 */
const TEMPLATE_SVG: Readonly<Record<string, string>> = {
  stars: `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">` +
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
    `<stop stop-color="#04040e"/><stop offset="1" stop-color="#141b40"/></linearGradient>` +
    `<radialGradient id="halo"><stop stop-color="#efecff" stop-opacity=".5"/>` +
    `<stop offset="1" stop-color="#efecff" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="1600" height="900" fill="url(#sky)"/>` +
    `<circle cx="1270" cy="200" r="150" fill="url(#halo)"/>` +
    `<circle cx="1270" cy="200" r="54" fill="#f1eeff" opacity=".92"/>` +
    `<circle cx="1256" cy="186" r="10" fill="#cfcbf0" opacity=".5"/>` +
    `<circle cx="1288" cy="214" r="7" fill="#cfcbf0" opacity=".4"/>` +
    starField(110) +
    `</svg>`,

  fog: `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">` +
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
    `<stop stop-color="#0b1116"/><stop offset=".55" stop-color="#152430"/>` +
    `<stop offset="1" stop-color="#1d3340"/></linearGradient>` +
    `<radialGradient id="glow"><stop stop-color="#d9f2ea" stop-opacity=".35"/>` +
    `<stop offset="1" stop-color="#d9f2ea" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="1600" height="900" fill="url(#sky)"/>` +
    `<circle cx="1150" cy="240" r="220" fill="url(#glow)"/>` +
    `<circle cx="1150" cy="240" r="70" fill="#e9f7f2" opacity=".5"/>` +
    `<ellipse cx="380" cy="600" rx="760" ry="150" fill="#cfe8e1" opacity=".06"/>` +
    `<ellipse cx="1180" cy="660" rx="700" ry="140" fill="#cfe8e1" opacity=".07"/>` +
    `<ellipse cx="760" cy="720" rx="900" ry="170" fill="#dff1eb" opacity=".07"/>` +
    `<ellipse cx="300" cy="800" rx="800" ry="160" fill="#dff1eb" opacity=".08"/>` +
    `<ellipse cx="1300" cy="830" rx="750" ry="150" fill="#eaf7f3" opacity=".07"/>` +
    `<path d="M0 640L420 610 760 650 1120 605 1600 645" fill="none" stroke="#bfe0d6" stroke-width="3" opacity=".18"/>` +
    `</svg>`,

  city:
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">` +
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
    `<stop stop-color="#06050f"/><stop offset=".6" stop-color="#1b1038"/>` +
    `<stop offset="1" stop-color="#331548"/></linearGradient></defs>` +
    `<rect width="1600" height="900" fill="url(#sky)"/>` +
    starField(35, 340) +
    `<circle cx="240" cy="170" r="46" fill="#f6efd8" opacity=".85"/>` +
    `<circle cx="240" cy="170" r="90" fill="#f6efd8" opacity=".08"/>` +
    CITY_BACK.map(([x, w, h]) => `<rect x="${x}" y="${900 - h}" width="${w}" height="${h}" fill="#1d1636"/>`).join("") +
    CITY_FRONT.map(([x, w, h]) => `<rect x="${x}" y="${900 - h}" width="${w}" height="${h}" fill="#0c0a1c"/>`).join("") +
    `<rect x="1064" y="310" width="3" height="52" fill="#0c0a1c"/><circle cx="1065" cy="306" r="5" fill="#ff4d6a" opacity=".9"/>` +
    cityWindows() +
    `</svg>`,

  grid:
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">` +
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
    `<stop stop-color="#100526"/><stop offset="1" stop-color="#4b0b52"/></linearGradient>` +
    `<linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">` +
    `<stop stop-color="#ffe08a"/><stop offset=".55" stop-color="#ff9a6b"/>` +
    `<stop offset="1" stop-color="#ff5f9e"/></linearGradient>` +
    `<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">` +
    `<stop stop-color="#370a4a"/><stop offset="1" stop-color="#0d0320"/></linearGradient>` +
    `<clipPath id="sunclip"><circle cx="800" cy="415" r="145"/></clipPath></defs>` +
    `<rect width="1600" height="470" fill="url(#sky)"/>` +
    `<circle cx="800" cy="415" r="200" fill="#ff5f9e" opacity=".12"/>` +
    `<circle cx="800" cy="415" r="145" fill="url(#sun)"/>` +
    `<g clip-path="url(#sunclip)" fill="#1a0730" opacity=".85">` +
    `<rect x="0" y="356" width="1600" height="7"/><rect x="0" y="382" width="1600" height="9"/>` +
    `<rect x="0" y="411" width="1600" height="11"/><rect x="0" y="444" width="1600" height="13"/></g>` +
    `<rect y="470" width="1600" height="430" fill="url(#ground)"/>` +
    `<rect y="452" width="1600" height="36" fill="#ff5f9e" opacity=".18"/>` +
    `<rect y="465" width="1600" height="10" fill="#ff5f9e" opacity=".9"/>` +
    gridLines() +
    `</svg>`,

  waves:
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">` +
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
    `<stop stop-color="#03152b"/><stop offset="1" stop-color="#0a3355"/></linearGradient>` +
    `<radialGradient id="halo"><stop stop-color="#e8f6ff" stop-opacity=".4"/>` +
    `<stop offset="1" stop-color="#e8f6ff" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="1600" height="900" fill="url(#sky)"/>` +
    `<circle cx="330" cy="200" r="140" fill="url(#halo)"/>` +
    `<circle cx="330" cy="200" r="52" fill="#eef8ff" opacity=".9"/>` +
    starField(45) +
    `<path d="M0 520C260 470 470 570 760 520S1330 460 1600 510V900H0Z" fill="#0b2c4e" opacity=".92"/>` +
    `<path d="M0 610C280 560 520 670 800 610S1360 550 1600 600V900H0Z" fill="#114468"/>` +
    `<path d="M0 700C250 650 540 760 830 700S1390 640 1600 690V900H0Z" fill="#185c8c"/>` +
    `<path d="M0 790C270 745 560 850 840 790S1400 735 1600 780V900H0Z" fill="#2176ab"/>` +
    `<path d="M0 520C260 470 470 570 760 520S1330 460 1600 510" fill="none" stroke="#7fd4ff" stroke-width="3" opacity=".35"/>` +
    `<path d="M0 610C280 560 520 670 800 610S1360 550 1600 600" fill="none" stroke="#7fd4ff" stroke-width="3" opacity=".28"/>` +
    `<path d="M0 700C250 650 540 760 830 700S1390 640 1600 690" fill="none" stroke="#7fd4ff" stroke-width="3" opacity=".22"/>` +
    `<path d="M0 790C270 745 560 850 840 790S1400 735 1600 780" fill="none" stroke="#7fd4ff" stroke-width="3" opacity=".18"/>` +
    `</svg>`,
};

/** id сцены → data-URI; собирается один раз при загрузке модуля. */
const TEMPLATE_URIS: ReadonlyMap<string, string> = new Map(
  Object.entries(TEMPLATE_SVG).map(
    ([id, svg]): [string, string] => [id, `data:image/svg+xml,${encodeURIComponent(svg)}`],
  ),
);

/**
 * Резолвит id встроенной сцены в data:image/svg+xml URI.
 * Неизвестный id (например, из чужого импорта) → null: фон остаётся тематический.
 */
export function resolveTemplate(id: string): string | null {
  return TEMPLATE_URIS.get(id) ?? null;
}

/** Детерминированный PRNG (LCG): сцены всегда выглядят одинаково. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Рассыпанные звёзды (детерминированные). */
function starField(count: number, maxY = 900): string {
  const rnd = lcg(1337);
  let out = "";
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * 1600);
    const y = Math.floor(rnd() * maxY);
    const roll = rnd();
    const r = roll > 0.9 ? 2 : roll > 0.65 ? 1.4 : 0.9;
    const o = (0.3 + rnd() * 0.65).toFixed(2);
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>`;
  }
  return out;
}

/** Окна передних домов города (детерминированные) — одним <path> ради веса. */
function cityWindows(): string {
  const rnd = lcg(24601);
  let d = "";
  for (const [bx, bw, bh] of CITY_FRONT) {
    const cols = Math.max(1, Math.floor((bw - 24) / 24));
    const rows = Math.max(1, Math.floor((bh - 30) / 36));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (rnd() > 0.4) continue;
        const x = bx + 14 + c * 24;
        const y = 900 - bh + 18 + r * 36;
        d += `M${x} ${y}h11v16h-11z`;
      }
    }
  }
  return d ? `<path d="${d}" fill="#ffd98a" opacity=".75"/>` : "";
}

/** Ретро-сетка в перспективе для сцены "grid" (горизонт на y=470). */
function gridLines(): string {
  let out = `<g fill="none" stroke="#ff8fc4" stroke-width="2" opacity=".5">`;
  for (let x = -1400; x <= 3000; x += 175) {
    out += `<path d="M${x} 900L800 470"/>`;
  }
  out += `</g><g fill="none" stroke="#ff8fc4" stroke-width="1.5" opacity=".4">`;
  for (let i = 1; i <= 12; i++) {
    const y = Math.round(470 + 430 * Math.pow(i / 12, 2.1));
    out += `<path d="M0 ${y}H1600"/>`;
  }
  return out + `</g>`;
}
