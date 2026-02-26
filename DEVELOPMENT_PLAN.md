# Development Plan & Technical Architecture

This document outlines the technical implementation, file structure, and design decisions behind the Inleo Skin Extension. Phase 1 focuses on a robust CSS-overriding foundation.

## Architecture Overview

The extension strictly follows Manifest V3 guidelines and operates solely on `https://inleo.io/*`.

### Core Components

1. **`manifest.json`**
   - Declares permissions (`storage`, `scripting`, `activeTab`) and host permissions for `https://inleo.io/*`.
   - Registers the background service worker, popup UI, and content scripts.
   - Exposes web accessible resources (images, fonts, stylesheets) so they can be injected into the host page securely.

2. **`popup.html` & `popup.js`**
   - Provide the user interface for theme selection.
   - `popup.js` reads from and writes to `chrome.storage.local`.
   - When a theme is selected, it sends a message (`action: "applyTheme"`) to the active tab's content script to instantly apply the new styles.

3. **`content.js`**
   - Automatically runs when `inleo.io` loads.
   - Checks `chrome.storage.local` for the user's saved theme.
   - Injects a `<link rel="stylesheet">` tag with the ID `inleo-skin-theme-stylesheet` into the document `<head>`.
   - Listens for messages from `popup.js` to change the `href` of the injected stylesheet dynamically without a page reload.

4. **`background.js`**
   - Handles extension installation events and can be used to set default states (e.g., defaulting to the "Default" theme on first install).

## CSS Overriding Strategy (Cyberpunk V2)

The most complex part of Phase 1 was fully overriding Inleo's native Tailwind CSS without breaking the site layout. The `.css` files in the `themes/` directory use high-specificity selectors and `!important` tags to enforce styling.

### Key CSS Challenges Solved:
- **Defeating Tailwind Overrides**: To hide specific navigation items (Explore, Shorts, Communities, Bookmarks, More), simple `display: none` was insufficient because responsive Tailwind classes (like `pc:block`) would re-render them on larger screens. The solution required absolute positioning, zero dimensions, and `visibility: hidden` combined with DOM order targeting.
- **Background Transparency**: Inleo deeply nests utility classes like `bg-pri` and `bg-zinc-800`. Replacing them involved globally targeting these classes and forcing them to match the dark panel color (`#0a0a12`).
- **Pseudo-Element Clashes**: The native `body::after` element created a fixed 600x600px gray background artifact that bled through whenever content expanded. This was entirely removed (`display: none !important`) in favor of solid dark post cards.
- **Hover Glitches**: Hidden navigation links maintained CSS transitions (`transition: color 0.2s`). Hovering near them caused rendering glitches. All transitions on navigation children were explicitly disabled.

---

## Phase 2: Bug Fixes & Theme Cleanup

### 2.1 Removed Themes
- **Cyberpunk V1** (`themes/cyberpunk.css`) and **Pixel Godzilla** (`themes/godzilla.css`) were removed.
- Their `<option>` entries were deleted from `popup.html`.
- Background image logic (`img/000.png`, `img/001.jpg`) was removed from `content.js`.

### 2.2 Nav Hover Glitch — Root Cause & Fix

This was the most critical bug. Hovering over **Home**, **Articles**, or **Notifications** in the left sidebar caused rapid flickering/glitching.

#### Root Cause (Confirmed via MutationObserver)

Inleo's JavaScript injects **~40 tooltip/popper DOM nodes** as direct children of `<nav>` every time a nav link receives a hover event. This is their tooltip system built on Radix UI. The injection-removal cycle is:

1. **`mouseenter` on Home** → JS injects ~40 `<div>` children into `<nav>`
2. **These nodes shift ALL `nth-child` indices** — Communities (was 5th child) becomes 45th, Bookmarks (was 7th) becomes 47th, etc.
3. **Our CSS rules used `nth-child` to hide items** like `nav>div:nth-child(5)` for Communities → after the injection, `nth-child(5)` now targets a tooltip `<div>`, and Communities becomes visible again
4. **The suddenly-visible items physically displace the layout**, pushing the cursor off Home → triggers `mouseleave`
5. **On `mouseleave`** → JS removes all ~40 tooltip nodes → layout snaps back → cursor is back over Home → triggers `mouseenter` again
6. **Result: infinite oscillation loop at ~150ms intervals** = the visible flicker

#### The Critical Lesson: NEVER Use `nth-child` Inside `<nav>`

Inleo's tooltip system dynamically adds/removes children from `<nav>`. Any CSS selector based on child position (`nth-child`, `nth-of-type`, `first-child`, `last-child`) **will break** when tooltips are injected. This is the #1 rule for all future themes.

#### What Was Changed

**1. Replaced ALL `nth-child` selectors with `href`-based `:has()` selectors:**

```css
/* ❌ BROKEN — shifts when tooltip nodes are injected */
nav>div:nth-child(5) { display: none !important; }  /* Communities */
nav>div:nth-child(7) { display: none !important; }  /* Bookmarks */
nav>a:nth-child(1) { order: 1 !important; }         /* Home reorder */
nav>div:nth-child(8) { order: 3 !important; }       /* Premium reorder */

/* ✅ FIXED — immune to DOM injection */
nav div:has(> a[href="/communities"]) { display: none !important; }
nav div:has(> a[href="/bookmarks"]) { display: none !important; }
nav>a[href="/threads"] { order: 1 !important; }     /* Home reorder */
nav>div:has(> a[href="/premium"]) { order: 3 !important; }
```

**2. Added `overflow: hidden` to `<nav>`:**

```css
nav {
    overflow: hidden !important; /* Clips tooltip popovers injected by Inleo JS */
}
```

**3. Targeted dynamically injected tooltip nodes:**

```css
/* These divs are injected on hover and have no class attribute */
nav > div[data-radix-popper-content-wrapper],
nav > div[style*="position"],
nav > div:not([class]) {
    position: absolute !important;
    pointer-events: none !important;
    z-index: -1 !important;
}
```

**4. Excluded nav links from global `a:hover` text-shadow:**

```css
nav a:hover, nav a.group:hover {
    text-shadow: none !important;
}
```

**5. Narrowed transitions to specific properties only:**

```css
/* ❌ Too broad — causes unintended transitions on hidden elements */
transition: all 0.2s ease !important;

/* ✅ Only animate what we need */
transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease !important;
```

**6. Used `border-left-color` instead of `border-left` shorthand on hover:**

```css
/* ❌ Shorthand resets width/style, causing layout reflow */
nav a div:hover { border-left: 2px solid var(--primary) !important; }

/* ✅ Only change color, no box model change */
nav a div:hover { border-left-color: var(--primary) !important; }
```

---

### 2.3 Stacking Contexts & Dropdown Visibility

**Bug**: Popover menus such as "Your Lists", "Publish", and "Articles Filter" were appearing behind the main feed or rendering completely transparent.

#### Root Cause (Aggressive Global Overrides)
To style the dark post feed, generic fallback rules were used, such as forcing all `main#threads div.border-b` to have `background: var(--panel-bg)` and `z-index: 1`. This inadvertently targeted native sticky headers (which also have a `.border-b` class), stripping them of their native high z-index (e.g., Tailwind's `z-[999]`). Consequently, when a dropdown positioned inside that sticky header opened, it was constrained by the parent's `z-index: 1`, forcing it behind subsequent post cards in the DOM.

#### Technical Fix
1. **Targeted Exclusions**: Use `:not(.sticky)` when applying global UI resets to avoid crushing the stacking hierarchy of persistent layout elements.
2. **Explicit High Specificity Z-Index**: Explicitly restore and enforce the z-index on sticky containers with multiple selectors to beat Tailwind overrides: 
   `main#threads div.sticky, main#threads div.sticky.border-b { z-index: 999 !important; }`
3. **Popper/Radix Component Handling**: Dropdowns in Inleo are often driven by Radix UI. They require extreme z-indexes (`z-index: 9999 !important;`) and forced opaque backgrounds (`background: var(--panel-bg) !important;`) applied specifically to their containers (e.g., `[data-radix-popper-content-wrapper]` or `div[class*="top-full"]`).

### 2.4 Single Page Application (SPA) Theme Persistence

**Bug**: Theme reverting to the default Inleo light/dark mode when clicking navigation links (e.g., clicking "Premium", or navigating back to "Home").

#### Root Cause
Inleo is an SPA using client-side routing. Navigating between major views triggers a React state change that can completely reconstruct the `<head>` or `<body>`. The extension's `content.js` previously only injected the theme `<link rel="stylesheet">` once during `document_start`. When the SPA router wiped the `<head>`, the stylesheet was lost until a raw page reload.

#### Technical Fix
A `MutationObserver` was added to `content.js` to rigidly watch `document.head` for `childList` additions/removals. If the observer detects that `#inleo-skin-theme-stylesheet` has been scrubbed from the DOM, it fetches the current active theme from storage and re-injects it immediately. A 200ms debounce prevents race conditions during rapid SPA transitions.

### 2.5 Advanced Flexbox & Layout Normalization

**Bug**: Specific navigation items ("Premium", "Notifications") were vertically misaligned or possessed different computed heights and spacing. The external "Articles" filter row overflowed the feed container.

#### Root Cause
Inleo's native navigation contains varying CSS structures: standard links (`Home`, `Articles`) use `display: block` with nested flex items, while others (`Premium`) use `display: inline`. Applying uniform flex alignment tricks or `::before` pseudo-elements (like adding the `token` icon) distorted inline wrappers. Additionally, component nesting caused inherited `gap` and `padding` rules to compound inaccurately.

#### Technical Fix
1. **Property Normalization**: Force fundamental display types before trying to fix flex alignments. For example, explicitly defining `nav a[href="/premium"] { display: block !important; }` normalizes its baseline behavior to match sibling nav items.
2. **Nesting Erasure**: When injecting custom elements (like `::before` icons), find the deepest flex container and manually zero-out native inner padding or gaps (`gap: 0 !important;`) to prevent layout stretching.
3. **Container Constraints**: For horizontal button rows (like the Filters near the INLEO Articles dropdown), apply `flex-wrap: nowrap`, `overflow-x: auto`, and hide scrollbars (`::-webkit-scrollbar { display: none; }`). Minimize button padding and avoid `max-width` on dynamic dropdown triggers to prevent content clipping.

---

## Guidelines for Future Themes

These rules MUST be followed in every new theme CSS file to prevent similar bugs.

### Rule 1: Never Use Positional Selectors Inside `<nav>`
- ❌ `nav>*:nth-child(N)`, `nav>*:first-child`, `nav>*:last-child`
- ✅ `nav>a[href="/threads"]`, `nav div:has(> a[href="/premium"])`
- **Why:** Inleo injects/removes tooltip DOM nodes on hover, changing all child indices.

### Rule 2: Always Add `overflow: hidden` to `<nav>`
- Prevents injected tooltip/popper content from overflowing and affecting layout.

### Rule 3: Use Specific Transitions, Never `transition: all`
- ✅ `transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease`
- ❌ `transition: all 0.2s ease`
- **Why:** `all` animates properties on hidden elements that briefly become visible.

### Rule 4: Use `border-*-color` Instead of Border Shorthand on Hover
- ✅ `border-left-color: var(--primary)` 
- ❌ `border-left: 2px solid var(--primary)`
- **Why:** Shorthand resets width/style, causing layout reflow and flicker.

### Rule 5: Exclude `<nav>` Links from Global Hover Effects
- If your theme has a global `a:hover` rule (e.g., text-shadow, transform), explicitly exclude nav links:
  ```css
  nav a:hover, nav a.group:hover { text-shadow: none !important; }
  ```

### Rule 6: Kill Transitions on All Nav Direct Children
- Add `nav>*, nav>*>* { transition: none !important; }` to prevent hover glitches on reordered/hidden items.

### Rule 7: Hide Items with Maximum Redundancy
- Use all of: `display: none`, `visibility: hidden`, `height: 0`, `width: 0`, `overflow: hidden`, `opacity: 0`, `position: absolute`, `pointer-events: none`, `transition: none`
- **Why:** Tailwind responsive classes (`pc:block`, `sm:flex`) fight back. A single `display: none` is not enough.

### Rule 8: Exclude Sticky Elements from Global Background/Z-Index Overrides
- When applying global resets (e.g., `main#threads div.border-b { z-index: 1; }`), explicitly exclude sticky headers using `:not(.sticky)`.
- Re-declare a robust z-index for sticky headers (`main#threads div.sticky, main#threads div.sticky.border-b { z-index: 999 !important; }`).

### Rule 9: Explicitly Style Popper and Radix UI Dropdowns
- Inleo uses dynamic `div[class*="top-full"]` or `[data-radix-popper-content-wrapper]` nodes. Always give these `z-index: 9999 !important;` and an opaque background color, otherwise they will be unclickable or transparent.

### Rule 10: Standardize Display Properties for Flex Items
- If alignment issues arise for injected pseudo-elements (e.g., icons next to text), ensure the parent container acts like its siblings (e.g., `display: block !important;`) and manually resolve nesting padding/gap anomalies.

### Rule 11: Beware Tailwind Breakpoint Prefixes (`tbl:`, `pc:`)
- ❌ `div.flex.flex-row`
- ✅ `div.tbl\:flex.flex-row, div.flex.flex-row`
- **Why:** Inleo heavily uses responsive breakpoint classes (like `tbl:flex` for tablet or `pc:block` for PC). When writing CSS overrides, you must escape the colon (`tbl\:flex`) or use attribute wildcard selectors `div[class*="tbl:flex"]` to ensure your rule hits the element correctly across all screen sizes. Trying to target a generic `.flex` class will silently fail if the element actually has `.tbl:flex`.

### Rule 12: `display: contents` Destroys `position: relative`
- **Pitfall:** `display: contents` is excellent for flattening nested `div` wrappers so buttons can share a unified flex grid. However, if the wrapper has `position: relative` and serves as an anchor for an internal absolute-positioned dropdown menu, `display: contents` will destroy that anchor.
- **Fix:** Do not use `display: contents` on wrappers holding absolute popups. Instead, make the wrapper itself a compliant flex item (`display: flex; flex: 1;`) and force its internal button to stretch (`width: 100%`). This preserves the layout grid while keeping the popup anchored correctly under the wrapper.

### Inleo `<nav>` DOM Reference (as of Feb 2026)

| Child | Tag | Selector | Item | Status |
|-------|-----|----------|------|--------|
| 0 | `<a>` | `a[href="/threads"]` | Home | ✅ Visible |
| 1 | `<a>` | `a[href="/explore"]` | Explore | ❌ Hidden |
| 2 | `<a>` | `a[href="/posts"]` | Articles | ✅ Visible |
| 3 | `<a>` | `a[href="/shorts"]` | Shorts | ❌ Hidden |
| 4 | `<div>` | `div:has(> a[href="/communities"])` | Communities | ❌ Hidden |
| 5 | `<a>` | `a[href="/notifications"]` | Notifications | ✅ Visible |
| 6 | `<div>` | `div:has(> a[href="/bookmarks"])` | Bookmarks | ❌ Hidden |
| 7 | `<div>` | `div:has(> a[href="/premium"])` | Premium | ✅ Visible |
| 8 | `<div>` | `div:has(> a[href*="/wallet"])` | Wallet | ✅ Visible |
| 9 | `<div>` | `div:has(> a[href*="/profile"])` | Profile | ✅ Visible |
| 10 | `<div>` | `div.sm\:hidden` | Mobile Profile | Hidden on desktop |
| 11 | `<div>` | `div.hidden.pc\:block:not(:has(a))` | More | ❌ Hidden |
| 12 | `<div>` | `div:has(button):last-of-type` | Publish | ✅ Visible |

> **⚠️ WARNING:** Indices 0-12 are the resting state. On hover, Inleo injects ~40 additional `<div>` elements. Do NOT rely on index positions.

---

## Phase 3: Feature Integration & Advanced Polishing

### 3.1 Mute Extension Integration
**Feature**: Brought the standalone `inleo-mute-extension` logic directly into the Cyberpunk theme extension, unifying functionality.
- **Implementation**: The `content.js` file now actively observes the feed and injects a `[ MUTE ]` button adjacent to usernames.
- **Persistence**: Relies on `chrome.storage.local` to store the array of muted users.
- **Hiding Logic**: When a post matches a muted user, the outermost article container is located using `.closest('article')` or `.closest('.border-b')` depending on the view, and hidden using `display: none !important`.

### 3.2 Wallet Page Navigation Collisions
**Bug**: Clicking "Wallet" caused the entire left-column navigation to duplicate visually, and a "More" dropdown button appeared directly beneath the user's profile avatar.
- **Root Cause**: The Wallet page dynamically changes its `<body>` class to `inleo-wallet-page` and aggressively injects its own distinct `<nav>` container specifically for Wallet contracts. Globally targeting `nav` in the CSS caused these rules to bleed into the Wallet nav.
- **Fix**: Used body-specific descendant selectors: `body.inleo-wallet-page nav div:has(> button[title="More"])` to selectively hide the Wallet's auxiliary buttons without destroying the main navigation.

### 3.3 Avatar Outline Targeting
**Bug**: Attempting to color-code user avatars (Cyan for self, Red for others) by targeting `a[href="/profile/username"]` failed because avatars in the content feed are actually wrapped directly in `<span>` elements, not anchor tags.
- **Root Cause**: Inleo's feed architecture natively assigns the user's exact username to the `id` attribute of the immediate `<span>` wrapping the `<img src="*avatar*">`.
- **Fix**: Avoided `href` matching entirely. JavaScript now queries `img[src*="avatar"]`, traverses upwards, and maps the `id` attribute of the parent `<span>` directly to the `avatar-self-target` or `avatar-other-target` CSS classes.

### 3.4 Pixel-Perfect Alignments (Nav vs Injected Content)
**Bug**: The injected `INLEO // OS_0.4.2_GLITCH` box and the `Market Data` ticker appeared misaligned compared to the main Navigation items, even when their outer bounding boxes were strictly defined as `width: 278px`.
- **Root Cause**: Discrepancies between inner padding and border boundaries vs. textual coordinates. DevTools evaluation revealed the inner text of the Navigation Items started at the `289.5px` X-coordinate, while the injected boxes fell short at `287.5px` and `288.5px`.
- **Fix**: Utilized `box-sizing: border-box` explicitly alongside pixel-perfect padding calculations (`padding-left: 18px` for the Glitch box and `padding-left: 17px` for the ticker) to force their content to begin at exactly `289.5px`, mathematically synchronizing the visual left edge.

---

## Future Phases

- **Performance**: Monitor the performance impact of high-specificity CSS selectors and the `MutationObserver` on extremely long threads.
- **Maintenance**: Regular updates to CSS selectors will be required if `inleo.io` fundamentally changes its DOM structure or Tailwind configuration.
- **New Themes**: Use `cyberpunk-v2.css` as the reference template. Copy the entire nav section (sections 6–6d) as a starting point and modify only colors/fonts.
