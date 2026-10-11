/**
 * Forum adapter — the only place that touches the forum DOM structure.
 *
 * Business logic (theme engine, modules) talks to this adapter instead of
 * querying CSS classes directly, so a XenForo redesign is fixed in one file
 * (src/forum/selectors.ts) rather than across the codebase.
 */
import {
  resolveSelector,
  auditSelectorHealth,
  selectorIds,
  SELECTOR_REGISTRY,
  type SelectorHealth,
} from "./selectors";

/** Known XenForo public templates (html[data-template]). */
export type ForumTemplate =
  | "forum_list"
  | "forum_view"
  | "thread_view"
  | "member_view"
  | "members_list"
  | "search"
  | "account"
  | "page"
  | "unknown";

const TEMPLATE_MAP: Record<string, ForumTemplate> = {
  forum_list: "forum_list",
  forum_view: "forum_view",
  thread_view: "thread_view",
  member_view: "member_view",
  members_list: "members_list",
  search: "search",
  account: "account",
  page: "page",
};

export interface ForumInfo {
  /** XF template name currently rendered. */
  template: ForumTemplate;
  /** XenForo version from html[data-xf] ("2.3"). */
  xenforoVersion: string | null;
  loggedIn: boolean;
  /** Current content key, changes on navigation ("thread-1052871"). */
  contentKey: string | null;
  url: string;
}

export class ForumAdapter {
  private root: HTMLElement | null = null;

  /** The element that owns forum content (#top.p-pageWrapper). */
  wrapper(): HTMLElement | null {
    if (this.root && this.root.isConnected) return this.root;
    const resolved = resolveSelector("pageWrapper") as HTMLElement | null;
    this.root = resolved;
    return resolved;
  }

  /** True when we are looking at a rendered forum page (not the anti-DDoS challenge). */
  isForumPage(): boolean {
    return document.getElementById("XF") !== null && this.wrapper() !== null;
  }

  query(id: string): Element | null {
    return resolveSelector(id);
  }

  /** All instances of a component (first candidate that matches wins). */
  queryAll(id: string): Element[] {
    const spec = SELECTOR_REGISTRY.find((s) => s.id === id);
    if (!spec) return [];
    for (const candidate of spec.candidates) {
      let matches: NodeListOf<Element>;
      try {
        matches = document.querySelectorAll(candidate);
      } catch {
        continue;
      }
      if (matches.length === 0) continue;
      if (!spec.semantic) return [...matches];
      const semantic = [...matches].filter((el) => spec.semantic?.(el));
      if (semantic.length > 0) return semantic;
    }
    return [];
  }

  info(): ForumInfo {
    const html = document.documentElement;
    const rawTemplate = html.getAttribute("data-template") ?? "unknown";
    return {
      template: TEMPLATE_MAP[rawTemplate] ?? "unknown",
      xenforoVersion: html.getAttribute("data-xf"),
      loggedIn: html.getAttribute("data-logged-in") === "true",
      contentKey: html.getAttribute("data-content-key"),
      url: location.href,
    };
  }

  /** Health of every registered selector (debug report). */
  health(): SelectorHealth[] {
    return auditSelectorHealth();
  }

  knownIds(): string[] {
    return selectorIds();
  }

  reset(): void {
    this.root = null;
  }
}

export const adapter = new ForumAdapter();
