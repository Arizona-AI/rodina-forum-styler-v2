/** Timing utilities: debounce, throttle, idle scheduling, rAF loops. */

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): ((...args: A) => void) & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: A): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
  wrapped.cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let last = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;
  return (...args: A): void => {
    const now = Date.now();
    lastArgs = args;
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      if (pending !== null) {
        clearTimeout(pending);
        pending = null;
      }
      last = now;
      fn(...args);
    } else if (pending === null) {
      pending = setTimeout(() => {
        pending = null;
        last = Date.now();
        if (lastArgs) fn(...lastArgs);
      }, remaining);
    }
  };
}

/** Run `fn` after the browser is idle (falls back to a timeout). */
export function scheduleIdle(fn: () => void, timeoutMs = 1500): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
    .requestIdleCallback;
  if (idle) idle(fn, { timeout: timeoutMs });
  else setTimeout(fn, 0);
}

export interface FrameLoop {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

/**
 * rAF loop with optional FPS cap and auto-pause when the document is hidden.
 * Used by the background effects canvas.
 */
export function createFrameLoop(tick: (dtMs: number) => void, fpsCap = 0): FrameLoop {
  let handle = 0;
  let running = false;
  let lastFrame = 0;
  let pausedByVisibility = false;

  const loop = (now: number): void => {
    if (!running) return;
    handle = requestAnimationFrame(loop);
    if (fpsCap > 0) {
      const minDelta = 1000 / fpsCap;
      if (now - lastFrame < minDelta) return;
    }
    const dt = lastFrame === 0 ? 16 : Math.min(now - lastFrame, 100);
    lastFrame = now;
    tick(dt);
  };

  const onVisibility = (): void => {
    if (document.hidden) {
      if (running) {
        pausedByVisibility = true;
        cancelAnimationFrame(handle);
        handle = 0;
      }
    } else if (pausedByVisibility && running) {
      pausedByVisibility = false;
      lastFrame = 0;
      handle = requestAnimationFrame(loop);
    }
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      lastFrame = 0;
      document.addEventListener("visibilitychange", onVisibility);
      handle = requestAnimationFrame(loop);
    },
    stop(): void {
      if (!running) return;
      running = false;
      pausedByVisibility = false;
      cancelAnimationFrame(handle);
      handle = 0;
      document.removeEventListener("visibilitychange", onVisibility);
    },
    get running(): boolean {
      return running;
    },
  };
}
