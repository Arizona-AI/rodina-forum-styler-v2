# Rodina Forum Styler — Internal Contracts

> Working document for contributors. It freezes the interfaces between the
> content runtime, stylesheets, dashboard panels and modules. Final
> documentation lives in `docs/`; this file is the source of truth while the
> implementation passes run in parallel.

## 1. Build & conventions

- TypeScript strict, esbuild (`npm run build` → `dist/`), no runtime deps, no framework.
- Entry points: `src/content/main.ts`, `src/background/service-worker.ts`,
  `src/options/options.ts` (the popup embeds `options.html?popup=1` in an
  iframe — `popup.html`/`popup.css` are static, no popup bundle).
- CSS files under `src/content/styles/` are imported as text and concatenated.
- All user-facing UI text is Russian (`src/i18n/ru.ts` + schema labels).
- No `TODO`, no dead code, no placeholder behavior unless explicitly marked.
- Validate every value that reaches the DOM (`src/shared/validators.ts`).

## 2. Storage keys (`chrome.storage.local`)

| Key | Content |
| --- | --- |
| `rfs.settings` | `Settings` object (validated by `src/settings/store.ts`) |
| `rfs.meta` | `{ schemaVersion, onboardingDone, installedAt, lastLaunchedAt }` |
| `rfs.customThemes` | `CustomTheme[]` (max 100) |
| `rfs.editorDraft` | `{ tokens, baseThemeId, updatedAt, previewOnly? }` |
| `rfs.aiSecrets` | `{ apiKey }` — never exported, never logged |

## 3. Theme pipeline

```
settings.theme.activeId ─► resolveActiveTokens() ─► ThemeTokens
EditorDraft(previewOnly) ─┘        │
                                   ▼
                    compileThemeVariables(tokens)  →  <style id="rfs-vars">
```

### 3.1 Theme variables (`--rfs-*`, emitted by `src/theme/compile.ts`)

Colors: `page-bg`, `page-bg-2`, `page-gradient`, `surface`, `surface-alt`,
`surface-hover`, `text`, `text-muted`, `text-faint`, `border`, `border-strong`,
`primary`, `primary-hover`, `primary-fg`, `secondary`, `accent`, `success`,
`warning`, `danger`, `info`, `btn-bg`, `btn-fg`, `btn-border`, `shadow-color`,
`header-bg`, `sidebar-bg`, `footer-bg`, `font-family`.

Derived: `primary-soft` (14% rgba), `primary-softer` (7%), `secondary-soft`,
`link`, `link-hover`, `shadow-1/2/3`, `focus-ring`, `selection-bg`,
`danger-soft`, `success-soft`, `hover-overlay`.

Channel triplets (for `rgb(var(--rfs-surface-rgb) / alpha)` syntax — do NOT
use `color-mix()`): `surface-rgb`, `surface-alt-rgb`, `header-rgb`,
`border-rgb`, `primary-rgb`, `text-rgb`.

Contrast-corrected (used by `data-rfs-contrast-boost`): `text-muted-strong`,
`text-faint-strong`, `border-strong-visible`.

### 3.2 Inline variables set on `<html>` (by `src/content/flags.ts`)

| Var | Source |
| --- | --- |
| `--rfs-ui-radius` | appearance.radius (custom mode) |
| `--rfs-avatar-scale` | appearance.avatarScale (≠100) |
| `--rfs-font-scale` | font.size / 100 (unitless) |
| `--rfs-font-weight`, `--rfs-font-line`, `--rfs-font-track` | font settings |
| `--rfs-cursor-size` | cursor.size |
| `--rfs-fx-opacity` | effects.opacity (when a canvas effect is on) |
| `--rfs-tr-duration`, `--rfs-tr-stagger` | transition settings |
| `--rfs-glass-blur`, `--rfs-glass-alpha`, `--rfs-glass-border-alpha`, `--rfs-glass-shadow-alpha` | glass settings |

Set by the **font module**: `--rfs-font-stack` (selected font stack),
`--rfs-base-size` (measured body font-size in px, e.g. `15px`).
Set by the **background module**: none (uses its own DOM layer).
Set by the **cursor module**: none (writes a dynamic `<style>` block).

## 4. `<html>` attribute flags (presence = on unless noted)

```
data-rfs-on=1                     master switch (style elements exist only when on)
data-rfs-glass=1  + glass-blocks | glass-posts | glass-nav | glass-menus
data-rfs-hide-footer | hide-sidebar | hide-avatars | hide-node-icons
data-rfs-hide-header-alerts | hide-subforums | hide-prefixes | hide-unread
data-rfs-sticky-header
data-rfs-radius="<px>"            value string; pair with var --rfs-ui-radius
data-rfs-btn-shape=pill|rounded|square
data-rfs-btn-style=solid|soft|outline
data-rfs-avatar-shape=circle|rounded|square
data-rfs-avatar-scale="<percent>" pair with var --rfs-avatar-scale
data-rfs-post-style=flat|card|bordered
data-rfs-density=compact
data-rfs-font-scope=ui|all|allExceptPosts
data-rfs-cursor=<preset>          crosshair|ring|dot|chevron|custom
data-rfs-fx-snow | fx-particles | fx-fog | fx-glow | fx-gradient | fx-lift
data-rfs-transition=fade|slideUp|fadeDown|slideLeft|slideRight|scale|
                    zoomOut|rotateIn|flipX|flipY|bounceUp|blur|cascade
data-rfs-reduced-motion=1         effective reduced motion (force OR system)
data-rfs-focus-ring=1
data-rfs-contrast-boost=1
data-rfs-reduce-transitions=1
data-rfs-crossfade=1              experimental theme crossfade
data-rfs-pause-btn=1              floating pause button visibility
data-rfs-hide-user-banners=1      job banners under usernames (v1.1)
data-rfs-hide-style-variation=1   native light/dark toggle (v1.1)
data-rfs-remove-paints=1          strip user-painted nick colors (v1.1)
data-rfs-banned-style=red-paint|icon   banned-user marking (v1.1)
data-rfs-avatar-style=accent|glow|paint-accent|paint-glow  (v1.1)
data-rfs-logo-style=accent-static|accent-animated|custom    (v1.1)
data-rfs-hide-signatures=1        message signatures (v1.2)
data-rfs-hide-breadcrumbs=1       breadcrumb trail (v1.2)
data-rfs-hide-section-links=1     quick links row of a section (v1.2)
data-rfs-hide-user-extras=1       extra fields in the user side block (v1.2)
data-rfs-hide-your-posts=1        "your threads" marker in lists (v1.2)
data-rfs-hide-post-bg=1           lightbox containers w/o backdrop (v1.2)
data-rfs-hide-conversations=1     conversations nav button (v1.2)
data-rfs-nav-search=hide|icon-only    header search entry (v1.2)
data-rfs-node-icon-status=mute-read   mute read forum icons (v1.2)
data-rfs-accent-buttons=1         plain buttons in accent color (v1.2)
data-rfs-accent-thread-list=1     thread titles in accent color (v1.2)
data-rfs-accent-threads-meta=1    list meta links in accent color (v1.2)
data-rfs-accent-post-attribution=1    attribution links in accent (v1.2)
data-rfs-accent-new-badge=1       glowing unread "new" badge (v1.2)
```

Module-gated tweaks (no attribute — the module checks settings itself):
`animatedAvatars`, `copySelectedLink`.

## 5. Injected DOM (content script)

| Node | Created by | Notes |
| --- | --- | --- |
| `<style id="rfs-base">` | StyleHost | concatenated static CSS |
| `<style id="rfs-vars">` | StyleHost | compiled theme vars |
| `<style id="rfs-dyn-*">` | modules | cursor / @font-face / generated rules |
| `<link id="rfs-font">` | font module | Google Fonts |
| `#rfs-bg-layer` | background module | `position:fixed; z-index:-2` media layer, `aria-hidden` |
| `#rfs-bg-overlay` | background module | `z-index:-1` readability dimmer |
| `#rfs-fx-canvas` | effects module | `position:fixed; z-index:-1; pointer-events:none` |
| `#rfs-pause` | pause module | floating toggle, `pointer-events:auto` |

`<body>` must stay transparent (base.css) so `z-index:-2/-1` layers show
through. Layers are re-created by the observer if the forum removes them.

## 6. Content module contract

`src/content/modules/types.ts`:

```ts
interface ContentModule {
  id: string;
  init(ctx: ModuleContext): void;      // one-time (idempotent)
  apply(ctx: ModuleContext): void;     // settings -> page (idempotent!)
  onNavigate?(ctx: ModuleContext): void;
  destroy?(ctx: ModuleContext): void;
}
```

`ModuleContext = { settings, host: StyleHost, adapter, tokens }`.
Modules are registered in `src/content/main.ts` (that file is owned by the
core pass — do not edit it without coordinating).

Key module exports: `backgroundModule`, `effectsCanvasModule`, `fontModule`,
`cursorModule`, `transitionsModule`, `userChromeModule` (animated avatars,
banned icons, avatar paint), `navbarModule` (per-button hiding + custom
links), `selectionLinkModule` (copy link to selection), `logoModule`
(generated mask/content rules under `rfs-dyn-logo`), `variationSyncModule`
(XF light/dark sync, opt-in), `pauseButtonModule`.

v1.1 additions: `userChrome`, `navbar`, `selectionLink`, `logo` and
`variationSync` observe the DOM with MutationObserver + rAF coalescing and
disconnect in `destroy()` — observers must only run while their feature is on.
The parsed navbar list is published under `rfs.navButtons`
(`src/shared/navButtons.ts`), read by the dashboard's navbar panel.

## 7. Page transitions

- flags set `data-rfs-transition` + duration vars.
- transitions module adds `rfs-tr-enter` (and `rfs-tr-cascade`) to
  `#top.p-pageWrapper` on load and after `xf:page-load-complete`/`xf:reinit`.
- cascade delays: module writes `animation-delay` inline on up to 12 direct
  children using `--rfs-tr-stagger` (CSS cannot index children dynamically).
- keyframes live in `effects.css`; animation classes must be removed when the
  feature is off (module applies/removes them — rules stay static).

## 8. Dashboard (`src/options`)

- `sections.ts` — sidebar sections (settings sections render schema groups;
  custom sections render panels).
- `panelContext.ts` — services every panel receives.
- Panel signature: `(root: HTMLElement, ctx: PanelContext) => void | (() => void)`.
- Panels: `dashboard`, `themes`, `editor`, `io`, `advanced` (custom),
  `ai` (settings + `renderAiPanel`), `forumUi` (settings +
  `renderNavbarPanel` from `src/options/panels/navbarPanel.ts`).
- Hash routing: `options.html#<section-id>` opens that section.
- Schema-driven settings render from `src/settings/schema.ts` — never
  hand-build controls for schema settings.

## 9. AI (`src/ai`)

- `AIProvider` interface: `generateTheme`, `colorAssistant`, `a11yCheck`,
  `improveTheme` — all async, all returning plain data (never HTML).
- Providers: `localHeuristic` (offline color math, clearly labeled
  «локальная эвристика»), `openaiCompatible` (user-supplied endpoint + key,
  key stored in `rfs.aiSecrets`, only sent to the configured endpoint).
- Remote calls require `ai.enabled && ai.provider === 'openai' &&
  ai.allowRemote`. Never send anything except the palette/prompt payload.
- `src/ai/panel.ts` exports `renderAiPanel(root, ctx)`.

## 10. Message protocol

`src/shared/messages.ts` — content script answers `status`,
`debug-report`, `apply-now` via `chrome.runtime.onMessage`.
The dashboard uses `chrome.tabs.sendMessage` to the active forum tab.

## 11. Performance rules

- No `setInterval` anywhere in the content script.
- Canvas effects: rAF loop with optional FPS cap (`performance.fpsCap`),
  auto-pause on `document.hidden` (when `effects.pauseWhenHidden`), skipped
  entirely under reduced motion.
- Settings pipeline: single debounced apply (90 ms).
- Observers: attribute filter only + targeted removal detection (no full
  subtree rescans).
