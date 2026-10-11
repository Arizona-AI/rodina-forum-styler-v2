/**
 * Content-script module contract.
 *
 * Modules own a slice of the styling experience (background media, canvas
 * effects, fonts, cursors, transitions…). They receive a fresh context on
 * every apply and must be idempotent: the orchestrator calls apply() after
 * settings changes and after forum navigations.
 */
import type { Settings } from "../../types/settings";
import type { ThemeTokens } from "../../types/theme";
import type { ForumAdapter } from "../../forum/adapter";
import type { StyleHost } from "../styleHost";

export interface ModuleContext {
  settings: Settings;
  host: StyleHost;
  adapter: ForumAdapter;
  tokens: ThemeTokens;
}

export interface ContentModule {
  /** Unique id, matches the debug panel's module list. */
  id: string;
  /** One-time setup (DOM nodes, listeners). Called even when disabled. */
  init(ctx: ModuleContext): void;
  /** Project settings onto the page. Must be safe to call repeatedly. */
  apply(ctx: ModuleContext): void;
  /** Called after a forum navigation (content replaced). */
  onNavigate?(ctx: ModuleContext): void;
  /** Full teardown (used when styling is switched off). */
  destroy?(ctx: ModuleContext): void;
}
