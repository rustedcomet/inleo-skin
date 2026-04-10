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

### 3.5 Left Sidebar Panel Width & Alignment Unification
**Bug**: The three left sidebar panels — the glitch logo/header, the navigation menu, and the market data price ticker — were misaligned with inconsistent widths. They did not share the same visual edges.

#### Root Cause
Each panel had different hardcoded widths and asymmetric margins:
- The logo had `width: 278px` + `margin-left: 12px` (hardcoded offset).
- The nav had `margin: 8px` on all four sides, introducing horizontal offset.
- The ticker had `width: 278px` + `margin: 8px 0 8px 13px` (asymmetric left margin) + `padding: 12px 16px 12px 17px` (asymmetric left padding).

#### Technical Fix
All three panels were normalized to fill their parent container instead of relying on hardcoded pixel widths:

1. **Logo panel** (`a[aria-label="Threads Page"]`):
   - `width: 278px` → `width: 100%`
   - `min-width: 278px` → `min-width: 0`
   - `margin-left: 12px` → `margin-left: 0`

2. **Navigation panel** (`nav`):
   - `margin: 8px` → `margin: 8px 0` (removed left/right margins)

3. **Price ticker panel** (`#cyber-price-ticker`):
   - `width: 278px` → `width: auto`
   - `margin: 8px 0 8px 13px` → `margin: 8px 0` (removed asymmetric left margin)
   - `padding: 12px 16px 12px 17px` → `padding: 12px 16px` (symmetrical padding)

**Result**: All three panels now render at the same width (288px), perfectly aligned at the same left and right edges.

### 3.6 Theme Flash Fix During SPA Navigation (`adoptedStyleSheets` Rewrite)
**Bug**: When clicking "Premium" in the left navigation (or pressing the browser back button), the page would flash Inleo's default/original theme for 1–2 seconds before the custom theme re-appeared.

#### Root Cause
The theme CSS was injected as a `<link>` DOM node in `<head>`. Inleo is a Next.js SPA — client-side navigation physically removes and replaces `<head>` children, destroying the injected link element. The `MutationObserver`-based poller would detect the loss and re-inject, but with a perceptible delay.

#### Technical Fix — `document.adoptedStyleSheets`
Replaced the entire DOM-based `<link>` injection strategy with `document.adoptedStyleSheets`, which attaches CSS directly to the `Document` object rather than the DOM tree. SPA navigation cannot remove adopted stylesheets.

**Key changes in `content.js`:**

1. **`applyTheme()` rewritten as `async`:**
   - Fetches the CSS file text using `fetch()` + `chrome.runtime.getURL()`.
   - Extracts `@import` rules via regex (constructed stylesheets do not support `@import`).
   - Injects font URLs as separate `<link>` tags via a new `injectFontLink()` helper.
   - Strips `@import` rules from the CSS text.
   - Creates a `CSSStyleSheet` and loads CSS via `sheet.replaceSync()`.
   - Adds the sheet to `document.adoptedStyleSheets`.

2. **`startThemeObserver()` removed entirely:**
   - The `MutationObserver` on `<head>` for `childList` changes was deleted.
   - The `bodyObserver` watching for full-body re-renders was deleted.
   - All associated state variables (`themeObserver`, `reapplyDebounce`) were removed.

3. **DOM maintenance poller simplified:**
   - No longer checks for a `<link>` tag in the DOM.
   - Now only maintains: the `data-inleo-skin` HTML attribute, font `<link>` re-injection if `<head>` was wiped, ticker/settings/mute DOM elements, and a fallback check that the adopted stylesheet is still attached (for bfcache restore edge cases).

4. **Fallback mechanism:** If `adoptedStyleSheets` fails for any reason, the function gracefully falls back to the old `<link>` injection method with a console warning.

**Result**: Zero flash when navigating via SPA links or browser back/forward. The adopted stylesheet survives all navigation events with all CSS rules intact.

### 3.7 Extension Version Bump (v1.0 → v1.1)
- Bumped `manifest.json` version from `"1.0"` to `"1.1"` to force Chrome to invalidate its content script cache after the `adoptedStyleSheets` rewrite. Chrome aggressively caches content scripts — even hard-reloading the tab was insufficient without a version bump and full extension reload.

### 3.8 Mute Button Polish — Positioning, Color & Popup Card Cleanup

Three visual bugs with the `[ mute ]` button were reported and fixed in a single pass:

#### Bug 1: Mute Button Appearing Left of Username

The `[ mute ]` button inconsistently appeared to the left or right of the username (e.g., `[ mute ] Khal` instead of `Khal [ mute ]`).

**Root Cause**: `processFeed()` iterated ALL `a[href^="/profile/"]` links — including avatar image links and `@mention` links inside post body `<p>` tags. Some of these links appeared before the bold username link in DOM order, so mute buttons injected on them rendered to the left. Additionally, `injectMuteButton()` used `insertBefore(wrapper, link.nextSibling)` which was position-dependent rather than deterministic.

**Fix (content.js)**:
1. Filtered injection targets to only `font-bold` name links (the actual username display), skipping avatar links and `@mention` links inside `<p>`.
2. Changed `injectMuteButton()` to use `parent.appendChild(wrapper)` — always appending as the last child of the flex container guarantees rightmost position.
3. Added `order: 99 !important` on `.inleo-mute-wrapper` in CSS as a visual positioning fallback even if DOM order is imperfect.
4. Added orphan cleanup at the start of `processFeed()` — any naked mute buttons without wrappers (from React reconciliation stripping wrapper elements) are removed before re-injection.

#### Bug 2: Mute Button Not Displaying in Red

The `[ mute ]` text rendered as white/gray instead of the intended red color.

**Root Cause**: CSS specificity battle. The theme's generic button override rule `button:not(.rounded-full):not(.pc\:bg-acc)` in section 8 has specificity `(0,2,1)`, which beat the original `button.inleo-mute-btn` selector at `(0,1,1)`. The generic rule's `color: var(--text-color)` (white) won over the mute button's intended red.

**Fix (cyberpunk-v2.css)**: Doubled the class selector to `button.inleo-mute-btn.inleo-mute-btn`, raising specificity to `(0,2,1)` — matching the generic rule but appearing later in the stylesheet (cascade wins). Used hardcoded `#ff2a00` instead of `var(--secondary)` to guarantee the exact red regardless of variable state. Hover effect preserved: white text with `rgba(255, 42, 0, 0.15)` background and red text-shadow glow.

#### Bug 3: Duplicate Mute Buttons & Layout Breakage in Hover Popup Card

Hovering over a username revealed a Radix UI profile popup card containing duplicate `[ mute ]` buttons and a displaced Follow/Unfollow button.

**Root Cause**: The popup card contained its own `a[href^="/profile/"]` links, and `processFeed()` injected mute buttons into them. The old popup exclusion filter `link.closest('.absolute')` checked for the Tailwind CSS *class* `.absolute`, but the hover card ancestors used *computed* `position: absolute` without that class — so the filter missed them entirely.

**Fix (content.js)**: Added `isInsidePopupOrCard()` function that walks up to 15 ancestors checking for:
- `data-radix-popper-content-wrapper` attribute (Radix tooltip/popper system)
- `role="tooltip"` or `role="dialog"` attributes
- IDs starting with `radix-`
- Class pattern `shadow-[` + `text-xs` (Inleo hover card fingerprint)
- Computed `position: fixed` (excluding `<nav>` and `main#threads` to avoid false positives)

**Fix (cyberpunk-v2.css)**: Added defensive CSS rules to hide any mute buttons that slip through the JS filter:
```css
div[class*="shadow-["][class*="text-xs"] .inleo-mute-btn,
div[class*="shadow-["][class*="text-xs"] .inleo-mute-wrapper,
[data-radix-popper-content-wrapper] .inleo-mute-btn,
[data-radix-popper-content-wrapper] .inleo-mute-wrapper,
div[role="tooltip"] .inleo-mute-btn,
div[role="tooltip"] .inleo-mute-wrapper {
    display: none !important;
}
```

**Important lesson**: An initial attempt also added `overflow: hidden` and `max-width: 320px` to the hover card container (`div[class*="shadow-["][class*="text-xs"]`), which successfully hid the mute buttons but also clipped the Follow/Unfollow button entirely. These layout constraints were removed — the CSS `display: none` rules on the mute buttons themselves are sufficient without altering the card's native dimensions.

### 3.9 Scrollbar Width Increase
- The global scrollbar (`::-webkit-scrollbar`) was widened from `2px` to `6px` in section 13 of `cyberpunk-v2.css`. At 2px the scrollbar thumb was nearly impossible to click and drag. The 6px width provides a usable grab target while preserving the same color scheme (cyan thumb via `var(--primary)`, transparent track).

### 3.10 Performance Fix — Scroll Jank & Progressive Slowdown

**Bug**: On widescreen monitors (especially in portrait orientation), the page would load with an oversized scrollbar and become progressively more sluggish as the user scrolled. Scrolling up and down became severely janky to the point of unusability. Reloading the page or restarting the browser temporarily restored normal performance until enough content accumulated again.

#### Root Cause — MutationObserver Feedback Loop

The primary cause was a cascading feedback loop between the `MutationObserver` and `processFeed()`:

1. User scrolls → infinite scroll loads new posts → DOM nodes added → `MutationObserver` fires
2. Observer calls `processFeed()` **directly with no debounce**
3. `processFeed()` modifies the DOM (adds/removes CSS classes, injects mute buttons)
4. These DOM changes re-trigger the `MutationObserver`
5. Observer calls `processFeed()` again → loop repeats

This loop amplified exponentially as more content loaded. On a portrait widescreen monitor with a taller viewport, more posts were visible simultaneously, meaning more DOM mutations per scroll event and a worse feedback cascade.

#### Contributing Factors

1. **`getComputedStyle()` in hot path**: The `isInsidePopupOrCard()` function called `getComputedStyle(ancestor).position` for every profile link and mute button on every `processFeed()` call. `getComputedStyle()` forces a synchronous layout reflow — hundreds of these per second destroyed frame rates.

2. **1-second poller calling `processFeed()` independently**: The DOM maintenance `setInterval` (§DOM MAINTENANCE POLLER) ran every 1 second, each time calling `chrome.storage.sync.get()` (async IPC), `updateCurrentUser()` (DOM query), `processFeed()` (full DOM scan), and `injectSettingsLink()` (DOM query). This stacked on top of the observer loop.

3. **`processFeed()` cleared and re-applied all state on every call**: Every invocation removed `.inleo-muted-post` from ALL elements then re-scanned and re-applied, causing unnecessary layout thrashing.

4. **CSS: `background-attachment: fixed`**: The body background used `background-attachment: fixed`, which forces the browser to repaint the entire background on every scroll frame instead of scrolling it with the content.

5. **CSS: `backdrop-filter: blur(12px)` on sticky headers**: `backdrop-filter` is GPU-intensive during scrolling, especially on sticky elements that must be composited on every frame.

6. **CSS: `body::before` scanline overlay without GPU promotion**: The full-viewport fixed overlay lacked `will-change` or `transform: translateZ(0)`, forcing the browser to composite it on the main thread during scroll.

#### Technical Fixes

**content.js changes:**

1. **Debounce + re-entrancy guard** (`scheduleProcessFeed()`):
   - New function coalesces multiple rapid triggers into a single `processFeed()` call after a configurable delay (150–300ms).
   - A `_isProcessingFeed` boolean flag prevents the `MutationObserver` from re-triggering when `processFeed()` itself modifies the DOM, breaking the feedback loop.

2. **MutationObserver hardened**:
   - Returns immediately if `_isProcessingFeed` is true (our own mutations).
   - Ignores text nodes (`nodeType !== 1`) and our own `.inleo-mute-wrapper` injections.
   - Uses `scheduleProcessFeed(150)` instead of calling `processFeed()` directly.

3. **`getComputedStyle()` removed from `isInsidePopupOrCard()`**:
   - Replaced with `getAttribute('style')` string check for inline `position: fixed/absolute`.
   - Eliminates forced synchronous layout reflows from the hot path entirely.

4. **Poller interval: 1s → 3s**:
   - The DOM maintenance poller now runs every 3 seconds instead of every 1 second.
   - 3 seconds is sufficient for maintaining SPA state (data attribute, ticker, settings link) without hammering the DOM.

5. **Smarter `processFeed()` unmuting logic**:
   - No longer strips `.inleo-muted-post` from ALL elements and re-applies. Instead, only removes the class from posts whose user is no longer in the muted list.
   - Reduces unnecessary DOM writes that triggered the observer.

6. **Scoped profile link queries**:
   - `processFeed()` now queries `main#threads` instead of `document.body` for profile links, reducing the number of elements scanned.

**cyberpunk-v2.css changes:**

1. **`background-attachment: fixed` → `scroll`** (Section 1 — Body):
   - Eliminates full-page repaints on every scroll frame. The radial gradient and scanline patterns are subtle enough that `scroll` behavior is visually indistinguishable from `fixed`.

2. **`body::before` scanline overlay promoted to GPU layer** (Section 2):
   - Added `will-change: transform` and `transform: translateZ(0)` to force the fixed overlay onto its own compositing layer, preventing main-thread paint blocking during scroll.

3. **`backdrop-filter: blur(12px)` removed from sticky headers** (Sections 5, 16):
   - Replaced with `rgba(5, 5, 8, 0.97)` near-opaque solid background. At 97% opacity the visual result is virtually identical to a blur effect, but without the GPU-intensive per-frame compositing cost.

#### Performance Rules Established

- **Rule 13**: Never call `getComputedStyle()` inside a loop that runs on every DOM mutation — use attribute/class checks instead.
- **Rule 14**: Always debounce `MutationObserver` callbacks and guard against re-entrancy when the callback itself modifies the DOM.
- **Rule 15**: Avoid `background-attachment: fixed` — use `scroll` instead. Avoid `backdrop-filter: blur()` on sticky/scrolling elements — use near-opaque solid backgrounds.

---

## Phase 4: Custom Wallet Page (Hive Blockchain Data)

### 4.1 Overview

InLeo's built-in wallet page was broken — it crashed with JavaScript errors and displayed an unusable error overlay. This phase replaces it entirely with a custom wallet that fetches live data from the Hive blockchain and renders it inline within InLeo's existing layout.

**Key Principle**: The wallet swaps only the center content area of InLeo's DOM. Both sidebars (left navigation + market data, right trending tags) remain completely untouched. The result is indistinguishable from a native InLeo page — same scrolling, same responsive behavior, same navigation.

### 4.2 Architecture — DOM Swap (Not Overlay)

After iterating through several approaches (CSS overlay, full-page overlay with cloned sidebars, standalone extension page), the final architecture uses **direct DOM substitution**:

1. **`wallet.js`** runs as a content script alongside `content.js`.
2. When the user clicks the Wallet nav link, a capture-phase click listener intercepts the event before InLeo's Next.js router can handle it.
3. The center `<main>` element (InLeo's feed/content area) is hidden via `display: none`.
4. A new `<div>` with the wallet UI is inserted in its place, inheriting the original element's CSS classes for identical flex/width behavior.
5. When the user clicks any other nav link, the wallet `<div>` is removed and the original `<main>` is restored.

**Why not an overlay?** Fixed overlays created problems: double scrollbars, feed content bleeding through on resize, sidebar measurement fragility, and broken responsive behavior. The DOM swap approach inherits InLeo's layout system naturally.

**Why not a standalone extension page?** Opening `chrome-extension://` URLs in a new tab breaks the seamless experience — the user leaves InLeo's domain, loses the sidebars, and it doesn't feel native.

### 4.3 Click Interception Strategy

```javascript
document.addEventListener('click', (e) => {
    // Walk up to 10 ancestors looking for an <a> tag
    let target = e.target;
    for (let i = 0; i < 10; i++) {
        if (target.tagName === 'A') {
            const href = target.getAttribute('href') || '';
            if (href.includes('/wallet')) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                openWallet();
                return;
            }
            // Close wallet when clicking any other link
            if (_walletActive) {
                closeWallet();
                return; // let InLeo handle navigation
            }
        }
        target = target.parentElement;
    }
}, true); // capture phase — fires before InLeo's router
```

Using **capture phase** (`true`) ensures the handler runs before InLeo's own click handlers. `stopImmediatePropagation()` prevents the Next.js router from processing the wallet link click.

### 4.4 Hive Blockchain API Integration

#### Data Sources
- **Primary node**: `https://api.deathwing.me` (configurable in extension options)
- **Fallback node**: `https://api.hive.blog`
- API calls automatically fall through to the fallback if the primary fails.

#### RPC Methods Used
| Method | Purpose |
|--------|---------|
| `condenser_api.get_accounts` | Account balances, vesting shares, delegations |
| `condenser_api.get_dynamic_global_properties` | Total vesting fund, vesting shares, inflation rate, HBD interest |
| `condenser_api.get_vesting_delegations` | Outgoing delegation list (for Details modal) |

#### Vesting Shares → Hive Power Conversion
```
ownHP = (account.vesting_shares / total_vesting_shares) * total_vesting_fund_hive
delegatedHP = (account.delegated_vesting_shares / tvs) * tvf
receivedHP = (account.received_vesting_shares / tvs) * tvf
effectiveHP = ownHP - delegatedHP + receivedHP
```

#### HP APR Calculation (Range)
The wallet displays HP APR as a range (e.g., `~4.31 - 13.66%`) matching PeakD's format:
```
inflationRate = max(978 - floor(headBlock / 250000), 95) / 10000
newHivePerYear = virtual_supply * inflationRate
stakingAPR = (newHivePerYear * 0.15) / total_vesting_fund * 100    // passive staking
curationAPR = (newHivePerYear * 0.65 * 0.5) / total_vesting_fund * 100  // active curation
```
- **Min** (stakingAPR): Passive HP growth from holding staked HIVE.
- **Max** (stakingAPR + curationAPR): Achievable by voting effectively on posts.

### 4.5 Hive Engine Token Integration

#### Token Balances
Fetched from `https://api.hive-engine.com/rpc/contracts` using the `find` method on `tokens.balances` table.

**Tracked tokens**: LEO, SURGE, LSTR, EDSI, POSH, SWAP.HIVE

#### Token USD Pricing
Market prices are fetched in parallel from Hive Engine's `market.metrics` table, which provides `lastPrice` in HIVE for each token. USD conversion uses the cached HIVE/USD price from the extension's existing CoinGecko market data.

```
tokenUSD = tokenBalance * lastPriceInHive * hiveUsdPrice
```

Each token card displays: token balance, staked amount (if any), and USD value.

### 4.6 Estimated Account Values

Two estimate sections are displayed:

1. **Estimated Account Value** (after HBD section): HIVE-only value
   ```
   (liquid HIVE + savings HIVE + own HP) * HIVE_USD + liquid HBD + savings HBD
   ```

2. **Estimated Total Account Value** (after Hive Engine section): Everything combined
   ```
   hiveAccountValue + sum(each HE token balance * priceInHive * hiveUSD)
   ```

### 4.7 Delegation Details Modal

Clicking "DETAILS" on the Delegated HIVE row opens a modal showing:
- Summary: Own HP, Delegated Out, Received, Effective
- Table of all outgoing delegations with delegatee usernames and HP amounts

The modal uses `position: fixed` with `backdrop-filter: blur(6px)` and closes on backdrop click or X button.

### 4.8 Caching

Wallet data is cached in `chrome.storage.local` with a 5-minute TTL to avoid redundant API calls. The refresh button forces a cache bypass.

```
chrome.storage.local:
  inleo_wallet_data_cache: {
    u: "username",
    d: { ...walletData },
    t: timestamp
  }
```

### 4.9 Styles via `adoptedStyleSheets`

All wallet CSS is injected via `document.adoptedStyleSheets` (same strategy as the theme system), making it immune to InLeo's SPA navigation wiping the `<head>`. The wallet container copies the original center `<main>` element's Tailwind classes to inherit correct sizing.

### 4.10 Files Modified

| File | Change |
|------|--------|
| `wallet.js` | New content script — wallet UI, Hive API, HE tokens, click interception |
| `manifest.json` | Added `wallet.js` to content scripts; added host permissions for `api.deathwing.me`, `api.hive.blog`, `api.hive-engine.com` |
| `content.js` | Stores `currentUser` to `chrome.storage.local` for wallet username detection |
| `options.html` | Added "Wallet Settings" section with Hive API node selector |
| `options.js` | Added Hive API node preference load/save |

### 4.11 Direct URL Navigation

If the user navigates directly to `/username/wallet`, the wallet auto-opens once the DOM is ready. A retry loop waits for the center `<main>` element to exist before activating.

---

## Phase 5: Hivemoji Integration (On-Chain Custom Emoji Rendering)

### 5.1 Overview

Integrate the rendering engine from [Hivemoji](https://github.com/mrtats/Hivemoji) to display custom on-chain emojis within Inleo posts. Hivemoji is a decentralized emoji protocol for the Hive blockchain — users create custom emojis stored as base64 `custom_json` operations, and frontends render `:emojiname:` tokens as inline `<img>` tags. Currently Hivemoji targets hive.blog, peakd.com, and ecency.com. Inleo is **not** supported by the standalone extension, making this a unique feature for Inleo Skin users.

**Scope**: Render-only. Emoji creation/upload remains the responsibility of the standalone Hivemoji extension or its web UI. This integration focuses exclusively on resolving and displaying emojis within the Inleo feed.

### 5.2 Architecture — Render Engine Embedding

The integration follows **Option A (Embed Rendering Engine)** — porting only the emoji resolver and renderer into `content.js`, avoiding any dependency on Hive Keychain or upload logic.

#### Components to Port from Hivemoji:
1. **Emoji Resolver** — Queries `condenser_api.get_account_history` via Hive RPC node to fetch `custom_json` operations containing emoji definitions (both v1 single-op and v2 chunked uploads).
2. **Cache Layer** — In-memory + `chrome.storage.local` persistent cache to avoid redundant RPC calls. Keyed by `@username:emojiname`.
3. **Token Scanner** — Regex-based scanner that finds `:emojiname:` patterns in post text nodes.
4. **Image Renderer** — Replaces matched tokens with inline `<img>` tags using the resolved base64 data URI.

#### Components NOT Ported:
- Upload UI / emoji creation form
- Hive Keychain signing integration
- Popup interface for managing personal emojis
- Any write operations to the blockchain

### 5.3 Integration with Existing Pipeline

The emoji renderer hooks into the existing `processFeed()` MutationObserver pipeline as a new processing step:

```
MutationObserver detects new DOM nodes
        ↓
  processFeed()
        ↓
  ┌─ Step 1: Hide muted user posts
  ├─ Step 2: Apply avatar outlines (self vs. other)
  ├─ Step 3: Inject [ mute ] buttons
  └─ Step 4 (NEW): Scan post text nodes for :emoji: tokens → resolve → render <img>
```

**DOM Targeting**: Post body content on Inleo lives in `<p>` tags and rich-text containers within the feed. The scanner must:
- Target only post body text nodes (not usernames, timestamps, or UI labels).
- Skip already-processed nodes (mark with `data-hivemoji-processed` attribute).
- Operate on `TextNode` splits to preserve surrounding text and inline formatting.

### 5.4 Technical Considerations

#### Hive RPC Calls & Performance
- Inleo's infinite scroll can load dozens of posts per session. Each unique `@user:emoji` pair requires an RPC lookup on first encounter.
- **Mitigation**: Aggressive two-tier caching:
  - **L1 — In-memory Map**: Instant lookup for emojis already resolved in the current session.
  - **L2 — `chrome.storage.local`**: Persistent across sessions with a configurable TTL (e.g., 24 hours). Prevents redundant RPC calls on page reload.
- **Batching**: Collect all unique `@user:emoji` pairs found in a single `processFeed()` cycle, deduplicate, check cache, and fire RPC requests only for cache misses.
- **RPC Endpoint**: Use a public Hive API node (e.g., `https://api.hive.blog`). Consider making this configurable in the popup/options for users running their own nodes.

#### Hivemoji Protocol Versions
- **v1**: Single `custom_json` operation containing the full base64 emoji data.
- **v2**: Chunked upload — emoji data split across multiple `custom_json` operations (supports ~100KB total). The resolver must detect the `hivemoji_v2_chunk` operation ID, collect all chunks in order, and concatenate before rendering.
- Both versions must be handled by the resolver.

#### SPA Resilience
- The emoji renderer inherits the same SPA resilience as the existing mute/avatar features — it runs inside `processFeed()` which is triggered by `MutationObserver` and the 3-second DOM maintenance poller.
- No additional observers or pollers are needed.

### 5.5 User-Facing Feature Toggle

- Add a **"Hivemoji"** checkbox or toggle to `popup.html` alongside the theme selector.
- State stored in `chrome.storage.sync['hivemojiEnabled']` (cloud-synced).
- When disabled, the emoji scanning step is skipped entirely in `processFeed()` — zero performance overhead.
- When enabled, a small emoji indicator (e.g., 🐝) could appear in the price ticker or sidebar to confirm the feature is active.

### 5.6 CSS Styling for Rendered Emojis

Add emoji image styling to `cyberpunk-v2.css` (and future themes):

```css
/* Hivemoji inline emoji images */
img.hivemoji {
    display: inline-block !important;
    height: 1.5em !important;
    width: auto !important;
    vertical-align: middle !important;
    margin: 0 2px !important;
    /* Prevent theme background overrides from affecting emoji transparency */
    background: transparent !important;
    border: none !important;
    border-radius: 0 !important;
}
```

### 5.7 Storage Schema Addition

```
chrome.storage.sync:
  hivemojiEnabled: boolean (default: false)

chrome.storage.local:
  hivemojiCache: {
    "@user:emojiname": {
      data: "data:image/png;base64,...",
      version: 1 | 2,
      cachedAt: timestamp
    },
    ...
  }
```

### 5.8 Licensing & Attribution
- Hivemoji is authored by [@mrtats](https://github.com/mrtats). Confirm license compatibility before embedding resolver code.
- Add attribution in `README.md` and as a code comment in any ported functions.
- If license is restrictive, consider reimplementing the resolver from the [Hivemoji protocol spec](https://github.com/mrtats/Hivemoji) rather than copying source directly.

### 5.9 Open Questions (To Resolve Before Implementation)
1. **Fallback rendering**: If an emoji fails to resolve (deleted, invalid, RPC timeout), should the raw `:emojiname:` token remain visible, or display a placeholder icon?
2. **Emoji size variants**: Should users be able to control emoji display size (small inline vs. large reaction)?
3. **Cache invalidation**: How to handle emoji updates — if a user re-uploads an emoji with the same name, the cache will serve stale data. TTL-based expiry vs. manual cache clear button in options?
4. **Content Security Policy**: Verify that Inleo's CSP headers allow inline base64 `data:image` sources in dynamically created `<img>` tags. If blocked, may need to convert to blob URLs.

### 5.10 Editor Toolbar Cleanup (Done)
**Feature**: Removed three rarely-used buttons from InLeo's text editor toolbar across all pages: **Heading** ("H"), **Italic** ("I"), and **Upload Short** (video icon).

#### Implementation
A new **always-on CSS stylesheet** (`editorTweaksSheet`) is injected at the top of `content.js` via `document.adoptedStyleSheets`, completely independent of the theme system. This ensures the buttons are hidden whether or not a theme is active.

```css
button[aria-label="Heading"] { display: none !important; }
button[aria-label="Italic"] { display: none !important; }
button[aria-label="Upload Short"] { display: none !important; }
```

#### Why CSS Instead of JS DOM Removal?
InLeo uses a Slate.js-based editor powered by React. The toolbar re-renders dynamically — removing DOM nodes via JavaScript would be reversed on the next React reconciliation cycle. CSS `display: none` persists through re-renders with zero performance cost.

#### Why a Separate Adopted Stylesheet?
The existing theme sheet (`currentThemeSheet`) is removed when the user disables their theme (`theme === 'none'`). The editor tweaks sheet is a distinct `CSSStyleSheet` object, so the removal logic (`filter(s => s !== currentThemeSheet)`) does not affect it. The buttons stay hidden at all times.

## Phase 5 Update: Sidebar Cleanup & Layout Stabilization (Delivered Apr 2026)

This phase shipped a focused desktop cleanup pass for the Cyberpunk V2 experience. The goal was not to redesign Inleo globally, but to remove specific product areas the user does not use, keep both desktop side rails visible, and restore a stable sidebar layout after recent upstream UI changes on `inleo.io`.

### 5.11 Targeted Sidebar Simplification

The content script now hides sidebar items by normalized label matching instead of brittle positional selectors or broad wrapper removal.

**Left sidebar items hidden:**
- `LeoDex`
- `Perps`
- `Predict`
- `Auto Vote`
- `HivePro`

**Right rail cards hidden:**
- `Who to Follow`
- `Portfolio`
- `LEO Tokenomics`

#### Implementation details
- Added `LEFT_MENU_ITEMS_TO_HIDE` and `RIGHT_COLUMN_SECTIONS_TO_HIDE` sets in `content.js`.
- Added `normalizeSidebarLabel()`, `getNavItemContainer()`, `findRightRailCardContainer()`, and `markElementHidden()` helpers.
- Added `hideLeftMenuItems()` and `hideRightColumnSections()` so the extension hides only the intended row/card container instead of collapsing an entire sidebar wrapper.
- Added `scheduleSidebarCleanup()` and wired it into both the DOM maintenance poller and the feed `MutationObserver` so the hidden state survives INLEO SPA re-renders.

### 5.12 Safer Desktop Nav Detection

INLEO now renders multiple navigation-like structures on some routes, including wallet-specific layouts and responsive variants. Relying on `document.querySelector('nav')` was no longer safe.

#### Fix
- Added `getSidebarNav()` in `content.js` to prefer the real desktop sidebar nav (`sm:flex` + `hidden`) before falling back to the first `nav`.
- Reused that helper in ticker mounting, settings-link injection, current-user detection, and sidebar cleanup.

This change prevented the extension from mutating the wrong nav container on routes that inject secondary navigation blocks.

### 5.13 Market Data Placement After Publish

The `Market Data` block was updated so it appears directly after the `Publish` control without moving `Publish` to the top of the sidebar.

#### Root cause
INLEO uses two different desktop sidebar layouts:
1. `Publish` can live inside the main nav flow.
2. `Publish` can render as its own sibling block below the nav.

Earlier ticker mounting logic inserted after the sidebar wrapper, which left `Market Data` too low. An intermediate attempt also over-corrected and moved `Publish` upward, which was not desired.

#### Final fix
- Added `findPublishContainer(nav)` to detect both desktop sidebar variants.
- Added `mountPriceTicker(ticker, nav)` to:
  - place `Market Data` directly after the in-nav publish row when `Publish` is inside the nav
  - place `Market Data` directly after the lower publish block when `Publish` is rendered outside the nav
- Updated the maintenance poller to remount the ticker in place after SPA updates.
- Tightened ticker spacing in `themes/cyberpunk-v2.css` so it sits cleanly under `Publish`.

### 5.14 Route-Scoped Articles Dropdown CSS

Some broad Cyberpunk V2 dropdown layout overrides were originally intended only for the articles page, but they were being applied site-wide.

#### Fix
- Added `updatePageContext()` in `content.js`.
- Added `body.inleo-articles-page` and `body.inleo-wallet-page` state classes derived from `window.location.pathname`.
- Scoped the "ARTICLES PAGE" filter/dropdown layout rules in `themes/cyberpunk-v2.css` to `body.inleo-articles-page`.

This keeps article-filter layout fixes active on `/posts` while reducing the risk of collateral breakage on `/threads` and other routes.

### 5.15 Live Verification & Findings

All Phase 5 UI changes were rechecked in **full Google Chrome** at desktop resolution with the unpacked extension loaded.

#### Verified working
- Left desktop sidebar remains visible.
- Only the requested left items are hidden.
- Right desktop rail remains visible.
- Only the requested right-rail cards are hidden.
- `Market Data` appears directly after `Publish`.

#### Investigations completed
- The `Your Lists` dropdown was tested with the extension active, with the theme set to `none`, and with the extension fully disabled. The menu still failed to render when the extension was disabled, so that issue was classified as **upstream INLEO behavior**, not an extension regression.
- The route `https://inleo.io/threads/skiptvads:justme` was tested with the extension enabled and disabled. The page completed loading in both states with a single main-frame navigation, so the observed "reload forever" symptom could not be reproduced as an extension-caused loop.

#### Ongoing constraint
- This extension still depends on INLEO's current text labels and DOM shapes. If the site renames sidebar labels or changes card wrappers again, the matching strings in `content.js` will need to be updated.

---

## Future Phases

- **Performance**: Monitor the performance impact of high-specificity CSS selectors and the `MutationObserver` on extremely long threads.
- **Maintenance**: Regular updates to CSS selectors will be required if `inleo.io` fundamentally changes its DOM structure or Tailwind configuration.
- **New Themes**: Use `cyberpunk-v2.css` as the reference template. Copy the entire nav section (sections 6–6d) as a starting point and modify only colors/fonts.
