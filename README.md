# Inleo Skin Extension

A browser extension that instantly transforms the look and feel of `inleo.io` with custom CSS themes. Currently featuring the highly polished **Cyberpunk V2** aesthetic.

## Features

- **Instant Theme Switching**: Apply themes directly from the extension popup without refreshing the page.
- **Cyberpunk V2 Theme**: A complete visual overhaul inspired by dark, neon-lit aesthetics.
  - Solid dark panels with cyan and red corner brackets.
  - Distraction-free navigation: unneeded menu items are hidden to keep focus on content.
  - Reorganized layout prioritizing your profile, notifications, and core content.
  - Replaced site logos with custom glitch-art branding.
- **Persistent Settings**: Your chosen theme is saved locally and applies automatically every time you visit the site.

## How It Works

The extension uses content scripts to inject custom CSS stylesheets directly into the `inleo.io` page.
- Opening the extension popup allows you to select a theme.
- The selection is saved to your browser's local storage.
- When you load `inleo.io`, the extension reads your saved preference and injects the corresponding CSS file (e.g., `themes/cyberpunk-v2.css`).

## Installation

1. Clone or download this repository.
2. Open your browser's extensions page (e.g., `chrome://extensions/` or `about:debugging` for Firefox).
3. Enable "Developer mode" in the top right.
4. Click "Load unpacked" and select the `inleo-skin` directory.
5. Pin the extension to your toolbar, open it on `inleo.io`, and select your theme!
