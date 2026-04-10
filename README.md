# Inleo Skin Extension

A browser extension that instantly transforms the look and feel of `inleo.io` with custom CSS themes. Currently featuring the highly polished **Cyberpunk V2** aesthetic.

## Features

- **Instant Theme Switching**: Apply themes directly from the extension popup without refreshing the page.
- **Cyberpunk V2 Theme**: A complete visual overhaul inspired by dark, neon-lit aesthetics.
  - Solid dark panels with cyan and red corner brackets.
  - Desktop sidebar cleanup that hides only selected distractions instead of removing whole columns.
  - Reorganized layout prioritizing your profile, notifications, core content, and a dedicated Settings link.
  - `Market Data` sits directly under `Publish` in the desktop sidebar.
  - Color-coded avatar outlines (cyan for your own posts, red for others) leveraging direct span ID targeting.
  - Replaced site logos with custom glitch-art branding flawlessly aligned to the navigation options.
- **Targeted Sidebar Hiding**:
  - Left menu hides `LeoDex`, `Perps`, `Predict`, `Auto Vote`, and `HivePro`.
  - Right rail hides `Who to Follow`, `Portfolio`, and `LEO Tokenomics` while preserving the column itself.
- **Integrated Mute Functionality**: A natively integrated `[ MUTE ]` button appears next to usernames in the feed.
  - Persists muted users to local storage.
  - Instantly hides posts from muted users across the application.
- **Editor Toolbar Cleanup**: The `Heading`, `Italic`, and `Upload Short` buttons are hidden across Inleo's editor UI.
- **Persistent Settings**: Your chosen theme is saved locally and applies automatically every time you visit the site.

## How It Works

The extension uses content scripts to inject custom CSS stylesheets and dynamic DOM listeners directly into the `inleo.io` page.
- Opening the extension popup allows you to select a theme.
- The selection and your muted users are saved to your browser's local storage.
- When you load `inleo.io`, the extension reads your saved preference, injects the corresponding CSS file (e.g., `themes/cyberpunk-v2.css`), and actively monitors the DOM to keep the sidebar cleanup, ticker placement, mute filters, and avatar outlines in place during SPA navigation.

## Tested Behavior

- Verified in full desktop Google Chrome with the unpacked extension loaded.
- Desktop left and right columns remain visible while only the requested menu/card entries are hidden.
- The `Market Data` widget is anchored directly after `Publish` across INLEO's current desktop sidebar variants.
- Articles-page dropdown layout fixes are scoped to `/posts` so they do not leak into unrelated thread routes.

## Installation

1. Clone or download this repository.
2. Open your browser's extensions page (e.g., `chrome://extensions/` or `about:debugging` for Firefox).
3. Enable "Developer mode" in the top right.
4. Click "Load unpacked" and select the `inleo-skin` directory.
5. Pin the extension to your toolbar, open it on `inleo.io`, and select your theme!
