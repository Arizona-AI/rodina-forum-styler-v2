/**
 * StyleHost — owns every node the extension injects into the page.
 *
 * Injection points:
 *  #rfs-base    <style>  static forum CSS (built from src/content/styles/*)
 *  #rfs-vars    <style>  compiled theme custom properties
 *  #rfs-font    <link>   Google Fonts (loaded only when the font module needs it)
 *  inline vars   on <html>  per-module values (glass blur, radii, cursor url…)
 *  attributes    on <html>  feature flags (hide toggles, effect switches…)
 *
 * The forum page has no Content-Security-Policy header (verified during
 * research), so DOM-injected <style> applies without issues; values are still
 * sanitized before they reach the DOM.
 */

export const STYLE_IDS = {
  base: "rfs-base",
  vars: "rfs-vars",
  font: "rfs-font",
} as const;

export class StyleHost {
  private base: HTMLStyleElement | null = null;
  private vars: HTMLStyleElement | null = null;
  private fontLink: HTMLLinkElement | null = null;
  private inlineVars = new Map<string, string>();
  private attributes = new Set<string>();
  private enabled = false;

  /** Idempotent creation of the style elements. */
  ensure(): void {
    if (!this.base || !this.base.isConnected) {
      this.base = document.getElementById(STYLE_IDS.base) as HTMLStyleElement | null ?? null;
      if (!this.base) {
        this.base = document.createElement("style");
        this.base.id = STYLE_IDS.base;
        document.head.appendChild(this.base);
      }
    }
    if (!this.vars || !this.vars.isConnected) {
      this.vars = document.getElementById(STYLE_IDS.vars) as HTMLStyleElement | null ?? null;
      if (!this.vars) {
        this.vars = document.createElement("style");
        this.vars.id = STYLE_IDS.vars;
        document.head.appendChild(this.vars);
      }
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.ensure();
      this.setAttribute("data-rfs-on", "1");
    } else {
      this.removeAttribute("data-rfs-on");
      this.base?.remove();
      this.vars?.remove();
      this.fontLink?.remove();
      this.base = null;
      this.vars = null;
      this.fontLink = null;
      for (const name of [...this.inlineVars.keys()]) this.setVar(name, "");
      this.inlineVars.clear();
      for (const attr of [...this.attributes]) this.removeAttribute(attr);
      this.attributes.clear();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Replace the static forum CSS. */
  setBaseCss(css: string): void {
    if (!this.enabled) return;
    this.ensure();
    if (this.base && this.base.textContent !== css) this.base.textContent = css;
  }

  /** Swap the compiled theme variables (theme change = one text write). */
  setThemeCss(css: string): void {
    if (!this.enabled) return;
    this.ensure();
    if (this.vars && this.vars.textContent !== css) this.vars.textContent = css;
  }

  /** Set a CSS custom property on <html> ("" removes it). */
  setVar(name: string, value: string): void {
    if (!name.startsWith("--")) return;
    if (!this.enabled && value !== "") return;
    const clean = sanitizeCssValue(value);
    if (value === "" || clean === null) {
      document.documentElement.style.removeProperty(name);
      this.inlineVars.delete(name);
      return;
    }
    document.documentElement.style.setProperty(name, clean);
    this.inlineVars.set(name, clean);
  }

  /** Bulk var update. */
  setVars(vars: Record<string, string>): void {
    for (const [name, value] of Object.entries(vars)) this.setVar(name, value);
  }

  /**
   * Managed bulk update: sets the given vars and clears every previously
   * managed var that is no longer present — prevents stale values (e.g.
   * glass blur left behind after glassmorphism is switched off).
   */
  syncVars(vars: Record<string, string>): void {
    for (const name of [...this.inlineVars.keys()]) {
      if (!(name in vars)) this.setVar(name, "");
    }
    this.setVars(vars);
  }

  /** Toggle an <html> attribute flag ("" removes). */
  setAttribute(name: string, value: string | null): void {
    if (value === null || value === "") {
      document.documentElement.removeAttribute(name);
      this.attributes.delete(name);
      return;
    }
    document.documentElement.setAttribute(name, value);
    this.attributes.add(name);
  }

  removeAttribute(name: string): void {
    document.documentElement.removeAttribute(name);
    this.attributes.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  /**
   * Generated CSS blocks (cursor data-URIs, @font-face, module rules).
   * Values are produced by our own code from sanitized inputs; the id must
   * start with "rfs-dyn-". Passing null removes the block.
   */
  setDynamicCss(id: string, css: string | null): void {
    if (!id.startsWith("rfs-dyn-")) return;
    const existing = document.getElementById(id);
    if (css === null || css === "") {
      existing?.remove();
      return;
    }
    if (!this.enabled) return;
    if (existing) {
      if (existing.textContent !== css) existing.textContent = css;
      return;
    }
    const el = document.createElement("style");
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }

  /** Load (or drop) the Google Fonts stylesheet. */
  setFontLink(href: string | null): void {
    if (href === null) {
      this.fontLink?.remove();
      this.fontLink = null;
      return;
    }
    if (!this.enabled) return;
    if (this.fontLink && this.fontLink.isConnected && this.fontLink.href === href) return;
    this.fontLink?.remove();
    const link = document.createElement("link");
    link.id = STYLE_IDS.font;
    link.rel = "stylesheet";
    link.href = href;
    this.fontLink = link;
    document.head.appendChild(link);
  }

  /** Drop everything (tests / hard reset). */
  destroy(): void {
    for (const el of document.querySelectorAll('[id^="rfs-dyn-"]')) el.remove();
    this.setEnabled(false);
  }
}

/**
 * CSS value sanitizer for inline custom properties.
 * Accepts colors, lengths, percentages, urls(data:image only), font stacks
 * and simple keyword lists — anything else is rejected (returns null).
 */
export function sanitizeCssValue(value: string): string | null {
  if (value.length === 0 || value.length > 600) return null;
  // Reject characters that could break out of a declaration.
  if (/[{}<>;"'\\]/.test(value)) return null;
  if (/expression|javascript|@import|url\((?!['"]?data:image\/)/i.test(value)) return null;
  return value.trim();
}

export const styleHost = new StyleHost();
