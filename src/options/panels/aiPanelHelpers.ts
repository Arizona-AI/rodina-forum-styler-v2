/**
 * Small shared helper for the AI panel: classify a generated token set
 * into (mode, category) so "Apply result" can save it as a custom theme
 * with sane metadata. Kept out of the panel to stay unit-testable.
 */
import type { ThemeCategory, ThemeMode, ThemeTokens } from "../../types/theme";
import { luminance, parseColor } from "../../shared/color";

export interface ModeMeta {
  mode: ThemeMode;
  category: ThemeCategory;
}

/** Dark when the page background luminance is below the comfort threshold. */
export function detectModeMeta(tokens: ThemeTokens): ModeMeta {
  const rgb = parseColor(tokens.pageBg);
  const mode: ThemeMode = rgb && luminance(rgb) < 0.45 ? "dark" : "light";
  const category: ThemeCategory = mode;
  return { mode, category };
}
