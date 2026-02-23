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

## Future Phases

- **Phase 2 Pipeline**: Potential addition of user-customizable CSS variables (custom accent colors) via the popup UI.
- **Performance**: Monitor the performance impact of high-specificity CSS selectors on extremely long threads.
- **Maintenance**: Regular updates to CSS selectors will be required if `inleo.io` fundamentally changes its DOM structure or Tailwind configuration.
