/**
 * Sidebar sections of the dashboard.
 *
 * Sections are presentation groupings: a section either renders schema
 * settings (optionally plus an extra panel) or a fully custom panel
 * (themes grid, editor, import/export, dashboard home).
 */
import type { SectionId, SettingsGroup } from "../settings/schema";
import { renderAiPanel } from "./panels/aiPanel";
import { renderNavbarPanel } from "./panels/navbarPanel";

export interface SectionDef {
  id: SectionId;
  /** i18n key for the sidebar label. */
  titleKey: string;
  kind: "settings" | "custom";
  /** Schema groups rendered by this section (settings kind). */
  groups?: SettingsGroup[];
  /**
   * Optional extra panel appended under the schema controls
   * (e.g. AI section: settings + AI tool panels).
   */
  panel?: SectionPanel;
  /** Custom panel renderer id (custom kind). */
  customId?: string;
}

export type SectionPanel = (root: HTMLElement, ctx: import("./panelContext").PanelContext) => void | (() => void);

export const SECTIONS: readonly SectionDef[] = [
  { id: "dashboard", titleKey: "nav.dashboard", kind: "custom", customId: "dashboard" },
  { id: "themes", titleKey: "nav.themes", kind: "custom", customId: "themes" },
  { id: "editor", titleKey: "nav.editor", kind: "custom", customId: "editor" },
  {
    id: "appearance",
    titleKey: "nav.appearance",
    kind: "settings",
    groups: ["appearance"],
  },
  { id: "background", titleKey: "nav.background", kind: "settings", groups: ["background"] },
  { id: "effects", titleKey: "nav.effects", kind: "settings", groups: ["effects", "transition"] },
  { id: "fonts", titleKey: "nav.fonts", kind: "settings", groups: ["font"] },
  { id: "cursor", titleKey: "nav.cursor", kind: "settings", groups: ["cursor"] },
  { id: "glass", titleKey: "nav.glass", kind: "settings", groups: ["glass"] },
  { id: "forumUi", titleKey: "nav.forumUi", kind: "settings", groups: ["tweaks"], panel: renderNavbarPanel },
  { id: "performance", titleKey: "nav.performance", kind: "settings", groups: ["performance"] },
  { id: "accessibility", titleKey: "nav.accessibility", kind: "settings", groups: ["accessibility"] },
  {
    id: "ai",
    titleKey: "nav.ai",
    kind: "settings",
    groups: ["ai"],
    panel: renderAiPanel,
  },
  { id: "io", titleKey: "nav.io", kind: "custom", customId: "io" },
  { id: "experimental", titleKey: "nav.experimental", kind: "settings", groups: ["experimental"] },
  { id: "advanced", titleKey: "nav.advanced", kind: "custom", customId: "advanced" },
];

export function sectionById(id: SectionId): SectionDef | undefined {
  return SECTIONS.find((s) => s.id === id);
}
