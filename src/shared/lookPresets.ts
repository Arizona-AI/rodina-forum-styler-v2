/**
 * One-click look presets shared by the dashboard («Быстрые стили» card) and
 * the popup («Настройка» tab). Each preset is a flat map of dotted settings
 * paths → values, applied in one write through PanelContext.patch (dashboard)
 * or a queued sequence of updateSetting calls (popup).
 *
 * `reset` mirrors `arizona` key-for-key with the schema defaults, so the two
 * buttons always touch exactly the same settings.
 */
import type { Settings } from "../types/settings";

export const LOOK_PRESETS = {
  arizona: {
    "appearance.logoStyle": "accent-static",
    "appearance.avatarStyle": "accent",
    "appearance.radiusMode": "custom",
    "appearance.radius": 8,
    "appearance.buttonShape": "rounded",
    "tweaks.accentButtons": true,
    "tweaks.accentThreadList": true,
    "tweaks.accentThreadsMeta": true,
    "tweaks.accentPostAttribution": true,
    "tweaks.accentNewBadge": true,
  },
  reset: {
    "appearance.logoStyle": "default",
    "appearance.avatarStyle": "default",
    "appearance.radiusMode": "theme",
    "appearance.radius": 12,
    "appearance.buttonShape": "theme",
    "tweaks.accentButtons": false,
    "tweaks.accentThreadList": false,
    "tweaks.accentThreadsMeta": false,
    "tweaks.accentPostAttribution": false,
    "tweaks.accentNewBadge": false,
  },
} as const satisfies Record<string, Partial<Record<keyof LookPaths, unknown>>>;

/** Dotted paths a look preset may touch (compile-time guard). */
type LookPaths = {
  [K in keyof Settings as K extends "appearance" | "tweaks"
    ? `${K}.${keyof Settings[K] & string}`
    : never]: true;
};

export type LookPresetId = keyof typeof LOOK_PRESETS;

/** A copy of the preset safe to feed into any patch/write API. */
export function lookPatch(kind: LookPresetId): Record<string, unknown> {
  return { ...LOOK_PRESETS[kind] };
}
