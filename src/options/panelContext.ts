/**
 * Services handed to every dashboard panel.
 *
 * Panels never touch storage directly — they go through PanelContext, which
 * guarantees validation, live sync and toast feedback in one place.
 */
import type { Settings } from "../types/settings";
import type { SectionId } from "../settings/schema";

export type ToastKind = "info" | "success" | "error";

export interface PanelContext {
  /** Current (validated) settings snapshot. */
  settings(): Settings;
  /** Persist a single setting — validated, live-synced to forum tabs. */
  update(key: string, value: unknown): Promise<void>;
  /** Persist arbitrary settings changes in one write. */
  patch(patch: Record<string, unknown>): Promise<void>;
  /** Re-render the active section. */
  refresh(): void;
  /** Show a toast notification. */
  toast(message: string, kind?: ToastKind): void;
  /** Blocking confirmation (Reset All uses it). */
  confirm(message: string, confirmLabel?: string): Promise<boolean>;
  /** Navigate to another section. */
  openSection(id: SectionId): void;
  /** Subscribe to settings changes (fires after local updates too). */
  onSettingsChange(handler: (settings: Settings) => void): () => void;
  /** Switch theme + toast (shared by grid/popup logic). */
  applyTheme(themeId: string): Promise<void>;
  /**
   * Reset every setting to defaults. `keepThemes` false additionally removes
   * user-created themes — used by the advanced panel's nuclear reset.
   */
  resetAll(keepThemes: boolean): Promise<void>;
}
