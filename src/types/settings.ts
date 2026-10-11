/**
 * Complete settings model.
 *
 * Every knob of the extension lives here. The settings schema (src/settings/schema.ts)
 * drives the UI, validation and per-setting reset; DEFAULT_SETTINGS (src/settings/defaults.ts)
 * defines the initial values. A unit test keeps all three in sync.
 */

export interface Settings {
  /** Global on/off — toggles style injection as a whole. */
  master: {
    enabled: boolean;
  };

  /** Visual language of the forum (independent of the selected theme). */
  appearance: {
    /** Theme for the extension's own UI (popup/dashboard). */
    shellTheme: "dark" | "light" | "auto";
    radiusMode: "theme" | "custom";
    /** px, applied to cards/inputs/menus when radiusMode === "custom". */
    radius: number;
    buttonShape: "theme" | "pill" | "rounded" | "square";
    buttonStyle: "theme" | "solid" | "soft" | "outline";
    avatarShape: "theme" | "circle" | "rounded" | "square";
    /** Percent of natural avatar size (80–140). */
    avatarScale: number;
    postStyle: "theme" | "flat" | "card" | "bordered";
    threadDensity: "theme" | "compact";
    /** Restyle of the forum logo in the header (port of Arizona Forum Styler). */
    logoStyle: "default" | "accent-static" | "accent-animated" | "custom";
    /** http(s) URL of a custom logo image (used when logoStyle === "custom"). */
    logoUrl: string;
    /** Avatar border/glow style; "paint-*" variants follow the username color. */
    avatarStyle: "default" | "accent" | "glow" | "paint-accent" | "paint-glow";
    /** Keep XenForo's light/dark style variation in step with the active theme. */
    syncForumMode: boolean;
  };

  /** Theme selection state. */
  theme: {
    activeId: string;
    favorites: string[];
    /** Most-recently-applied theme ids, newest first. */
    recent: string[];
  };

  /** Page background layer (behind all forum content). */
  background: {
    mode: "none" | "color" | "gradient" | "image" | "template" | "video";
    /** Direct https URL for image/gif/video modes. */
    url: string;
    /** Built-in scene id for mode === "template" (whitelist in backgroundLayer). */
    template: string;
    color: string;
    /** Custom gradient (validated) — used when gradientPreset === "custom". */
    gradient: string;
    gradientPreset: string;
    /** Color of the readability overlay above the background. */
    overlayColor: string;
    /** Overlay strength 0–90 (%). */
    dim: number;
    /** Background layer opacity 10–100 (%). */
    opacity: number;
    /** Blur applied to the background layer (px, 0–20). */
    blur: number;
    size: "auto" | "cover" | "contain" | "30%" | "50%";
    position: "center" | "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
    repeat: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
    attachment: "fixed" | "scroll";
    videoAutoplay: boolean;
    videoLoop: boolean;
    pauseWhenHidden: boolean;
  };

  /** Selective glassmorphism. */
  glass: {
    enabled: boolean;
    /** Backdrop blur px (0–30). */
    blur: number;
    /** Surface opacity % (5–95) — lower is more transparent. */
    opacity: number;
    /** Border opacity % (0–100). */
    borderOpacity: number;
    /** Shadow strength % (0–100). */
    shadow: number;
    onBlocks: boolean;
    onPosts: boolean;
    onNav: boolean;
    onMenus: boolean;
  };

  /** Typography. */
  font: {
    /** Font stack id from the curated list, or "custom". */
    family: string;
    /** User font family name (used when family === "custom"). */
    customFamily: string;
    /** https URL to a .woff2/.woff/.ttf file (used when family === "custom"). */
    customSource: string;
    weight: number;
    /** Base font size, percent of forum default (80–130). */
    size: number;
    lineHeight: number;
    /** px (-0.5 … 2). */
    letterSpacing: number;
    /** Where the font applies. */
    scope: "off" | "ui" | "all" | "allExceptPosts";
  };

  /** Custom cursors. */
  cursor: {
    enabled: boolean;
    preset: "crosshair" | "ring" | "dot" | "chevron" | "custom";
    /** "theme" — auto color from the active theme accent; "custom" — own color. */
    colorMode: "theme" | "custom";
    color: string;
    /** Rendered cursor size, px (16–64). */
    size: number;
    /** Stroke width for vector presets, px (1–6). */
    thickness: number;
    /** https URL to a custom cursor image (png/gif) when preset === "custom". */
    customUrl: string;
  };

  /** Ambient background effects. */
  effects: {
    snow: boolean;
    particles: boolean;
    fog: boolean;
    /** Soft glow around links and primary buttons. */
    glow: boolean;
    /** Slowly animated gradient on the page background. */
    animatedGradient: boolean;
    /** Lift cards on hover. */
    hoverLift: boolean;
    /** Particle count hint (20–200). */
    count: number;
    /** Animation speed multiplier (0.2–3). */
    speed: number;
    /** Effect opacity % (10–100). */
    opacity: number;
    pauseWhenHidden: boolean;
  };

  /** Page enter transitions. */
  transition: {
    style:
      | "none"
      | "fade"
      | "slideUp"
      | "fadeDown"
      | "slideLeft"
      | "slideRight"
      | "scale"
      | "zoomOut"
      | "rotateIn"
      | "flipX"
      | "flipY"
      | "bounceUp"
      | "blur"
      | "cascade";
    duration: number;
    /** Stagger step for the cascade style, ms (0–150). */
    stagger: number;
  };

  /** Hide/show tweaks for individual forum elements. */
  tweaks: {
    hideFooter: boolean;
    hideSidebar: boolean;
    hideAvatars: boolean;
    hideNodeIcons: boolean;
    hideHeaderAlerts: boolean;
    hideSubForums: boolean;
    hidePrefixes: boolean;
    hideUnreadIndicators: boolean;
    headerSticky: boolean;
    /** Job banners under usernames. */
    hideUserBanners: boolean;
    /** The native light/dark variation toggle in the header. */
    hideStyleVariation: boolean;
    /** Strip user-painted nick colors (inherit theme colors instead). */
    removeUserPaints: boolean;
    /** Visual marking of banned users. */
    bannedStyle: "default" | "red-paint" | "icon";
    /** Load original animated GIF avatars instead of static previews. */
    animatedAvatars: boolean;
    /** "Ссылка" button in the select-to-quote tooltip. */
    copySelectedLink: boolean;
    /** Navbar button ids hidden by the user (parsed by the navbar module). */
    hiddenNavIds: string[];
    /** User-defined links appended to the navbar. */
    customNavItems: CustomNavItem[];
    /* --- second wave of Arizona tweaks (v1.2) --- */
    hideSignatures: boolean;
    hideBreadcrumbs: boolean;
    hideSectionLinks: boolean;
    hideUserExtras: boolean;
    /** "Your threads" marker in thread lists. */
    hideYourPosts: boolean;
    /** Lightbox containers lose their background/border. */
    hidePostBg: boolean;
    hideConversations: boolean;
    /** Search entry in the header nav. */
    navSearch: "default" | "hide" | "icon-only";
    /** Forum node icons: mute the ones for read forums. */
    nodeIconStatus: "default" | "mute-read";
    /* --- accent styling (Arizona defaults, opt-in here) --- */
    accentButtons: boolean;
    accentThreadList: boolean;
    accentThreadsMeta: boolean;
    accentPostAttribution: boolean;
    accentNewBadge: boolean;
  };

  /** Performance guards. */
  performance: {
    /** auto: sensible caps; quality: no caps; battery: strict caps. */
    mode: "auto" | "quality" | "battery";
    /** rAF cap for canvas effects (0 = unlimited). */
    fpsCap: number;
    /** Degrade canvas effects while a video background is playing. */
    degradeWithVideo: boolean;
  };

  /** Accessibility. */
  accessibility: {
    /** auto: honor prefers-reduced-motion; force: always disable motion. */
    reducedMotion: "auto" | "force";
    /** Disable page enter transitions and hover animations. */
    reduceTransitions: boolean;
    /** Strong focus outline for keyboard navigation on the forum. */
    focusRing: boolean;
    /** Boost text/border contrast when a theme is too dim. */
    contrastBoost: boolean;
  };

  /** Developer/debug. */
  advanced: {
    debugMode: boolean;
  };

  /** AI assistant (non-secret configuration; the key lives in a separate store). */
  ai: {
    enabled: boolean;
    provider: "local" | "openai";
    /** OpenAI-compatible API base URL. */
    endpoint: string;
    model: string;
    /** Explicit opt-in before any palette data leaves the browser. */
    allowRemote: boolean;
  };

  /** Features that may change or be removed between versions. */
  experimental: {
    enabled: boolean;
    /** Smooth crossfade when switching themes. */
    themeCrossfade: boolean;
    /** Automatically dim image/video backgrounds until text contrast passes. */
    autoDim: boolean;
    /** Floating "pause styling" button on the forum page. */
    pauseButton: boolean;
  };
}

/** A user-defined navbar link (rendered by the navbar module). */
export interface CustomNavItem {
  /** Stable local id (slug, generated by the dashboard panel). */
  id: string;
  /** Visible label (sanitized, single line). */
  name: string;
  /** http(s) URL — validated by sanitizeUrl before it reaches storage. */
  url: string;
  /** Open in a new tab (with rel="noopener"). */
  newTab: boolean;
}
