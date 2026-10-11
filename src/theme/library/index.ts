/**
 * Built-in theme catalog.
 *
 * Data-driven: `rodina-eclipse` first, every concept (concepts.ts) expanded
 * across every variant (variants.ts) — 1 + 16 × 7 = 113 — plus the 116
 * Arizona Forum Styler presets (arizona.ts, generated from their popup.js).
 * Total: 229 themes with globally unique kebab-case ids.
 */
import type { ThemeDefinition } from "../../types/theme";
import { DEFAULT_THEME_TOKENS } from "../validate";
import { CONCEPTS } from "./concepts";
import { VARIANTS } from "./variants";
import { ARIZONA_THEMES } from "./arizona";

/** The extension's default theme — always the first entry of the catalog. */
const RODINA_ECLIPSE: ThemeDefinition = {
  id: "rodina-eclipse",
  name: "Rodina Eclipse",
  description: "Родная тёмная палитра форума с алым акцентом.",
  category: "dark",
  mode: "dark",
  tokens: { ...DEFAULT_THEME_TOKENS },
};

function buildCatalog(): ThemeDefinition[] {
  const catalog: ThemeDefinition[] = [RODINA_ECLIPSE];
  for (const concept of CONCEPTS) {
    for (const variant of VARIANTS) {
      catalog.push({
        id: `${concept.id}-${variant.slug}`,
        name: `${concept.name} — ${variant.label}`,
        description: `${concept.description} ${variant.note}`,
        category: concept.category,
        mode: concept.mode,
        tokens: variant.apply(concept.tokens, concept.mode),
      });
    }
  }
  catalog.push(...ARIZONA_THEMES);
  return catalog;
}

/** Every built-in theme, `rodina-eclipse` first. */
export const BUILTIN_THEMES: ThemeDefinition[] = buildCatalog();

export { CONCEPTS, VARIANTS };
