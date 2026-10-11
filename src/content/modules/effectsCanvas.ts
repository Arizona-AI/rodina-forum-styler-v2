/**
 * Canvas effects module — snow, geometric particles and space fog.
 *
 * Contract:
 *  #rfs-fx-canvas   fixed, pointer-events:none, z-index:-1, aria-hidden
 *  Runs through a capped rAF loop (performance.mode / fpsCap),
 *  auto-pauses on document.hidden, and skips rendering entirely under
 *  reduced motion (canvas is removed, not just hidden).
 *
 * Performance:
 *  - DPR capped at 1.5, resize debounced 200 ms;
 *  - no per-frame allocations: particles are reused, fog sprites are
 *    pre-rendered offscreen once per color;
 *  - hard cap of 200 shape/snow particles (fog = up to 5 blobs).
 *
 * Visibility: rAF does not fire on hidden tabs at all, and createFrameLoop
 * additionally cancels itself on visibilitychange — so effects never burn
 * CPU on a background tab regardless of effects.pauseWhenHidden. The setting
 * therefore needs no extra handling here (commented honestly per spec).
 */
import type { ContentModule, ModuleContext } from "./types";
import { isReducedMotion } from "../flags";
import { logger } from "../../shared/logger";
import { sanitizeColor } from "../../shared/validators";
import { parseColor } from "../../shared/color";
import { createFrameLoop, debounce, type FrameLoop } from "../../shared/timing";

const SCOPE = "effects";
const CANVAS_ID = "rfs-fx-canvas";
const TAU = Math.PI * 2;
const SNOW_COLOR = "#ffffff";
const MAX_PARTICLES = 200; // жёсткий потолок

/** Виды частиц: 0 — снег, 1 — фигуры, 2 — туман. */
type Kind = 0 | 1 | 2;
type ShapeKind = 0 | 1 | 2; // 0 — треугольник, 1 — квадрат, 2 — круг

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Радиус (для тумана — радиус спрайта). */
  r: number;
  /** Фаза синусоиды для покачивания снега. */
  phase: number;
  /** Амплитуда покачивания снега. */
  sway: number;
  rot: number;
  rotSpd: number;
  shape: ShapeKind;
  alpha: number;
  color: string;
  sprite: HTMLCanvasElement | null;
}

/* ------------------------------ module state ------------------------------ */

let canvas: HTMLCanvasElement | null = null;
let g2d: CanvasRenderingContext2D | null = null;
let loop: FrameLoop | null = null;
let loopCap = -1;
let particles: Particle[] = [];
let signature = "";
let vw = 0;
let vh = 0;
let resizeBound = false;

/** Глобальные параметры кадра (обновляются в apply, читаются в tick). */
const cfg = { alpha: 0.65, speed: 1 };

/** Кэш предрендеренных спрайтов тумана (radial gradient → canvas). */
const fogSprites = new Map<string, HTMLCanvasElement>();

const onResize = debounce(() => resizeCanvas(), 200);

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
}

export const effectsCanvasModule: ContentModule = {
  id: "effectsCanvas",

  init(_ctx: ModuleContext): void {
    if (resizeBound) return;
    window.addEventListener("resize", onResize);
    resizeBound = true;
  },

  apply(ctx: ModuleContext): void {
    try {
      const fx = ctx.settings.effects;
      const perf = ctx.settings.performance;
      const anyOn = fx.snow || fx.particles || fx.fog;
      const reduced = isReducedMotion(ctx.settings);
      // Приблизительная деградация: видеофон + degradeWithVideo → глушим canvas.
      const videoDegraded = perf.degradeWithVideo && ctx.settings.background.mode === "video";

      if (!anyOn || reduced || videoDegraded) {
        teardown();
        if (reduced && anyOn) logger.debug(SCOPE, "reduced motion — canvas effects off");
        return;
      }

      cfg.alpha = clamp(fx.opacity, 10, 100) / 100;
      cfg.speed = clamp(fx.speed, 0.2, 3);

      if (!ensureCanvas(ctx)) return;
      if (canvas && (canvas.width !== Math.round(vw * dpr()) || vw === 0)) resizeCanvas();

      syncParticles(ctx);

      const activeLoop = ensureLoop(normalizeCap(perf.fpsCap));
      if (!activeLoop.running) activeLoop.start();
    } catch (err) {
      logger.error(SCOPE, `apply failed: ${String(err)}`);
    }
  },

  destroy(): void {
    if (resizeBound) {
      window.removeEventListener("resize", onResize);
      onResize.cancel();
      resizeBound = false;
    }
    teardown();
    fogSprites.clear();
    signature = "";
  },
};

/* ------------------------------ internals ------------------------------ */

function dpr(): number {
  return clamp(window.devicePixelRatio || 1, 1, 1.5);
}

/** Создаёт/переподключает canvas (форум может удалить его — observers восстановят). */
function ensureCanvas(ctx: ModuleContext): boolean {
  if (!canvas) {
    const el = document.createElement("canvas");
    el.id = CANVAS_ID;
    el.setAttribute("aria-hidden", "true");
    el.style.position = "fixed";
    el.style.inset = "0";
    el.style.zIndex = "-1";
    el.style.pointerEvents = "none";
    el.style.display = "block";
    canvas = el;
    g2d = el.getContext("2d");
    if (!g2d) {
      logger.warn(SCOPE, "2d context unavailable — effects disabled");
      canvas = null;
      return false;
    }
  }
  const target = ctx.adapter.wrapper() ?? document.body;
  if (canvas.parentElement !== target) target.appendChild(canvas);
  if (!vw || !vh) resizeCanvas();
  return true;
}

function resizeCanvas(): void {
  const el = canvas;
  if (!el) return;
  vw = Math.max(1, window.innerWidth);
  vh = Math.max(1, window.innerHeight);
  const ratio = dpr();
  el.width = Math.round(vw * ratio);
  el.height = Math.round(vh * ratio);
  g2d?.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function normalizeCap(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0; // 0 = без ограничения
  return Math.round(clamp(raw, 10, 240));
}

function ensureLoop(cap: number): FrameLoop {
  if (!loop || loopCap !== cap) {
    loop?.stop();
    loop = createFrameLoop(tick, cap);
    loopCap = cap;
  }
  return loop;
}

function teardown(): void {
  loop?.stop();
  canvas?.remove();
  particles = [];
  signature = "";
}

/* --------------------------- particle model --------------------------- */

function palette(ctx: ModuleContext): string[] {
  // Токены уже валидированы движком тем, но подстраховываемся.
  return [
    sanitizeColor(ctx.tokens.primary) ?? "#7b68ee",
    sanitizeColor(ctx.tokens.secondary) ?? "#38bdf8",
    sanitizeColor(ctx.tokens.accent) ?? "#f472b6",
  ];
}

/** Пересобирает частицы только при изменении состава/палитры (idempotent). */
function syncParticles(ctx: ModuleContext): void {
  const fx = ctx.settings.effects;
  const perf = ctx.settings.performance;
  const colors = palette(ctx);

  const factor = perf.mode === "battery" ? 0.4 : perf.mode === "quality" ? 1.25 : 1;
  const total = Math.min(MAX_PARTICLES, Math.max(1, Math.round(clamp(fx.count, 20, 200) * factor)));
  const fogN = fx.fog ? Math.min(5, Math.max(3, Math.round(total / 30))) : 0;
  let snowN = 0;
  let shapeN = 0;
  if (fx.snow && fx.particles) {
    snowN = Math.round(total * 0.6);
    shapeN = total - snowN;
  } else if (fx.snow) {
    snowN = total;
  } else if (fx.particles) {
    shapeN = total;
  }

  const key = `${snowN}|${shapeN}|${fogN}|${colors.join(",")}`;
  if (key === signature) return;
  signature = key;

  particles = [];
  // Порядок отрисовки: туман ниже → он первым в массиве.
  for (let i = 0; i < fogN; i++) {
    const color = colors[i % colors.length] ?? "#7b68ee";
    particles.push({
      kind: 2,
      x: Math.random() * (vw || 1),
      y: Math.random() * (vh || 1),
      vx: (Math.random() - 0.5) * 0.16,
      vy: (Math.random() - 0.5) * 0.06,
      r: 160 + Math.random() * 160,
      phase: 0,
      sway: 0,
      rot: 0,
      rotSpd: 0,
      shape: 2,
      alpha: 0.3,
      color,
      sprite: fogSprite(color),
    });
  }
  for (let i = 0; i < shapeN; i++) {
    particles.push({
      kind: 1,
      x: Math.random() * (vw || 1),
      y: Math.random() * (vh || 1),
      vx: (Math.random() - 0.5) * 0.5,
      vy: 0.15 + Math.random() * 0.4,
      r: 5 + Math.random() * 9,
      phase: 0,
      sway: 0,
      rot: Math.random() * TAU,
      rotSpd: (Math.random() - 0.5) * 0.03,
      shape: (i % 3) as ShapeKind,
      alpha: 0.85,
      color: colors[i % colors.length] ?? "#7b68ee",
      sprite: null,
    });
  }
  for (let i = 0; i < snowN; i++) {
    particles.push({
      kind: 0,
      x: Math.random() * (vw || 1),
      y: Math.random() * (vh || 1),
      vx: (Math.random() - 0.5) * 0.3,
      vy: 0.4 + Math.random() * 1.1,
      r: 1 + Math.random() * 2.2,
      phase: Math.random() * TAU,
      sway: 8 + Math.random() * 22,
      rot: 0,
      rotSpd: 0,
      shape: 2,
      alpha: 0.85,
      color: SNOW_COLOR,
      sprite: null,
    });
  }
  logger.debug(SCOPE, `particles rebuilt: ${particles.length} (snow ${snowN}, shapes ${shapeN}, fog ${fogN})`);
}

/** Оффскрин-спрайт тумана: радиальный градиент один раз на цвет. */
function fogSprite(color: string): HTMLCanvasElement | null {
  const cached = fogSprites.get(color);
  if (cached) return cached;
  const rgb = parseColor(color);
  if (!rgb) return null;
  const size = 256;
  const el = document.createElement("canvas");
  el.width = size;
  el.height = size;
  const ctx2d = el.getContext("2d");
  if (!ctx2d) return null;
  const c = size / 2;
  const grad = ctx2d.createRadialGradient(c, c, 0, c, c, c);
  const base = `${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)}`;
  grad.addColorStop(0, `rgba(${base},0.5)`);
  grad.addColorStop(0.55, `rgba(${base},0.16)`);
  grad.addColorStop(1, `rgba(${base},0)`);
  ctx2d.fillStyle = grad;
  ctx2d.fillRect(0, 0, size, size);
  fogSprites.set(color, el);
  return el;
}

/* ------------------------------- rendering ------------------------------- */

function tick(dt: number): void {
  const el = canvas;
  const ctx2d = g2d;
  if (!el || !ctx2d) return;
  if (!el.isConnected) {
    // Страница удалила canvas — observers вызовут apply, он переподключит.
    loop?.stop();
    return;
  }
  try {
    const step = (dt / 16.667) * cfg.speed;
    ctx2d.clearRect(0, 0, vw, vh);
    ctx2d.globalAlpha = cfg.alpha;

    for (const p of particles) {
      if (p.kind === 2) {
        // Туман: медленный дрейф, обёртка с запасом за краями.
        p.x += p.vx * step;
        p.y += p.vy * step;
        const m = p.r;
        if (p.x < -m) p.x = vw + m;
        else if (p.x > vw + m) p.x = -m;
        if (p.y < -m) p.y = vh + m;
        else if (p.y > vh + m) p.y = -m;
        if (p.sprite) {
          ctx2d.globalAlpha = cfg.alpha * p.alpha;
          ctx2d.drawImage(p.sprite, p.x - m, p.y - m, m * 2, m * 2);
        }
        continue;
      }

      if (p.kind === 1) {
        // Фигуры: медленный подъём вбок + вращение.
        p.x += p.vx * step;
        p.y -= p.vy * step;
        p.rot += p.rotSpd * step;
        if (p.y < -p.r) {
          p.y = vh + p.r;
          p.x = Math.random() * vw;
        } else if (p.x < -p.r) p.x = vw + p.r;
        else if (p.x > vw + p.r) p.x = -p.r;

        const drawX = p.x;
        const drawY = p.y;
        ctx2d.globalAlpha = cfg.alpha * p.alpha;
        ctx2d.save();
        ctx2d.translate(drawX, drawY);
        ctx2d.rotate(p.rot);
        ctx2d.beginPath();
        if (p.shape === 0) {
          ctx2d.moveTo(0, -p.r);
          ctx2d.lineTo(p.r, p.r);
          ctx2d.lineTo(-p.r, p.r);
          ctx2d.closePath();
        } else if (p.shape === 1) {
          ctx2d.rect(-p.r, -p.r, p.r * 2, p.r * 2);
        } else {
          ctx2d.arc(0, 0, p.r, 0, TAU);
        }
        ctx2d.fillStyle = p.color;
        ctx2d.fill();
        ctx2d.strokeStyle = p.color;
        ctx2d.lineWidth = 1;
        ctx2d.stroke();
        ctx2d.restore();
        continue;
      }

      // Снег: падение вниз + синусоидальное покачивание.
      p.phase += 0.03 * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      if (p.y > vh + p.r) {
        p.y = -p.r;
        p.x = Math.random() * vw;
      } else if (p.x < -p.r) p.x = vw + p.r;
      else if (p.x > vw + p.r) p.x = -p.r;

      ctx2d.globalAlpha = cfg.alpha * p.alpha;
      ctx2d.fillStyle = SNOW_COLOR;
      ctx2d.beginPath();
      ctx2d.arc(p.x + Math.sin(p.phase) * p.sway, p.y, p.r, 0, TAU);
      ctx2d.fill();
    }
    ctx2d.globalAlpha = 1;
  } catch (err) {
    logger.error(SCOPE, `render failed: ${String(err)}`);
    loop?.stop();
  }
}
