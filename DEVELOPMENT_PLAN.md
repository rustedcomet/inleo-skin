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

## Phase 5: Sidebar Cleanup & Layout Stabilization (Delivered Apr 2026)

This phase shipped a focused desktop cleanup pass for the Cyberpunk V2 experience. The goal was not to redesign Inleo globally, but to remove specific product areas the user does not use, keep both desktop side rails visible, and restore a stable sidebar layout after recent upstream UI changes on `inleo.io`.

### 5.1 Targeted Sidebar Simplification

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

### 5.2 Safer Desktop Nav Detection

INLEO now renders multiple navigation-like structures on some routes, including wallet-specific layouts and responsive variants. Relying on `document.querySelector('nav')` was no longer safe.

#### Fix
- Added `getSidebarNav()` in `content.js` to prefer the real desktop sidebar nav (`sm:flex` + `hidden`) before falling back to the first `nav`.
- Reused that helper in ticker mounting, settings-link injection, current-user detection, and sidebar cleanup.

This change prevented the extension from mutating the wrong nav container on routes that inject secondary navigation blocks.

### 5.3 Market Data Placement After Publish

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

### 5.4 Route-Scoped Articles Dropdown CSS

Some broad Cyberpunk V2 dropdown layout overrides were originally intended only for the articles page, but they were being applied site-wide.

#### Fix
- Added `updatePageContext()` in `content.js`.
- Added `body.inleo-articles-page` and `body.inleo-wallet-page` state classes derived from `window.location.pathname`.
- Scoped the "ARTICLES PAGE" filter/dropdown layout rules in `themes/cyberpunk-v2.css` to `body.inleo-articles-page`.

This keeps article-filter layout fixes active on `/posts` while reducing the risk of collateral breakage on `/threads` and other routes.

### 5.5 Live Verification & Findings

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

## Phase 6 — Codebase Stabilization, Modular Refactor, Composer Assistant, and Additional Skins

Phase 6 is a **stabilization + expansion** phase. The extension has outgrown its original "small theme extension" file structure and now bundles theme loading, SPA stylesheet persistence, editor tweaks, market ticker, settings injection, user detection, a mute system, avatar styling, wallet route interception, a full wallet subsystem (RPC + Hive Engine + caching + rendering), modal handling, and an options UI — almost all of which lives inside two monolithic runtime scripts (`content.js` and `wallet.js`).

This phase has three tracks:

1. **Stabilize & modularize** the existing product without changing its behavior.
2. **Ship the first creator-side utility**: a composer hashtag assistant.
3. **Grow the skin library** with two additional themes (Gday, Gday v2).

> The full product-review write-up that motivates this phase is preserved in `debug/PHASE6.md`. This section is the authoritative implementation plan for the repo.

**Current repo status (Phase 6 snapshot):**
- The repo now contains the `core/`, `features/`, `wallet/`, `styles/`, `data/`, and additional `themes/` structure described in this phase.
- `content.js` is currently a thin bootstrap that wires together theme application, route subscriptions, the 3-second SPA watchdog, and `muteFeed` startup / re-attach behavior.
- `features/muteFeed.js` now handles both user muting and phrase muting (`mutedPhrases` in `chrome.storage.sync`), including hiding command-style threads such as `/rafiki spin` without muting the posting account.

### 6.1 Architecture Review — What Phase 6 Set Out To Fix

**`content.js` was doing too many unrelated jobs.** Before the refactor it combined:
- theme application + `adoptedStyleSheets` persistence
- `@import`-stripped font link injection
- CoinGecko market-ticker fetching, rendering, and placement
- DOM maintenance polling (3s heartbeat)
- settings-link injection after Profile
- muted-user storage sync
- feed processing + mute button injection
- popup / hover-card detection
- avatar self/other highlighting
- MutationObserver lifecycle + fallback re-attach
- editor toolbar CSS tweaks

**`wallet.js` was a full subsystem** (route interception, lifecycle, inline CSS template, HTML render, RPC client, cache access, account data transformation, Hive Engine token retrieval, totals math, modal, direct-route bootstrap).

**Other drift that Phase 6 targeted:**
- `popup.html` still shows `v1.0` while `manifest.json` is `1.1`
- `README.md` still reads like a theme-only extension
- storage usage is split between `chrome.storage.sync` and `chrome.storage.local` with no central schema
- wallet cache is a single key — it overwrites when viewing a different user
- wallet CSS is a giant template string inside `wallet.js`
- route handling relies on click interception + initial path check, with no explicit controller

### 6.2 Goal A — Clean Up Without Changing Product Identity

Preserve existing behavior while making the code safe to extend.

**Target structure:**

```text
inleo-skin/
  manifest.json
  background.js
  popup.html / popup.js / popup.css
  options.html / options.js

  core/
    state.js          # shared mutable state (currentThemeSheet, currentUser, etc.)
    storage.js        # STORAGE_KEYS + DEFAULTS + TTLs
    utils.js          # normalizeSidebarLabel, getNavItemContainer, etc.
    logger.js         # DEBUG flag + `log(scope, ...args)`
    scheduler.js      # scheduleProcessFeed + scheduleSidebarCleanup
    routeController.js # SPA route change detection + subscriber pattern

  features/
    slateBridge.js    # Main-world bridge for Slate.js editor access (world: "MAIN")
    theme.js          # applyTheme + adoptedStyleSheets lifecycle
    editorTweaks.js   # hide Heading / Italic / Upload Short
    marketTicker.js   # ticker injection + CoinGecko fetch + 30-min cache
    currentUser.js    # detects logged-in username from sidebar Profile link
    settingsLink.js   # inject Settings after Profile
    sidebarCleanup.js # hides unwanted left-nav and right-rail items
    muteFeed.js       # mutedUsers + mutedPhrases + processFeed + injectMuteButton + observer lifecycle
    avatarMarkers.js  # self/other avatar classes
    composerHashtags.js   # hashtag suggestion strip (SwiftKey-style)

  wallet/
    walletRoute.js    # explicit route controller (pushState/replaceState/popstate)
    walletApi.js      # Hive RPC client + Hive Engine fetch helpers
    walletCache.js    # per-user cache map with LRU cap of 10
    walletView.js     # wallet HTML template + mount/unmount
    walletRender.js   # data binding (renderAccount, renderHiveEngineTokens)
    walletModal.js    # delegation details modal
    walletStyles.js   # lazy-loads styles/wallet.css

  styles/
    wallet.css        # externalized wallet CSS

  data/
    hashtagEntities.js    # entity-to-tag map (Hive, crypto, movies, entertainment, etc.)
    hashtagRules.js       # scoring engine: entity sweep + word extraction + weights

  themes/
    cyberpunk-v2.css
    gday.css              # NEW — Ethereal Terminal
    gday-v2.css           # NEW — Surveillance OS
```

**Manifest cleanup:** `manifest.json` loads scripts in two content-script entries:

1. **Main-world bridge** (`world: "MAIN"`, `run_at: "document_start"`):
   - `features/slateBridge.js` — runs in the page's JS context so it can access React/Slate internals

2. **Isolated-world content scripts** (default world, `run_at: "document_start"`):
   - `core/` → `data/` → `features/` → `wallet.js` → `wallet/` → `content.js` (bootstrap, loaded last)

ES modules are not used; plain IIFE files ordered by the manifest are the convention.

**Central storage schema** (single source of truth, matching `core/storage.js`):

```js
const SYNC_KEYS = {
  activeTheme: 'activeTheme',
  hiveApiNode: 'hiveApiNode',
  hashtagSettings: 'hashtagSettings',
  mutedPhrases: 'mutedPhrases'
};

const LOCAL_KEYS = {
  mutedUsers: 'mutedUsers',
  currentUser: 'inleo_current_user',
  marketCache: 'inleo_market_data_cache',
  walletCache: 'inleo_wallet_data_cache_v2',
  walletCacheLegacy: 'inleo_wallet_data_cache'
};

const DEFAULTS = {
  activeTheme: 'none',
  hiveApiNode: 'https://api.deathwing.me',
  hashtagSettings: {
    enabled: true,
    maxTags: 5,
    alwaysInclude: ['leofinance'],
    blockedTags: []
  },
  mutedUsers: [],
  mutedPhrases: ['/rafiki']
};
```

In the current implementation, `mutedUsers` stays in local storage while `mutedPhrases` lives in sync storage, so phrase-based hiding such as `/rafiki` command filtering follows the user's Chrome profile without fully muting the author.

**Route & async safety (wallet):**
- add a small route controller watching `pushState`, `replaceState`, `popstate`, and a pathname fallback
- add a render-token pattern so stale async wallet responses are discarded when the user has since navigated to another account

**Wallet cache upgrade:** migrate from one cache object to a per-user map keyed by username. Account-switching then feels cached and clean instead of overwriting a single slot.

**Wallet CSS externalization:** move the `wallet.js` CSS template string into `styles/wallet.css`. Load it through `adoptedStyleSheets` for the same SPA resilience as theme CSS.

**Documentation & UI refresh:**
- bump popup version label from `v1.0` to match `manifest.json`
- align popup + options copy with the current product (theme + wallet + hashtag assistant)
- update `README.md` to describe the full product
- add a short architecture section describing the new module layout

**Lightweight guardrails:**

```js
const DEBUG = false;
function log(scope, ...args) {
  if (DEBUG) console.log(`[Inleo Skins:${scope}]`, ...args);
}
```

Plus idempotent DOM injection checks and clear subsystem boundaries.

### 6.3 Goal B — Composer Hashtag Assistant (v2 — SwiftKey-Style Suggestion Strip)

Turn the extension into the start of a creator-side toolkit. Suggestions only — **no auto-insert, no auto-post, no external AI**.

> **Design analogy:** Microsoft SwiftKey's word suggestion strip — a compact, single-row bar that sits between the input area and the toolbar. Tags never enter the post unless the user explicitly clicks them.

**Scope:** Threads composer only (the short-post editor on the home feed). The `/publish` long-form article editor is **out of scope** for v1 to keep detection simple and prevent accidental side-effects.

**Strip placement:**
- The suggestion strip renders **between the contenteditable text area and the formatting toolbar** (B / I / quote / image buttons).
- It is a single row with `overflow: hidden` — tags that don't fit are simply not shown. No wrapping, no scrolling.

**Strip layout:**
- **Left section**: always-include tags (configured in Options, e.g. `SKIPTVADSTHREAD`). These appear from the moment the composer mounts, before the user types anything.
- **Small gap** (visual separator, not a divider line).
- **Right section**: contextual suggestions generated by the rule-based scoring engine as the user types.

**Chip behavior — click to append:**
- Clicking a chip **appends** `#TAG` to the **very end** of the post text, regardless of cursor position.
- **Comma separation**: the first hashtag is appended with a space (` #TAG`); subsequent hashtags are separated by ` , ` (e.g. `#MOVIESONLEO , #SKIPTVADSTHREAD , #REVIEW`).
- The chip **disappears** from the strip immediately after click (not greyed out, not struck-through — fully removed).
- The user can continue typing normally; the appended tag sits at the end.

**Casing:**
- All tags render in **UPPERCASE** in both the chip and the appended text (e.g. `#SKIPTVADSTHREAD`, `#MOVIESONLEO`, `#BITCOIN`).
- The composer text input itself respects the user's keyboard — no forced uppercase on typed text (even in Gday v2 which uses uppercase globally, the `markdown-editor` is explicitly exempted).

**Dedupe — strip reflects what's NOT in the text:**
- If a tag is already present in the post body (whether appended by click or typed manually by the user), it does **not** appear in the strip.
- If the user **backspaces/deletes** a previously appended tag from the text, the tag **reappears** in the strip.
- The strip is a live mirror: it always shows tags that are relevant but not yet in the post.

**Post/reset:**
- After publishing a thread (or when the composer is cleared/re-mounted by Inleo), the strip fully resets: always-include tags reappear, contextual suggestions clear.

**Empty state:**
- When there are zero suggestions (no always-include tags remaining, no contextual matches), the strip **hides entirely** — no placeholder, no "keep typing" text, no visual clutter.

**Theming:**
- The strip adapts to the active skin: cyan chips on Cyberpunk V2, purple on Gday, orange on Gday v2, neutral/default when no theme is active.

**Example flow:**

1. User opens composer. Strip shows: `#LEOFINANCE` (always-include, left side).
2. User types: `my last movie review`. Strip updates: `#LEOFINANCE` | gap | `#MOVIESONLEO` `#REVIEW` `#MOVIE` (entity matches + word extraction).
3. User clicks `#LEOFINANCE`. Text becomes: `my last movie review #LEOFINANCE`. Strip updates: remaining chips (`LEOFINANCE` gone).
4. User clicks `#MOVIESONLEO`. Text becomes: `my last movie review #LEOFINANCE , #MOVIESONLEO`. Strip updates accordingly.
5. User clicks `#REVIEW`. Text becomes: `my last movie review #LEOFINANCE , #MOVIESONLEO , #REVIEW`. Note the comma separation between hashtags.
6. User keeps typing: appends ` it was about bitcoin`. Strip reappears: `#BITCOIN` | `#CRYPTO` | `#BTC`.
7. User deletes `#REVIEW` from text by backspacing. Strip updates: `#REVIEW` reappears alongside the bitcoin-related chips.

**Scoring engine** (`data/hashtagRules.js`) — two-layer system:

*Layer 1 — Entity matching (high priority):*
- Deterministic, local, rule-based. No AI, no network.
- Entity map in `data/hashtagEntities.js` maps mentions to candidate tags (Hive ecosystem, crypto majors, movies/film/TV, books, podcasts, content genres).
- Per-entity weight: primary tag = 10pts, secondary = 4pts, tertiary = 2pts.
- Occurrences capped at 4 per entity to prevent spam skewing.
- Explicit `#tag` in text = 25pt bonus (but since it's in the text, it's deduped out of the strip).
- Always-include tags scored at 10pts with source `"pinned"`.
- Blocked tags (from Options) dropped entirely before ranking.

*Layer 2 — Word extraction (lower priority):*
- Tokenizes the post text and extracts significant words (3+ characters) as potential hashtag suggestions.
- Filters out English stop words (~150 common words like "the", "and", "about", "just", etc.) and pure numbers.
- Words already matched by entity scoring are skipped (no duplicates).
- Weight: 3pts per word (much lower than entity matches, so curated entities always rank higher).
- Capped at 8 word-extracted tags per post.
- Examples: typing "Matrix" suggests `#matrix`, typing "cinema" suggests `#cinema`, typing "resistance" suggests `#resistance`.
- This layer ensures the strip always has something useful to suggest, even for niche topics not in the entity map.

**Slate.js bridge architecture** (`features/slateBridge.js`):

Inleo's threads composer uses **Slate.js**, not a plain contenteditable. Slate maintains its own internal document model — DOM mutations (e.g. `document.execCommand`) are overwritten on the next React re-render and are not included when the post is published. The extension must use Slate's API (`editor.insertText()`) to modify the post text.

The challenge: content scripts run in Chrome's **isolated world** and cannot access React fiber properties (`__reactFiber*`) or Slate editor instances on DOM elements — those exist only in the **page's main world**.

Solution: a two-script bridge pattern:
1. `features/slateBridge.js` is loaded with `world: "MAIN"` in the manifest. It runs in the page's JS context, can access React internals, and listens for commands via `window.postMessage`.
2. `features/composerHashtags.js` (isolated world) sends commands like `{ type: "inleo-slate-request", cmd: "insertText", selector: "...", text: "..." }` via `window.postMessage` and receives responses on `{ type: "inleo-slate-response", ... }`.
3. Each request carries a unique `reqId` for response matching. A 500ms timeout falls back to `execCommand` if the bridge is unreachable.

Supported bridge commands:
- `getText` — reads the full text from Slate's internal model (source of truth for dedupe)
- `insertText` — moves Slate's selection to the document end and calls `editor.insertText()`, which updates the model + React state + DOM atomically

This architecture ensures appended hashtags:
- Survive React re-renders ✓
- Appear in the prose preview (Slate → React → render) ✓
- Are included when the post is published ✓
- Can be deleted by the user with normal backspace ✓

**Composer detection:**
- Targets `main [contenteditable="true"]` with class `markdown-editor` and `data-slate-editor` attribute (Inleo's threads composer).
- Width >= 200px required (filters search boxes).
- Height check relaxed for `markdown-editor` elements (Inleo's composer starts at ~24px tall).
- Excludes popups, tooltips, nav elements.
- Uses `data-slate-editor-id` attribute as a unique selector for bridge communication.

**SPA resilience:**
- Re-scans for new composers on every route change via `NS.route.subscribe`.
- A 2-second deadman-check per attached composer detects DOM removal and cleans up.
- If the strip is wiped by a React re-render, the deadman check re-inserts it.
- The prose preview sibling is watched via `MutationObserver` as a secondary change signal (Slate/React updates it when the model changes).
- No persistent MutationObserver for composer detection — periodic rescan is cheaper and more predictable.

**Settings (in `options.html` / `options.js`, persisted via `STORAGE_KEYS.hashtagSettings`):**
- Enable/disable hashtag suggestions (default: enabled)
- Max suggested tags per strip (default: 5, range: 1–15)
- Always-include tag list (comma-separated, default: `leofinance`)
- Blocked tag list (comma-separated, default: empty)

**Data files:**
- `data/hashtagEntities.js` — hand-curated entity-to-tag map (Hive ecosystem, crypto majors, movies/film/TV, books, podcasts, content genres)
- `data/hashtagRules.js` — two-layer scoring engine: entity sweep + word extraction, weight fan-out, stop-word filtering, always-include/blocked filtering, sorted output

**Feature files:**
- `features/slateBridge.js` — main-world bridge for Slate.js access (React fiber traversal, `getText`, `insertText`)
- `features/composerHashtags.js` — composer detection, strip DOM construction, chip rendering, click-to-append via Slate bridge, comma-separated formatting, live dedupe from Slate model, theming, SPA lifecycle

**Edge cases explicitly handled:**
- Tag already in draft (typed or appended) → hidden from strip (dedupe reads from Slate model)
- Deleted tag → reappears in strip (Slate model change triggers recompute via input event + prose observer)
- Multiple suggestions mapping to same tag → deduped by scoring engine
- Composer re-mounted by SPA → strip re-attaches via deadman check
- Strip wiped by React re-render → deadman check re-inserts it
- Empty text with always-include → strip shows only pinned tags
- All tags used → strip hides entirely (`data-empty="1"` → `display: none`)
- Rapid typing → 400ms debounce prevents excessive recalculation
- Slate bridge unavailable → graceful fallback to `execCommand`
- Bridge timeout (500ms) → resolves with error, falls back silently
- Word-extracted tags that overlap with entity-matched tags → skipped (no duplicates)
- Niche topics not in entity map → word extraction ensures useful suggestions
- First hashtag vs. subsequent → automatic comma separator detection via regex

### 6.3b Content-Based Phrase Filtering (Muted Phrases)

A companion to the user-mute system. Users can define text patterns (one per line) that hide matching posts **without muting the posting account**. The primary use case: Inleo's `/rafiki spin` game command floods the feed with low-value threads from otherwise-followed users.

**Design decision — phrase filter vs. user mute:**
- User mute hides **all** posts from an account (class `.inleo-muted-post`, stored in `chrome.storage.local`).
- Phrase mute hides only **matching** posts (class `.inleo-phrase-muted`, stored in `chrome.storage.sync` so it follows the Chrome profile).
- Both systems coexist in `features/muteFeed.js`. User-muted posts take priority — if a post is already hidden by user mute, phrase matching is skipped for that row.

**Architecture (`features/muteFeed.js`):**

The file was refactored with extracted helper functions for clarity and reuse:

| Helper | Purpose |
|--------|---------|
| `getPrimaryProfileLinks(feedArea)` | Returns `a[href^="/profile/"]` links filtered to bold name links only (no avatars, no @mentions, no popup cards) |
| `getUsernameFromLink(link)` | Extracts lowercase username from a profile link's `href` |
| `getPostOuterWrapper(link)` | Walks up the DOM from a profile link to find the outermost thread row container (`.relative.min-h-px` or `cursor-pointer` parent) |

The `processFeed()` function runs five steps in order:

1. **Unhide** — removes `.inleo-muted-post` from posts whose user is no longer in the muted list.
2. **Orphan cleanup** — removes stale mute buttons without wrappers (leftover from React reconciliation).
3. **User muting pass** — walks profile links, hides muted users (`classList.add('inleo-muted-post')`), injects `[ mute ]` buttons for non-muted users.
4. **Phrase filtering pass** — iterates the same profile links with a `seenPhraseTargets` Set to dedupe. For each unique thread row:
   - Skips posts already hidden by user mute.
   - Reads `outer.textContent` (full thread row text, not just `<p>` body) so command-only posts like `/rafiki spin` are detected even if Inleo changes its body markup.
   - Compares against `mutedPhrases` array (all lowercased). If any phrase matches, adds `.inleo-phrase-muted`.
   - If no phrase matches, removes `.inleo-phrase-muted` (handles phrase list edits).
   - When the phrase list is empty, clears all stale `.inleo-phrase-muted` classes.
5. **Avatar markers** — piggy-backs on the same feed tick to avoid an extra full-page scan.

**Base CSS injection:**

`muteFeed.js` creates a `CSSStyleSheet` via `document.adoptedStyleSheets` to guarantee hiding works even when no theme is active:

```css
.inleo-muted-post,
.inleo-phrase-muted {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
}
```

This is SPA-safe — `adoptedStyleSheets` survive React re-renders and SPA navigation.

**Theme CSS updates:**

All three themes (`cyberpunk-v2.css`, `gday.css`, `gday-v2.css`) include `.inleo-phrase-muted` alongside `.inleo-muted-post` in their hide rules for redundancy.

**Storage & live sync:**

- `mutedPhrases` defaults to `['/rafiki']` and lives in `chrome.storage.sync` (key documented in `core/storage.js`).
- `loadInitial()` waits for both `mutedUsers` (local) and `mutedPhrases` (sync) to load before the first `processFeed()` call (barrier pattern with `pendingLoads` counter).
- `chrome.storage.onChanged` listener watches both areas: `mutedUsers` changes in `local`, `mutedPhrases` changes in `sync` — each triggers an immediate `processFeed()` via the scheduler.
- This means edits in the Options page take effect instantly in the feed without requiring a page reload.

**Options UI (`options.html` / `options.js`):**

- Added a "Muted Phrases" section between "Muted Users" and "Wallet Settings".
- A `<textarea>` accepts one phrase per line (e.g. `/rafiki` on line 1, `another phrase` on line 2).
- Hint text explains the behavior: *"Hide posts containing these phrases — one per line. The user is NOT muted, just the matching post. Case-insensitive."*
- Auto-saves with a 400ms debounce on `input` / `change` events.
- Phrases are lowercased, trimmed, and empty lines are filtered before persisting.
- A "Saved" indicator flashes briefly after each save.

**MutationObserver integration:**

The feed observer in `muteFeed.js` triggers `processFeed()` (via the scheduler, 150ms debounce) on any relevant DOM mutation. It ignores:
- Its own mutations (re-entrancy guard via `state._isProcessingFeed`)
- Text-only nodes (`nodeType !== 1`)
- Wrapper elements it created (`.inleo-mute-wrapper`)

The observer also triggers `sidebarCleanup` for the sidebar hiding feature on the same mutation.

### 6.4 Goal C — New Skins: Gday and Gday v2

Two new themes landing in this phase, both running on the same Cyberpunk V2 infrastructure (CSS file under `themes/`, `:root[data-inleo-skin="..."]` scope, `adoptedStyleSheets` persistence, SPA resilience via `applyTheme`).

#### Gday — "Ethereal Terminal" / Neon-Minimalist HUD

Source: `debug/inleo_gday/` (design system documented in `DESIGN.md`).

- **Palette:** deep blue surface (`#0d1321`) punctuated by neon purple `#ecb2ff` + hard cyan `#00dbe9`, purple-container `#bd00ff`
- **Typography:** `Space Grotesk` for headlines/labels (uppercase, letter-spacing `0.05rem`), `Inter` for body. Numerical data uses `tabular-nums`.
- **Surface logic:** tonal shifts between `surface` → `surface-container-low` → `surface-container-highest`. Boundaries are **hairline accents**, never 1px solid borders. Glassmorphism (60% opacity + `backdrop-filter: blur(12px)`) on floating elements.
- **Accents:** single corner-bracket in the **top-right** of cards using a thin primary hairline (the "HUD projection" effect from `DESIGN.md`).
- **No rounded corners anywhere.**
- **Composer emphasis:** a 2px left border in primary + TR corner bracket, matching the "Initialize Thread" composer in `inleo_gday/code.html`.
- **Logo:** replaced with a `Material Symbols` `hub` glyph + `NEURAL_LINK` wordmark in primary.
- **Ticker:** restyled as a `DATA_HUD` block — subtle hairline left border + TR corner accent.

#### Gday v2 — Industrial Surveillance OS

Source: `debug/inleo_gday2/`.

- **Palette:** near-black base (`#0a0a0a` body, `#121212` panel, `#1a1a1b` gritty grey), **industrial orange** `#d35400` primary, **industrial red** `#922b21` as alarm/mute accent
- **Typography:** `Black Ops One` stencil for headlines/brand, `Barlow Condensed` for everything else. Body text is globally `text-transform: uppercase` for the HUD feel, with post-body `<p>` kept mixed-case for readability.
- **Surface logic:** hard rectangular cards with thin 1px hairlines and a gritty near-black interior. No glassmorphism — this theme is grainy and industrial, not ethereal.
- **Accents:** corner brackets at **top-left AND bottom-right** of every card in primary orange. Scanline + grain overlay on `body::before` for a CCTV-feed feel.
- **Hover:** primary buttons invert to solid orange background + black text.
- **No rounded corners anywhere.**
- **Logo:** `Material Symbols` `radar` glyph + `SEC_NODE_01` stencil wordmark.
- **Ticker:** restyled as a `SYS_REPORT` block — hard left orange border, stencil title, tabular numerics.

#### Integration details (shared by both skins)

- Registered in the popup dropdown (`popup.html`) as **"Gday"** (`gday`) and **"Gday v2"** (`gday-v2`).
- Themes consume the existing `applyTheme` pipeline — no new loading code, no new permissions, no bundler.
- `content.js` defines a `TICKER_THEMES` set (`cyberpunk-v2`, `gday`, `gday-v2`) so the sidebar Market Data ticker is opt-in per theme. Each theme's CSS restyles `#cyber-price-ticker` to match its aesthetic (neon HUD for Gday, stencil `SYS_REPORT` for Gday v2).
- `setInterval` SPA-persistence watchdog and the initial `applyTheme` call both route through `themeUsesTicker()` so switching between themes reliably tears the ticker down and rebuilds it.
- All sidebar hiding, article-filter layout fixes, publish dropdown styling, mute button styling, avatar self/other outlines, radix dropdown fixes, and `body.inleo-wallet-page` / `body.inleo-articles-page` scoped rules from Cyberpunk V2 are carried across into both new themes so feature parity is maintained.

### 6.5 Recommended Implementation Order

1. **Cleanup foundation** — create `core/` + `features/`, centralize storage keys/defaults, split `content.js`, split `wallet.js`, move wallet CSS into `styles/wallet.css`, keep behavior unchanged.
2. **Reliability pass** — wallet route controller, stale-request guards, per-user wallet cache, popup/options/docs alignment.
3. **Composer assistant v1** — detect composer, parse content, score hashtags, render chips, insert tags.
4. **Settings integration** — wire hashtag options into `options.html`, persist under central schema, support always-on + blocked lists.
5. **Skin expansion** — `themes/gday.css` + `themes/gday-v2.css`, register in `popup.html`, extend `TICKER_THEMES` so both participate in the ticker lifecycle.
6. **Feed filtering** — phrase-based content filtering (`mutedPhrases`) in `muteFeed.js`, Options UI for phrase management, live sync via `chrome.storage.onChanged`.
7. **Final polish** — insertion dedupe, SPA-resilience validation, cross-route / editor-rerender testing.

### 6.6 Definition of Done

**Refactor / cleanup**
- `content.js` is no longer a single monolith
- `wallet.js` is split into logical modules
- wallet CSS is externalized to `styles/wallet.css`
- storage keys/defaults are centralized
- popup/options/docs are aligned with the current product
- wallet routing is more explicit and safer under async changes

**Mute / phrase filtering**
- `features/muteFeed.js` owns both user muting and phrase muting
- `mutedUsers` load from local storage and `mutedPhrases` load from sync storage before the first feed pass runs
- phrase muting hides matching thread rows without muting the posting user
- phrase matching uses the resolved thread row text, so command posts like `/rafiki spin` are hidden even if Inleo changes the internal body markup away from simple `<p>` tags
- removing muted phrases clears any stale `.inleo-phrase-muted` classes on previously hidden posts

**Hashtag assistant (v2 — SwiftKey-style strip)**
- suggestion strip renders between the text area and the toolbar (not below the composer)
- always-include tags appear on the left; contextual suggestions on the right with a visual gap
- strip is a single row with overflow hidden — no wrapping, no scrolling
- all tags render in UPPERCASE (chips and appended text)
- clicking a chip appends `#TAG` to the end of the post text and removes the chip from the strip
- hashtags are comma-separated when multiple are appended (e.g. `#MOVIESONLEO , #REVIEW , #BITCOIN`)
- text insertion uses Slate.js API via main-world bridge — tags persist through React re-renders and are included in published posts
- the Slate bridge (`slateBridge.js`) runs in `world: "MAIN"` and communicates via `window.postMessage`
- `recompute()` reads text from Slate's internal model (source of truth), not from DOM `innerText`
- tags already in the post body (typed or appended) are hidden from the strip (live dedupe from Slate model)
- deleting a tag from the text causes it to reappear in the strip
- publishing or clearing the composer fully resets the strip
- strip hides entirely when no suggestions remain
- strip adapts to the active theme (cyberpunk cyan, gday purple, gday-v2 orange, default neutral)
- scoped to the threads composer only (not the /publish long-form editor)
- two-layer suggestion system: entity matches (high priority) + word extraction from typed text (lower priority)
- word extraction filters stop words, pure numbers, and words already covered by entities
- suggestions update while typing (400ms debounce)
- `#LEOFINANCE` (and other always-include tags) can be configured via Options
- entity/topic tags generated by deterministic, local rules — no AI, no network
- feature survives Inleo SPA re-renders and composer re-mounts

**Theme fixes**
- Gday v2 composer editor exempted from global `text-transform: uppercase` — user's typing respects their keyboard
- Prose preview and post body paragraphs also exempted from uppercase in Gday v2

**Skins**
- Gday and Gday v2 are selectable from the popup dropdown
- both themes load via the existing `adoptedStyleSheets` pipeline
- both themes honor the data-attribute `:root[data-inleo-skin="..."]` scoping
- the market ticker renders for both themes (via `TICKER_THEMES`) and is styled consistently with each theme
- all Cyberpunk V2 behavioral CSS (sidebar hides, article layout, publish dropdown, mute, wallet-page scoping, avatar outlines) has parity in both new themes

### 6.7 Non-Goals for Phase 6

These are explicitly out of scope for this phase unless time remains after Definition of Done:

- AI-based hashtag generation
- automatic posting
- full writing assistant (tone, grammar, rewrites)
- sentiment analysis
- server-side syncing
- analytics dashboard
- major wallet redesign beyond structural cleanup

### 6.8 Implementation Rules (Notes for Future Work)

When continuing Phase 6 work:

1. **Do not rewrite the whole extension from scratch.** Preserve working behavior; refactor incrementally.
2. **Keep runtime logic modular** — each feature should expose an `init()` or similarly clear entry point.
3. **Prefer deterministic logic for hashtags** — no AI dependency in Phase 6.
4. **Do not silently auto-insert hashtags** — suggestions must be user-controlled.
5. **Avoid introducing bundlers unless truly necessary** — plain Chrome extension files are fine.
6. **Keep all DOM injections idempotent** — no duplicate chips, duplicate containers, or duplicate listeners.
7. **Preserve SPA resilience** — any new feature must survive route and DOM re-render behavior on Inleo.

---

## Future Phases

- **Performance**: Monitor the performance impact of high-specificity CSS selectors and the `MutationObserver` on extremely long threads.
- **Maintenance**: Regular updates to CSS selectors will be required if `inleo.io` fundamentally changes its DOM structure or Tailwind configuration.
- **New Themes**: Use `cyberpunk-v2.css` as the reference template. Copy the entire nav section (sections 6–6d) as a starting point and modify only colors/fonts. `themes/gday.css` and `themes/gday-v2.css` are working examples of this approach.
