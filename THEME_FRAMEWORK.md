# Theme Framework Guide

This document is a complete reference for building new themes for the Inleo Skin Extension. Its purpose is to let a developer (or AI agent) take a theme design (HTML mockup, CSS, images) and produce a working theme CSS file with minimal debugging. Every hard-won lesson from the Cyberpunk V2 build is codified here.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File Structure & Naming](#2-file-structure--naming)
3. [How Theme CSS Is Loaded](#3-how-theme-css-is-loaded)
4. [CSS Variable Contract](#4-css-variable-contract)
5. [CSS Section Map (Required Sections)](#5-css-section-map-required-sections)
6. [Inleo DOM Reference](#6-inleo-dom-reference)
7. [Mandatory Rules (Non-Negotiable)](#7-mandatory-rules-non-negotiable)
8. [CSS Specificity Cheat Sheet](#8-css-specificity-cheat-sheet)
9. [Tailwind Override Patterns](#9-tailwind-override-patterns)
10. [JS-Injected DOM Elements](#10-js-injected-dom-elements)
11. [Theme Checklist](#11-theme-checklist)
12. [Providing a Theme Design to AI](#12-providing-a-theme-design-to-ai)

---

## 1. Architecture Overview

The extension is a Chrome Manifest V3 extension that operates exclusively on `https://inleo.io/*`.

```
User clicks popup → popup.js saves theme name to chrome.storage.sync
  → content.js reads storage → fetches themes/{name}.css
  → CSS loaded via document.adoptedStyleSheets (survives SPA navigation)
  → content.js also injects DOM elements (price ticker, mute buttons, settings link)
```

### Key Technical Facts

| Component | Detail |
|-----------|--------|
| **CSS Injection** | `document.adoptedStyleSheets` — NOT a `<link>` tag. CSS lives on the Document object, immune to SPA `<head>` wipes. |
| **Font Loading** | `@import url(...)` is stripped from the CSS text and injected as separate `<link>` tags (constructed stylesheets don't support `@import`). |
| **SPA Handling** | Inleo is a Next.js SPA. Client-side navigation reconstructs `<head>` and `<body>`. The CSS persists via `adoptedStyleSheets`. DOM-injected elements (ticker, mute buttons) are re-injected by a 3-second poller in `content.js`. |
| **Data Attribute** | `<html data-inleo-skin="theme-name">` is set when a theme is active. Use this as a root scope selector if needed. |
| **Storage** | Theme selection: `chrome.storage.sync` key `activeTheme`. Muted users: `chrome.storage.local` key `mutedUsers`. |

---

## 2. File Structure & Naming

```
inleo-skin/
├── manifest.json           # Extension manifest (bump version on major changes)
├── content.js              # Content script — theme loader + feature logic
├── background.js           # Service worker (minimal, sets defaults)
├── popup.html / popup.js / popup.css   # Theme selector UI
├── options.html / options.js           # Muted users management UI
├── themes/
│   └── {theme-name}.css    # Each theme is a single CSS file
└── img/
    └── {theme-specific images}
```

### Adding a New Theme

1. Create `themes/{theme-name}.css`
2. Add `<option value="{theme-name}">Display Name</option>` to `popup.html`
3. Declare images in `manifest.json` → `web_accessible_resources` → `resources` array if the theme uses custom images
4. The theme name in the `<option value="">` MUST match the CSS filename (without `.css`)

---

## 3. How Theme CSS Is Loaded

The `applyTheme()` function in `content.js` does the following:

1. Sets `<html data-inleo-skin="{themeName}">`
2. Fetches `themes/{themeName}.css` via `chrome.runtime.getURL()`
3. Extracts all `@import url(...)` rules via regex
4. Injects each imported URL as a separate `<link rel="stylesheet">` in `<head>` (fonts)
5. Strips `@import` lines from the CSS text
6. Creates a `CSSStyleSheet`, calls `sheet.replaceSync(strippedCss)`
7. Adds the sheet to `document.adoptedStyleSheets`

### Implications for Theme Authors

- **`@import` is supported** but only for font URLs. They get converted to `<link>` tags automatically.
- **`url()` references to local images** must use relative paths from the CSS file's perspective: `url('../img/my-bg.png')`. These resolve via `chrome.runtime.getURL()`.
- **No `@charset` declarations** — constructed stylesheets don't support them.
- **`replaceSync()` is used** — the entire CSS is loaded synchronously into the sheet. No race conditions.

---

## 4. CSS Variable Contract

Every theme MUST define these variables scoped to its data attribute:

```css
:root[data-inleo-skin="{theme-name}"] {
    --primary: #00f3ff;      /* Main accent color (links, active states, borders) */
    --secondary: #ff2a00;    /* Secondary accent (hover effects, corner brackets) */
    --accent: #9d00ff;       /* Tertiary accent (optional decorative use) */
    --bg-dark: #050508;      /* Deepest background (body) */
    --panel-bg: #0a0a12;     /* Panel/card background (nav, posts, sidebar) */
}
```

These variables are referenced throughout the CSS and by JS-injected elements. All five are required.

### Additional Optional Variables

Themes may define additional custom properties. These are NOT referenced by `content.js` but can be used internally in the CSS:

```css
:root[data-inleo-skin="{theme-name}"] {
    --text-primary: rgba(255, 255, 255, 0.9);
    --text-secondary: rgba(255, 255, 255, 0.4);
    --border-glow: rgba(0, 243, 255, 0.15);
    --font-heading: "Share Tech Mono", monospace;
    --font-body: "Rajdhani", sans-serif;
}
```

---

## 5. CSS Section Map (Required Sections)

Every theme CSS file should contain ALL of the following sections. Copy the section headers and structure from `cyberpunk-v2.css` as a starting template. Replace colors, fonts, and decorative styles — but keep the selectors and `!important` declarations.

| # | Section | Purpose | Can Skip? |
|---|---------|---------|-----------|
| 0 | Nuclear Reset | Global `border-radius: 0` (cyberpunk-specific). Other themes may want different values. | Optional |
| 1 | Body | `background-color`, `background-image`, `font-family`, `color`, `overflow-x: hidden`. **Use `background-attachment: scroll`**, never `fixed` (causes full repaint every scroll frame). | Required |
| 2 | Scanlines Overlay | `body::before` pseudo-element overlay. Theme-specific decoration. If `position: fixed`, MUST include `will-change: transform` and `transform: translateZ(0)` for GPU compositing. | Optional |
| 3 | Body::after Kill | `body::after { display: none }` — Removes Inleo's native 600x600 gray bg artifact | Required |
| 3b | Gray Background Kill | Override `bg-zinc`, `bg-gray`, `bg-neutral` classes to `--panel-bg` | Required |
| 4 | Layout Containers | Make outer wrappers (`body>div`, `main.relative`, `aside`) transparent | Required |
| 5 | Post Cards | Style `main#threads` post containers — background, borders, z-index. MUST exclude `.sticky` from global z-index rules. | Required |
| 5b | Right Sidebar Panels | Style `aside>div>div` panels | Required |
| 6 | Left Sidebar / Nav | Core nav panel styling — background, border, padding. MUST include `overflow: hidden !important;` | Required |
| 6b | Hide Nav Items | Hide Explore, Shorts, Communities, Bookmarks, More. MUST use `href`-based selectors, NEVER `nth-child`. | Required |
| 6c | Reorder Nav Items | Flex `order` values for visible nav items | Required |
| 6d | Hide/Replace Nav Icons | Replace or hide specific SVG icons (e.g., Premium polygon) | Optional |
| 7 | Logo Replacement | Replace the INLEO logo link (`a[aria-label="Threads Page"]`) | Optional |
| 8 | Buttons | Style `button.rounded-full` (primary CTA) and generic buttons separately | Required |
| 9 | Inputs / Compose Box | Style `input`, `textarea`, `[contenteditable]` | Required |
| 10 | Dividers | `hr` border color | Required |
| 11 | Text Styling | `p`, `span`, `a`, font-weight classes, text-gray classes | Required |
| 12 | SVG/Icons | Default fill color for SVGs | Required |
| 13 | Scrollbar | `::-webkit-scrollbar` styles (min width: 6px for usability) | Required |
| 14 | Selection | `::selection` highlight color | Optional |
| 15 | Feed Tabs | Sticky tab bar links ("For You", "Latest", etc.) | Required |
| 16 | Sticky Header | `.sticky` classes — near-opaque solid background, border. **Do NOT use `backdrop-filter: blur()`** — it causes scroll jank. | Required |
| 17 | Dropdown Menus | `[data-radix-popper-content-wrapper]`, `div[role="menu"]`, `div[role="listbox"]` | Required |
| 17b | Feed Header Dropdown | `div[class*="top-full"][class*="z-1000"]` — the "Your Lists" dropdown | Required |
| 18 | Avatar Outlines | Optional non-followed user outline ring | Optional |
| 19 | Nav Alignment Fixes | Premium/Notifications padding normalization | Required |
| 20 | Price Ticker | `#cyber-price-ticker` styling (used when `content.js` injects it for cyberpunk themes) | Conditional |
| 21 | Profile Page Fixes | Sort buttons, Following/Followers row | Required |
| 22 | Articles Page Fixes | Filter row layout, INLEO dropdown | Required |
| 23 | Publish Dropdown | `nav div[class*="w-[calc"]` — the publish menu | Required |
| 24 | Mute Feature | `.inleo-mute-btn`, `.inleo-mute-wrapper`, `.inleo-muted-post`, popup exclusions | Required |
| 25 | Wallet Page | `body.inleo-wallet-page` specific overrides | Required |
| 26 | Avatar Outlines (Self/Other) | `.avatar-self-target`, `.avatar-other-target` | Required |

---

## 6. Inleo DOM Reference

### 6.1 Page Layout (as of Feb 2026)

```
<body>
  <div>                              ← outer app wrapper
    <div>                            ← inner app wrapper
      <main class="relative">        ← main content area
        <!-- LEFT COLUMN -->
        <div>                        ← left sidebar wrapper
          <a aria-label="Threads Page">  ← logo link
          <nav>                      ← navigation menu
          <!-- JS injects #cyber-price-ticker here -->
        </div>

        <!-- CENTER COLUMN -->
        <main id="threads">          ← feed/content area
          <div>                      ← sticky tab bar (For You, Latest...)
          <div>                      ← compose box
          <div class="flex flex-col"> ← feed container with post cards
        </main>

        <!-- RIGHT COLUMN -->
        <aside>                      ← right sidebar
          <div>                      ← inner wrapper
            <div>                    ← individual panels (trending, who to follow, etc.)
          </div>
        </aside>
      </main>
    </div>
  </div>
</body>
```

### 6.2 Navigation (`<nav>`) DOM — Resting State

| Index | Tag | Stable Selector | Label | Visibility |
|-------|-----|-----------------|-------|------------|
| 0 | `<a>` | `a[href="/threads"]` | Home | Visible |
| 1 | `<a>` | `a[href="/explore"]` | Explore | Hidden |
| 2 | `<a>` | `a[href="/posts"]` | Articles | Visible |
| 3 | `<a>` | `a[href="/shorts"]` | Shorts | Hidden |
| 4 | `<div>` | `div:has(> a[href="/communities"])` | Communities | Hidden |
| 5 | `<a>` | `a[href="/notifications"]` | Notifications | Visible |
| 6 | `<div>` | `div:has(> a[href="/bookmarks"])` | Bookmarks | Hidden |
| 7 | `<div>` | `div:has(> a[href="/premium"])` | Premium | Visible |
| 8 | `<div>` | `div:has(> a[href*="/wallet"])` | Wallet | Visible |
| 9 | `<div>` | `div:has(> a[href*="/profile"])` | Profile | Visible |
| 10 | `<div>` | `div.sm\:hidden` | Mobile Profile | Hidden on desktop |
| 11 | `<div>` | `div.hidden.pc\:block:not(:has(a))` | More | Hidden |
| 12 | `<div>` | `div:has(button):last-of-type` | Publish | Visible |

**WARNING**: On hover, Inleo injects ~40 additional `<div>` tooltip/popper nodes as direct children of `<nav>`. All index-based positions become invalid. NEVER use `nth-child` inside `<nav>`.

### 6.3 Post Card DOM

```
main#threads > div.flex-col > div    ← individual post wrapper
  └─ div.cursor-pointer              ← clickable post area
      ├─ div (avatar column)
      │   └─ img[src*="avatar"]      ← avatar image
      ├─ div (content column)
      │   ├─ div.flex.items-center   ← header row (username, timestamp)
      │   │   ├─ a[href^="/profile/"].font-bold  ← username link
      │   │   └─ span (timestamp, etc.)
      │   ├─ p / div                 ← post body text
      │   └─ div (action buttons: like, comment, repost, share)
```

### 6.4 Key Attribute Patterns

| Pattern | Where | What |
|---------|-------|------|
| `data-radix-popper-content-wrapper` | Tooltips/popovers | Radix UI wrapper for popups |
| `role="tooltip"` / `role="dialog"` | Hover cards | Accessible popup containers |
| `id` starting with `radix-` | Dynamic popups | Radix-managed overlays |
| `class*="shadow-["` + `class*="text-xs"` | Hover profile cards | Inleo's user preview popup |
| `class*="top-full"` + `class*="z-1000"` | Dropdown menus | Dropdown below header buttons |
| `class*="w-[calc"` | Publish dropdown | Dynamic-width menu in nav |
| `.sticky` | Feed header | Pinned filter/tab bars |
| `.border-b.border-pri` | Post dividers | Border-bottom on posts |
| `.item-active` | Active nav link | Currently selected nav page |

---

## 7. Mandatory Rules (Non-Negotiable)

These rules prevent the bugs that took days to debug during the Cyberpunk V2 build. Every theme MUST follow them.

### Rule 1: Never Use Positional Selectors Inside `<nav>`

```css
/* BROKEN — shifts when tooltip nodes are injected */
nav > *:nth-child(N) { ... }
nav > *:first-child { ... }
nav > *:last-child { ... }

/* CORRECT — immune to DOM injection */
nav > a[href="/threads"] { ... }
nav div:has(> a[href="/premium"]) { ... }
```

**Why**: Inleo injects/removes ~40 tooltip DOM nodes on hover, changing all child indices. This causes an infinite oscillation loop at ~150ms intervals visible as flickering.

### Rule 2: Always Add `overflow: hidden` to `<nav>`

```css
nav {
    overflow: hidden !important;
}
```

**Why**: Clips tooltip popovers injected by Inleo JS that would otherwise overflow and affect layout.

### Rule 3: Use Specific Transitions, Never `transition: all`

```css
/* CORRECT */
transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease !important;

/* BROKEN */
transition: all 0.2s ease !important;
```

**Why**: `all` animates properties on hidden elements that briefly become visible during tooltip injection.

### Rule 4: Use `border-*-color` Instead of Border Shorthand on Hover

```css
/* CORRECT — only color changes, no reflow */
nav a div:hover { border-left-color: var(--primary) !important; }

/* BROKEN — shorthand resets width/style, causes layout reflow */
nav a div:hover { border-left: 2px solid var(--primary) !important; }
```

### Rule 5: Exclude `<nav>` Links from Global Hover Effects

If the theme has a global `a:hover` rule (text-shadow, transform, etc.), always add:

```css
nav a:hover,
nav a.group:hover {
    text-shadow: none !important;
    /* cancel any other global a:hover effects */
}
```

### Rule 6: Kill Transitions on All Nav Direct Children

```css
nav > *,
nav > * > * {
    transition: none !important;
}
```

**Why**: Prevents hover glitches on reordered/hidden items during tooltip injection.

### Rule 7: Hide Items with Maximum Redundancy

A single `display: none` is NOT enough. Tailwind responsive classes (`pc:block`, `sm:flex`) fight back.

```css
/* Full hiding pattern for unwanted nav items */
nav a[href="/explore"],
nav a[href="/explore"] * {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    width: 0 !important;
    overflow: hidden !important;
    margin: 0 !important;
    padding: 0 !important;
    opacity: 0 !important;
    pointer-events: none !important;
    position: absolute !important;
    transition: none !important;
}
```

### Rule 8: Exclude `.sticky` from Global Background/Z-Index Overrides

```css
/* CORRECT — excludes sticky header */
main#threads div.border-b.border-pri:not(.sticky) {
    z-index: 1 !important;
}

/* Then restore sticky z-index explicitly */
main#threads div.sticky,
main#threads div.sticky.border-b {
    z-index: 999 !important;
    position: sticky !important;
}
```

### Rule 9: Explicitly Style Radix/Popper Dropdowns

Radix UI dropdowns need extreme z-index and opaque backgrounds or they'll be invisible/unclickable:

```css
[data-radix-popper-content-wrapper] {
    z-index: 9999 !important;
}

div[role="menu"],
div[role="listbox"],
[data-radix-popper-content-wrapper] > div {
    background: var(--panel-bg) !important;
    z-index: 9999 !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8) !important;
}
```

### Rule 10: Never Use `display: contents` on Popup Anchors

`display: contents` destroys `position: relative`, which breaks absolutely-positioned dropdown menus anchored inside. Instead, make the wrapper a flex item.

### Rule 11: Escape Tailwind Breakpoint Prefixes

Inleo uses `tbl:flex`, `pc:block`, `sm:hidden`, etc. In CSS, the colon must be escaped:

```css
/* Targeting an element with class "tbl:flex" */
.tbl\:flex { ... }

/* Or use attribute selectors */
div[class*="tbl:flex"] { ... }
```

### Rule 12: Beware `body::after`

Inleo's native `body::after` creates a 600x600px gray background artifact. Always kill it:

```css
body::after {
    display: none !important;
}
```

### Rule 13: Never Use `getComputedStyle()` in MutationObserver Callbacks

```javascript
/* BROKEN — forces synchronous layout reflow on every call */
const pos = getComputedStyle(element).position;

/* CORRECT — check inline style attribute string instead */
const style = element.getAttribute('style') || '';
if (style.includes('position') && style.includes('fixed')) { ... }
```

**Why**: `getComputedStyle()` forces the browser to synchronously calculate styles and layout. When called inside a `MutationObserver` callback or any function that runs on every DOM change, it causes hundreds of forced reflows per second, destroying scroll performance.

### Rule 14: Debounce MutationObservers and Guard Against Re-Entrancy

Any `MutationObserver` that modifies the DOM in its callback MUST:
1. **Debounce**: Coalesce rapid triggers into a single deferred call (150–300ms).
2. **Guard re-entrancy**: Set a boolean flag before modifying DOM, check it in the observer callback, and skip processing if the flag is set.

```javascript
let _timer = null;
let _isProcessing = false;

function scheduleWork(delay = 200) {
    if (_timer) return;
    _timer = setTimeout(() => {
        _timer = null;
        if (!_isProcessing) {
            _isProcessing = true;
            try { doWork(); } finally { _isProcessing = false; }
        }
    }, delay);
}

const observer = new MutationObserver(() => {
    if (_isProcessing) return; // Skip our own mutations
    scheduleWork(150);
});
```

**Why**: Without these guards, the observer fires on its own DOM changes, creating a feedback loop that gets exponentially worse as the page accumulates content. This was the primary cause of the scroll jank bug in Phase 3.

### Rule 15: Avoid `background-attachment: fixed` and `backdrop-filter: blur()` on Scrolling/Sticky Elements

```css
/* BROKEN — causes full-page repaint every scroll frame */
body {
    background-attachment: fixed !important;
}

/* CORRECT — scrolls with content, no repaint penalty */
body {
    background-attachment: scroll !important;
}

/* BROKEN — GPU-intensive per-frame compositing */
.sticky {
    backdrop-filter: blur(12px) !important;
}

/* CORRECT — visually equivalent, no compositing cost */
.sticky {
    background: rgba(5, 5, 8, 0.97) !important;
}
```

**Why**: `background-attachment: fixed` forces the browser to repaint the entire background on every scroll frame. `backdrop-filter: blur()` requires per-frame GPU compositing of the blurred region behind the element. Both destroy scroll performance. For fixed overlays (like scanlines `body::before`), promote to a GPU layer with `will-change: transform; transform: translateZ(0);`.

---

## 8. CSS Specificity Cheat Sheet

Inleo uses Tailwind CSS, which generates classes with specificity `(0,1,0)`. Our overrides must beat them.

| Scenario | Native Specificity | Required Minimum | Technique |
|----------|-------------------|-------------------|-----------|
| Tailwind utility class (`.bg-zinc-800`) | `(0,1,0)` | `(0,1,0)` + `!important` | `[class*="bg-zinc"] { ... !important; }` |
| Tailwind responsive (`pc:block`) | `(0,1,0)` | Must use full hiding pattern (Rule 7) | 9 properties + `!important` |
| Radix dynamic attribute | `(0,1,0)` | `(0,1,0)` + `!important` | `[data-radix-popper-content-wrapper]` |
| Generic button vs themed button | `(0,2,1)` | `(0,2,1)` or higher | Double the class: `button.my-btn.my-btn` |
| Inline styles from JS | `(1,0,0)` | Cannot beat without `!important` | Always use `!important` |

**General rule**: Every declaration in a theme CSS file should use `!important`. Inleo's Tailwind classes and inline styles will override anything without it.

---

## 9. Tailwind Override Patterns

Common Inleo Tailwind classes and how to override them:

### Background Colors
```css
/* Kill all gray/zinc/neutral backgrounds */
[class*="bg-zinc"],
[class*="bg-gray"],
[class*="bg-neutral"],
.dark\:bg-zinc-800,
.bg-gray-200 {
    background-color: var(--panel-bg) !important;
}
```

### Background "pri" (primary) Classes
```css
main#threads .bg-pri,
main#threads .dark\:bg-pri-d,
main#threads [class*="bg-pri-hov"],
main#threads [class*="hover:bg-pri"],
main#threads .sm\:hover\:bg-pri-hov,
main#threads .sm\:dark\:hover\:bg-pri-hov-d {
    background-color: var(--panel-bg) !important;
}
```

### Border Colors
```css
main#threads,
.tbl\:border-x {
    border-color: rgba(0, 243, 255, 0.1) !important; /* Use your --primary with low alpha */
}
```

### Text Color Classes
```css
[class*="text-gray"],
.text-pri\/60,
.dark\:text-pri-d\/60 {
    color: var(--text-secondary) !important;
}
```

---

## 10. JS-Injected DOM Elements

`content.js` injects several DOM elements. Your theme CSS MUST style them.

### 10.1 Price Ticker (`#cyber-price-ticker`)

Injected after `<nav>` as a sibling. Only injected when theme name contains `"cyberpunk"`. If your theme wants a ticker, the theme name should include "cyberpunk", or `content.js` can be modified to check for other patterns.

```html
<div id="cyber-price-ticker">
    <div class="ticker-title">Market Data</div>
    <div class="ticker-row" id="ticker-btc">
        <span class="ticker-symbol">BTC</span>
        <span class="ticker-price">$95,432.00</span>
        <span class="ticker-change up">+2.1%</span>
    </div>
    <!-- ticker-hive, ticker-leo follow same pattern -->
</div>
```

**Required classes to style**: `.ticker-title`, `.ticker-row`, `.ticker-symbol`, `.ticker-price`, `.ticker-change`, `.ticker-change.up`, `.ticker-change.down`

### 10.2 Mute Button (`.inleo-mute-btn`)

Injected next to username links in the feed.

```html
<span class="inleo-mute-wrapper">
    <button class="inleo-mute-btn">[ mute ]</button>
</span>
```

**Required classes to style**:
- `button.inleo-mute-btn.inleo-mute-btn` — doubled class to beat generic button specificity `(0,2,1)`
- `.inleo-mute-wrapper` — inline-flex wrapper with `order: 99`
- `.inleo-muted-post` — applied to hidden posts (use full hiding pattern)
- Popup exclusion selectors to prevent mute buttons inside hover cards

### 10.3 Settings Link (`#inleo-skin-settings-link`)

Cloned from the Profile nav container, with href changed to `/settings`. Needs an `order` value in the flex layout.

### 10.4 Wallet Page Body Class

`content.js` adds `body.inleo-wallet-page` when on `/wallet/*` URLs. Use this to conditionally hide/show elements.

---

## 11. Theme Checklist

Before declaring a theme complete, verify each item:

### Layout
- [ ] Body background renders correctly (no white/gray flash)
- [ ] `body::after` is killed (no 600x600 gray square)
- [ ] All three columns (left sidebar, center feed, right sidebar) are visible
- [ ] Left sidebar panels (logo, nav, ticker) are aligned to the same width

### Navigation
- [ ] Explore, Shorts, Communities, Bookmarks, More are hidden
- [ ] Home, Articles, Premium, Wallet, Profile, Settings, Notifications, Publish are visible and in correct order
- [ ] Hovering over nav items does NOT cause flickering
- [ ] Active nav item has a visible indicator (border, color, background)
- [ ] Publish dropdown opens and is readable
- [ ] Nav `overflow: hidden` is set

### Feed
- [ ] Post cards have visible backgrounds (not transparent)
- [ ] Post card corner brackets or borders render correctly
- [ ] Sticky tab bar ("For You", "Latest") stays on top of posts
- [ ] "Your Lists" dropdown opens and is clickable
- [ ] Images inside posts don't have gray background boxes
- [ ] Comment/reply expansion doesn't show gray boxes
- [ ] Hover on posts shows subtle highlight

### Buttons & Inputs
- [ ] Primary CTA buttons (rounded-full) are styled
- [ ] Generic action buttons are styled
- [ ] Input fields and compose box are styled
- [ ] Mute button `[ mute ]` is visible in correct color

### Typography
- [ ] Body text is readable on the dark background
- [ ] Links have distinct color from body text
- [ ] Font-bold/semibold/medium text has themed color
- [ ] Timestamps and metadata text have muted secondary color

### Dropdowns & Popups
- [ ] Radix popper content has `z-index: 9999` and opaque background
- [ ] `div[role="menu"]`, `div[role="listbox"]` are styled
- [ ] Feed header dropdown (`top-full z-1000`) is visible
- [ ] Publish dropdown (`w-[calc`) is styled

### Special Pages
- [ ] Articles page filter row doesn't overflow
- [ ] Profile page sort buttons fit without overflow
- [ ] Wallet page hides ticker and "More" button
- [ ] SPA navigation (clicking Premium, back button) does NOT flash default theme

### Mute Feature
- [ ] `[ mute ]` button appears to the RIGHT of usernames
- [ ] `[ mute ]` button does NOT appear inside hover popup cards
- [ ] Muted posts are fully hidden
- [ ] Mute button has correct color (beats generic button rule)

### Scrollbar & Selection
- [ ] Scrollbar thumb is visible and at least 6px wide
- [ ] Text selection highlight uses theme colors

### Performance
- [ ] Body does NOT use `background-attachment: fixed` (use `scroll`)
- [ ] Sticky headers do NOT use `backdrop-filter: blur()` (use near-opaque solid `rgba`)
- [ ] Fixed overlay pseudo-elements (`body::before`) include `will-change: transform; transform: translateZ(0);` for GPU compositing
- [ ] Scrolling remains smooth after loading 50+ posts via infinite scroll

---

## 12. Providing a Theme Design to AI

When giving a new theme design to an AI agent for implementation, provide the following:

### Required Materials

1. **Color palette** — at minimum: primary, secondary, accent, background-dark, panel-background
2. **Font choices** — heading font + body font + Google Fonts URL(s)
3. **CSS or HTML mockup** — the visual design as CSS custom properties and style rules

### Recommended Materials

4. **Background treatment** — solid color, gradient, image, scanlines, etc.
5. **Border style** — solid, glow, dashed, none, corner brackets, etc.
6. **Button style** — pill, square, outlined, filled, glow, etc.
7. **Active/hover states** — what changes on hover and for active nav items
8. **Any custom decorations** — logo replacement text, icon changes, special overlays
9. **Images** — any background images or icon replacements (provide as files in `img/`)

### Template Prompt

Use this template when asking an AI to create a new theme:

```
Create a new theme for the Inleo Skin Extension called "{theme-name}".

Design specifications:
- Primary color: {hex}
- Secondary color: {hex}
- Accent color: {hex}
- Background: {description or CSS}
- Panel background: {hex}
- Heading font: {font name} (Google Fonts URL: {url})
- Body font: {font name} (Google Fonts URL: {url})
- Border style: {description}
- Button style: {description}
- Special effects: {scanlines, glow, etc.}

Reference the THEME_FRAMEWORK.md for all mandatory rules and CSS section structure.
Copy themes/cyberpunk-v2.css as the starting template.
Keep ALL selectors and !important declarations — only change colors, fonts, and decorative properties.

Here is the HTML/CSS mockup:
{paste HTML/CSS}
```

### What the AI Agent Should Do

1. Copy `cyberpunk-v2.css` as the base template
2. Replace the `:root` variables with the new palette
3. Replace font `@import` URLs
4. Walk through each numbered CSS section (0-26), replacing colors, fonts, and decorative values
5. Keep all selectors exactly as-is (they target Inleo's DOM structure)
6. Keep all `!important` declarations
7. Keep all Rules 1-12 patterns intact
8. Add the new theme to `popup.html`
9. If the theme uses custom images, add them to `img/` and declare in `manifest.json`
10. Test against the Theme Checklist (Section 11)

### What NOT to Change

When creating a new theme from the template, these structural elements must remain unchanged:

- The `nav overflow: hidden` rule
- The `nth-child` avoidance (href-based selectors)
- The full hiding pattern for unwanted nav items (all 9 properties)
- The `nav > *, nav > * > * { transition: none }` rule
- The tooltip/popper neutralization rules
- The `.sticky` exclusion patterns
- The Radix dropdown z-index rules
- The mute button doubled-class specificity trick
- The mute popup exclusion CSS selectors
- The wallet page body class conditional rules
- The flex `order` values for nav item reordering
- The `background-attachment: scroll` on body (never use `fixed`)
- The `will-change: transform; transform: translateZ(0)` on fixed overlays
- The absence of `backdrop-filter: blur()` on sticky headers (use solid `rgba` instead)

---

## Appendix A: Quick-Start Template

For the fastest possible theme creation, copy this minimal change list:

```
1. themes/cyberpunk-v2.css → themes/{new-name}.css
2. Find-replace in the new file:
   - "#00f3ff" → your primary hex
   - "#ff2a00" → your secondary hex
   - "#9d00ff" → your accent hex
   - "#050508" → your bg-dark hex
   - "#0a0a12" → your panel-bg hex
   - "rgba(0, 243, 255," → your primary as rgba(R, G, B,  (keep the alpha values)
   - "rgba(255, 42, 0," → your secondary as rgba(R, G, B,
   - "Share Tech Mono" → your monospace font
   - "Rajdhani" → your body font
   - Update @import font URLs
3. Add <option> to popup.html
4. Test against Section 11 checklist
```

This approach gives you a working theme in under 5 minutes, with all the battle-tested structural CSS intact.

---

## Appendix B: content.js Feature Hooks

Features in `content.js` that interact with theme CSS:

| Feature | JS Trigger | CSS Classes/IDs Created | Conditional On |
|---------|-----------|------------------------|----------------|
| Price Ticker | `injectPriceTicker()` | `#cyber-price-ticker`, `.ticker-*` | Theme name includes `"cyberpunk"` |
| Mute Button | `injectMuteButton()` | `.inleo-mute-btn`, `.inleo-mute-wrapper` | Always active |
| Muted Posts | `processFeed()` (debounced via `scheduleProcessFeed()`) | `.inleo-muted-post` | Always active |
| Avatar Outlines | `processFeed()` (debounced via `scheduleProcessFeed()`) | `.avatar-self-target`, `.avatar-other-target` | Always active |
| Settings Link | `injectSettingsLink()` | `#inleo-skin-settings-link` | Always active |
| Wallet Detection | Poller in `setInterval` (3s) | `body.inleo-wallet-page` | URL contains `/wallet` |
| Data Attribute | `applyTheme()` | `html[data-inleo-skin]` | Theme is active |

If a new theme wants to conditionally enable/disable the price ticker, modify the check in `content.js` at `applyTheme()` — currently it checks `themeName.includes('cyberpunk')`.

---

## Appendix C: Known Inleo Behaviors to Watch For

| Behavior | Impact | Mitigation |
|----------|--------|------------|
| Next.js SPA navigation wipes `<head>` children | Font `<link>` tags are lost | Poller in `content.js` re-injects fonts every 3s |
| Radix UI tooltip injection into `<nav>` (~40 nodes on hover) | Breaks `nth-child` selectors, causes layout oscillation | Use `href`-based selectors + `overflow: hidden` on nav |
| Tailwind responsive prefixes (`pc:block`, `tbl:flex`) | Re-show hidden elements at certain breakpoints | Use full 9-property hiding pattern |
| `body::after` fixed 600x600 element | Gray square visible behind transparent content | `body::after { display: none !important; }` |
| Hover cards use `shadow-[` + `text-xs` class combo | Mute buttons get duplicated inside them | JS `isInsidePopupOrCard()` filter + CSS `display: none` on popup selectors |
| Wallet page injects separate `<nav>` structure | Global nav CSS bleeds into wallet nav | `body.inleo-wallet-page` scoped selectors |
| Feed infinite scroll adds DOM nodes dynamically | New posts need mute buttons injected | Debounced `MutationObserver` on `document.body` with `subtree: true` via `scheduleProcessFeed()`. Observer skips its own mutations using `_isProcessingFeed` re-entrancy guard. |
| bfcache (back-forward cache) restores stale page | `adoptedStyleSheets` may be detached | Poller checks `document.adoptedStyleSheets.includes(currentThemeSheet)` |
| `background-attachment: fixed` on body | Full-page repaint every scroll frame, severe jank | Use `background-attachment: scroll` instead |
| `backdrop-filter: blur()` on sticky elements | GPU-intensive per-frame compositing during scroll | Use near-opaque solid background (e.g., `rgba(5,5,8,0.97)`) instead |
| Fixed overlay pseudo-elements (`body::before`) | Blocks main-thread painting during scroll | Promote to GPU layer with `will-change: transform; transform: translateZ(0)` |
