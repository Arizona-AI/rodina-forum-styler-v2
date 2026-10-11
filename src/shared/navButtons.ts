/**
 * Shared model of the parsed navbar buttons.
 *
 * The content script's navbar module publishes a list of these under
 * NAV_BUTTONS_KEY; the dashboard's navbar panel renders it as checkboxes.
 * Keeping the shape here (instead of inside the content module) lets both
 * bundles import it without pulling DOM code, and keeps `resolveNavId`
 * unit-testable — parsing and hiding must always agree on ids.
 */
export const NAV_BUTTONS_KEY = "rfs.navButtons";

export interface NavButton {
  /** Stable id: data-nav-id, else the href, else the label. */
  id: string;
  /** Display label shown in the dashboard. */
  name: string;
}

/** Id of a nav link: data-nav-id || href || label, clamped and trimmed. */
export function resolveNavId(attrs: {
  navId?: string | null;
  href?: string | null;
  name?: string | null;
}): string | null {
  const raw = attrs.navId || attrs.href || attrs.name;
  const id = (raw ?? "").trim();
  return id.length > 0 && id.length <= 200 ? id : null;
}
