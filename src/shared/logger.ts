/**
 * Leveled logger with a bounded ring buffer.
 *
 * - Silent unless debug mode is enabled (settings.advanced.debugMode).
 * - Keeps the last N entries in memory so the Debug Report can export them.
 * - Never logs secrets: callers pass plain strings, the logger redacts
 *   anything that looks like an API key before storing it.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  ts: number;
  level: LogLevel;
  scope: string;
  message: string;
}

const MAX_ENTRIES = 200;
const SECRET_PATTERN = /(sk-[a-z0-9_-]{8,}|bearer\s+[a-z0-9._-]{8,}|api[_-]?key["']?\s*[:=]\s*["']?[a-z0-9._-]{8,})/gi;

class Logger {
  private buffer: LogEntry[] = [];
  private enabled = false;
  private listeners = new Set<(entry: LogEntry) => void>();

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private push(level: LogLevel, scope: string, message: unknown): void {
    const text = redact(typeof message === "string" ? message : stringify(message));
    const entry: LogEntry = { ts: Date.now(), level, scope, message: text };
    this.buffer.push(entry);
    if (this.buffer.length > MAX_ENTRIES) this.buffer.splice(0, this.buffer.length - MAX_ENTRIES);
    for (const listener of this.listeners) listener(entry);
    if (!this.enabled && level !== "error") return;
    const line = `[RFS:${scope}] ${text}`;
    switch (level) {
      case "debug":
        console.debug(line);
        break;
      case "info":
        console.info(line);
        break;
      case "warn":
        console.warn(line);
        break;
      case "error":
        console.error(line);
        break;
    }
  }

  debug(scope: string, message: unknown): void {
    this.push("debug", scope, message);
  }

  info(scope: string, message: unknown): void {
    this.push("info", scope, message);
  }

  warn(scope: string, message: unknown): void {
    this.push("warn", scope, message);
  }

  error(scope: string, message: unknown): void {
    this.push("error", scope, message);
  }

  /** Snapshot for the debug report. */
  drain(): LogEntry[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }

  onEntry(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function stringify(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function redact(text: string): string {
  return text.replace(SECRET_PATTERN, "[redacted]");
}

export const logger = new Logger();
