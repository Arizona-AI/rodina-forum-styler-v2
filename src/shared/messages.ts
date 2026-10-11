/** Message types shared between the dashboard/popup and the content script. */

export interface ContentStatus {
  enabled: boolean;
  template: string;
  xenforoVersion: string | null;
  activeThemeId: string;
  modules: Array<{ id: string; active: boolean; ok: boolean }>;
  selectorHealth: Array<{ id: string; found: boolean; matched: string | null }>;
}

export interface DebugReport {
  generatedAt: string;
  extensionVersion: string;
  userAgent: string;
  url: string;
  forum: {
    template: string;
    xenforoVersion: string | null;
    loggedIn: boolean;
  };
  status: ContentStatus;
  settingsSummary: Record<string, unknown>;
  logs: Array<{ ts: number; level: string; scope: string; message: string }>;
  performance: {
    applyTimeMs: number | null;
    styleBytes: number;
    storageBytes: number | null;
  };
}

export type RfsRequest =
  | { type: "status" }
  | { type: "debug-report" }
  | { type: "apply-now" };

export type RfsResponse =
  | { ok: true; status?: ContentStatus; report?: DebugReport }
  | { ok: false; error: string };

export const MESSAGE_TARGET_PREFIX = "rfs:";
