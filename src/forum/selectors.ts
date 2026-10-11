/**
 * Selector registry for the Rodina RP forum (XenForo 2.3 + custom TeslaCloud
 * theming) and stock XenForo 2.x.
 *
 * Design rules (automatic DOM adaptation):
 *  1. Candidates are ordered: forum-specific classes first, stock XenForo
 *     classes next, semantic fallbacks (landmarks/tags) last.
 *  2. Nothing in the codebase hard-codes a single selector string — modules
 *     ask the adapter for a component id.
 *  3. `auditSelectorHealth()` reports which ids resolved, so the debug panel
 *     shows exactly what a forum redesign broke.
 *
 * Research basis (2026-09): live DOM inspection of forum.rodina-rp.com —
 * templates forum_list / forum_view / thread_view / member_view, XF 2.3
 * (html[data-xf="2.3"]), custom top bar (.p-navTop) instead of stock
 * .p-header, side nav (.p-sideNav), no --xf-* CSS variables at :root.
 */

export interface SelectorSpec {
  /** Stable component id used by all modules. */
  id: string;
  /** Ordered selector candidates — first match wins. */
  candidates: readonly string[];
  /** Optional semantic check applied to the first candidate that matches. */
  semantic?: (el: Element) => boolean;
}

const isFooter = (el: Element): boolean => el.tagName === "FOOTER" || el.classList.contains("p-footer");
const isNav = (el: Element): boolean => el.tagName === "NAV" || el.classList.contains("p-nav");

export const SELECTOR_REGISTRY: readonly SelectorSpec[] = [
  /* --- page skeleton --- */
  { id: "pageWrapper", candidates: ["#top.p-pageWrapper", ".p-pageWrapper"] },
  { id: "pageBody", candidates: [".p-body", "#top > div"] },
  { id: "pageInner", candidates: [".p-body-inner", ".p-body"] },
  { id: "topBar", candidates: [".p-navTop", ".p-header", ".p-navSticky"] },
  { id: "nav", candidates: ["nav.p-nav", ".p-nav"], semantic: isNav },
  { id: "navList", candidates: [".p-nav-list", ".p-nav-links"] },
  { id: "sectionLinks", candidates: [".p-sectionLinks"] },
  { id: "headerLogo", candidates: [".p-header-logo", ".p-nav-brandLink"] },
  { id: "logoImg", candidates: [".p-header-logo img", ".p-nav-brandLink img"] },
  { id: "styleVariation", candidates: [".js-styleVariationsLink", "a[data-xf-click='style-variation']", "a[href*='misc/style-variation']"] },
  { id: "search", candidates: [".p-search", ".p-nav-search"] },
  { id: "navGroups", candidates: [".p-nav-opposite", ".p-navGroups"] },
  { id: "bodyHeader", candidates: [".p-body-header"] },
  { id: "title", candidates: [".p-title", ".p-body-header .p-title"] },
  { id: "description", candidates: [".p-description"] },
  { id: "breadcrumbs", candidates: [".p-breadcrumbs--container .p-breadcrumbs", ".p-breadcrumbs"] },
  { id: "content", candidates: [".p-body-content"] },
  { id: "main", candidates: [".p-body-main", ".p-body-content"] },
  { id: "sidebar", candidates: [".p-body-sidebar-container .p-body-sidebar", ".p-body-sidebar"] },
  { id: "footer", candidates: [".p-footer", "footer#footer", "footer"], semantic: isFooter },
  { id: "offCanvas", candidates: [".offCanvasMenu", ".offCanvasMenu-content"] },
  { id: "scrollButtons", candidates: [".u-scrollButtons", ".u-navButtons"] },

  /* --- blocks --- */
  { id: "block", candidates: [".block-container", ".block"] },
  { id: "blockHeader", candidates: [".block-header", ".block-tabHeader"] },
  { id: "blockBody", candidates: [".block-body"] },
  { id: "blockFooter", candidates: [".block-footer"] },
  { id: "blockMessage", candidates: [".blockMessage"] },

  /* --- forum list (forum_list) --- */
  { id: "node", candidates: [".node-list .node", ".node"] },
  { id: "nodeIcon", candidates: [".node-icon"] },
  { id: "nodeTitle", candidates: [".node-title"] },
  { id: "nodeDescription", candidates: [".node-description"] },
  { id: "nodeStats", candidates: [".node-stats"] },
  { id: "nodeExtra", candidates: [".node-extra"] },
  { id: "nodeSubForum", candidates: [".node-subNodeMenu", ".node-subNodeList", ".node-extra-row"] },

  /* --- thread list (forum_view) --- */
  { id: "threadItem", candidates: [".structItem--thread", ".structItem"] },
  { id: "threadTitle", candidates: [".structItem-title"] },
  { id: "threadIcon", candidates: [".structItem-iconContainer"] },
  { id: "threadMeta", candidates: [".structItem-cell--meta"] },
  { id: "prefix", candidates: [".labelLink", ".structItem-prefix", ".label"] },
  { id: "filterBar", candidates: [".filterBar", ".block-filterBar"] },

  /* --- thread view (thread_view) --- */
  { id: "post", candidates: [".message--post", ".message"] },
  { id: "postInner", candidates: [".message-inner"] },
  { id: "postUser", candidates: [".message-user"] },
  { id: "postAvatar", candidates: [".message-avatar"] },
  { id: "postContent", candidates: [".message-content", ".bbWrapper"] },
  { id: "postBody", candidates: [".message-body"] },
  { id: "postFooter", candidates: [".message-footer"] },
  { id: "actionBar", candidates: [".message-actionBar", ".actionBar"] },
  { id: "reactions", candidates: [".js-reactionsList", ".reaction"] },
  { id: "userBanner", candidates: [".userBanner"] },
  { id: "editor", candidates: [".fr-box", ".message-editorWrapper"] },
  { id: "editorToolbar", candidates: [".fr-toolbar"] },
  { id: "quickReply", candidates: [".js-quickReply", ".message-editorWrapper"] },

  /* --- members (member_view) --- */
  { id: "memberHeader", candidates: [".memberHeader"] },
  { id: "profileTabs", candidates: [".block-tabHeader--memberTabs", ".tabs"] },

  /* --- shared components --- */
  { id: "avatar", candidates: [".avatar"] },
  { id: "button", candidates: [".button", "button.button", "input[type='submit'].button"] },
  { id: "input", candidates: [".input", "input.input", "textarea.input", "select.input"] },
  { id: "formButtonGroup", candidates: [".formButtonGroup"] },
  { id: "menu", candidates: [".menu--structural", ".menu"] },
  { id: "pagination", candidates: [".pageNav", ".pageNavWrapper", ".pageNavSimple"] },
  { id: "notices", candidates: [".notices", ".notice"] },
  { id: "pairs", candidates: [".pairs--justified", ".pairs"] },
  { id: "username", candidates: [".username", ".userLink"] },
  { id: "bannedUsername", candidates: [".username--banned"] },
  { id: "quoteTooltip", candidates: [".tooltip--selectToQuote", ".tooltip[data-content='selectToQuote']"] },
  { id: "badge", candidates: [".badgeContainer", ".badge"] },
  { id: "tabsScroller", candidates: [".hScroller", ".tabs"] },
  { id: "inlineMod", candidates: [".js-inlineModContainer"] },
];

const REGISTRY_BY_ID = new Map(SELECTOR_REGISTRY.map((spec) => [spec.id, spec]));

/** All component ids (for health audits). */
export function selectorIds(): string[] {
  return SELECTOR_REGISTRY.map((spec) => spec.id);
}

/**
 * Resolve a component id to an element.
 * Returns null when no candidate matches — callers must handle that
 * gracefully (features degrade, nothing breaks).
 */
export function resolveSelector(id: string, root: ParentNode = document): Element | null {
  const spec = REGISTRY_BY_ID.get(id);
  if (!spec) return null;
  for (const candidate of spec.candidates) {
    let matches: NodeListOf<Element>;
    try {
      matches = root.querySelectorAll(candidate);
    } catch {
      continue; // defensive: never let a bad selector break the page
    }
    if (matches.length === 0) continue;
    if (!spec.semantic) return matches[0] ?? null;
    for (const el of matches) {
      if (spec.semantic(el)) return el;
    }
  }
  return null;
}

export interface SelectorHealth {
  id: string;
  found: boolean;
  /** Which candidate ultimately matched (for the debug report). */
  matched: string | null;
  candidateCount: number;
}

/** Audit every registered selector — powers the debug panel's health table. */
export function auditSelectorHealth(root: ParentNode = document): SelectorHealth[] {
  return SELECTOR_REGISTRY.map((spec) => {
    let matched: string | null = null;
    for (const candidate of spec.candidates) {
      try {
        const matches = root.querySelectorAll(candidate);
        if (matches.length === 0) continue;
        const ok = spec.semantic ? [...matches].some((el) => spec.semantic?.(el)) : true;
        if (ok) {
          matched = candidate;
          break;
        }
      } catch {
        /* invalid selector for this environment — skip */
      }
    }
    return {
      id: spec.id,
      found: matched !== null,
      matched,
      candidateCount: spec.candidates.length,
    };
  });
}

/**
 * Union of all candidates for a set of ids — used by generated CSS and by
 * the cascade transition query so styling never depends on a single class.
 */
export function selectorUnion(ids: string[]): string {
  const parts: string[] = [];
  for (const id of ids) {
    const spec = REGISTRY_BY_ID.get(id);
    if (spec) parts.push(...spec.candidates);
  }
  return [...new Set(parts)].join(", ");
}
