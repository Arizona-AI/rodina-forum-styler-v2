/**
 * Minimal DOM helpers for the dashboard.
 *
 * Deliberately framework-free: elements are created through `h()` with
 * textContent-only text binding, so imported theme names or AI output can
 * never inject markup (XSS by construction).
 */

type Child = Node | string | number | null | undefined | false;

export interface HProps {
  class?: string;
  id?: string;
  text?: string;
  title?: string;
  type?: "button" | "submit" | "text" | "password" | "search";
  href?: string;
  role?: string;
  tabIndex?: number;
  disabled?: boolean;
  value?: string;
  placeholder?: string;
  ariaLabel?: string;
  ariaChecked?: string;
  ariaHidden?: boolean;
  dataset?: Record<string, string>;
  attrs?: Record<string, string | number | boolean | null>;
  on?: Partial<{
    [K in keyof HTMLElementEventMap]: (event: HTMLElementEventMap[K]) => void;
  }>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: HProps = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.id) el.id = props.id;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.title) el.title = props.title;
  if (props.type) el.setAttribute("type", props.type);
  if (props.href !== undefined) el.setAttribute("href", props.href);
  if (props.role) el.setAttribute("role", props.role);
  if (props.tabIndex !== undefined) el.tabIndex = props.tabIndex;
  if (props.disabled !== undefined) (el as HTMLInputElement).disabled = props.disabled;
  if (props.value !== undefined) (el as HTMLInputElement).value = props.value;
  if (props.placeholder !== undefined) (el as HTMLInputElement).placeholder = props.placeholder;
  if (props.ariaLabel) el.setAttribute("aria-label", props.ariaLabel);
  if (props.ariaChecked) el.setAttribute("aria-checked", props.ariaChecked);
  if (props.ariaHidden !== undefined) el.setAttribute("aria-hidden", String(props.ariaHidden));
  if (props.dataset) {
    for (const [key, value] of Object.entries(props.dataset)) el.dataset[key] = value;
  }
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value === null || value === false) continue;
      el.setAttribute(key, String(value));
    }
  }
  if (props.on) {
    for (const [name, handler] of Object.entries(props.on)) {
      el.addEventListener(name, handler as EventListener);
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === "string" || typeof child === "number") {
      parent.appendChild(document.createTextNode(String(child)));
    } else {
      parent.appendChild(child);
    }
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/* ------------------------------- icons ------------------------------- */

/** 24×24 stroke-style icon paths (lucide-like, hand-picked minimal set). */
const ICON_PATHS: Record<string, string> = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  themes: "M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1 0-4h4a5 5 0 0 0 0-10z M7.5 10.5h.01 M9.5 7h.01 M13.5 6.5h.01",
  editor: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0 M14 4v4M8 10v4M16 16v4",
  appearance: "M12 3l7 4v10l-7 4-7-4V7z M12 3v18 M5 7l7 4 7-4",
  background: "M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6 M8.5 9.5h.01",
  effects: "M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15l-1.8-4.2L5.5 9l4.7-1.3z M19 15l.9 2.3L22 18l-2.1.8L19 21l-.9-2.2L16 18l2.1-.7z",
  fonts: "M4 7V5h16v2 M12 5v14 M9 19h6",
  cursor: "M6 3l12 9-5 1 3 6-2.5 1-3-6-4.5 4z",
  glass: "M5 4h14l-1.5 7a5.5 5.5 0 0 1-11 0z M12 16v4 M8 20h8",
  forumUi: "M4 4h16v5H4zM4 12h9v8H4zM16 12h4v8h-4z",
  performance: "M12 21a9 9 0 1 1 9-9 M12 12l4-4 M12 21a9 9 0 0 0 9-9",
  accessibility: "M12 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z M5 9h14 M12 9v5l-3 6M12 14l3 6",
  ai: "M9 3h6v3h3v12h-3v3H9v-3H6V6h3z M9 11h.01M15 11h.01 M12 14v3",
  io: "M7 7h11l-3-3 M18 7l-3 3 M17 17H6l3 3M6 17l3-3",
  experimental: "M9 3h6 M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3 M7.5 15h9",
  advanced: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.5 2h-5L9 5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L5 10a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 3h5l.4-3a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4.2-4.2",
  heart: "M12 20s-7-4.4-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 15.6 12 20 12 20z",
  random: "M3 7h4l10 10h4M17 7h4M3 17h4l3-3 M17 17l4 0 M17 4l4 3-4 3 M17 14l4 3-4 3",
  download: "M12 3v12 M7 10l5 5 5-5 M4 20h16",
  upload: "M12 16V4 M7 9l5-5 5 5 M4 20h16",
  copy: "M9 9h11v11H9z M15 9V4H4v11h5",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6M14 11v6",
  check: "M4 13l5 5L20 6",
  close: "M6 6l12 12M18 6L6 18",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19",
  moon: "M20 14a8 8 0 1 1-10-10 7 7 0 0 0 10 10z",
  external: "M14 4h6v6 M20 4L10 14 M18 14v6H4V6h6",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v6 M12 7.5h.01",
  warning: "M12 3l10 18H2z M12 10v5 M12 18h.01",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7 M20 4v5h-5",
  plus: "M12 5v14M5 12h14",
  save: "M5 3h11l3 3v15H5z M8 3v6h8V3 M8 14h8v7H8z",
  play: "M7 4l13 8-13 8z",
  pause: "M8 4h3v16H8zM13 4h3v16h-3z",
  palette: "M12 3a9 9 0 1 0 0 18c1.7 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h1a5 5 0 0 0 5-5c0-4-4-7-9-7z M7.5 11h.01M9.5 7.5h.01M14.5 7h.01",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  key: "M14 4a6 6 0 1 0 4.9 9.5L21 16l-2 2-2-2-2 2-2-2 1.9-1.9A6 6 0 0 0 14 4z M8 10h.01",
  sparkles: "M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  burger: "M4 7h16M4 12h16M4 17h16",
  contrast: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 3v18",
  undo: "M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3",
};

export type IconName = keyof typeof ICON_PATHS;

export function icon(name: IconName, size = 18): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const paths = (ICON_PATHS[name] ?? ICON_PATHS.info!).split(" M").map((d, i) => (i === 0 ? d : `M${d}`));
  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}
