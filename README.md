# Inleo Skin Extension

A browser extension that reskins and extends `inleo.io` with custom themes, an integrated Hive wallet view, and quality-of-life features for the feed and composer. Currently ships three skins — **Cyberpunk V2 (Stitch)**, **Gday**, and **Gday v2** — and a rule-based **hashtag assistant** that suggests relevant tags while you write posts.

## Features

### Themes
- **Instant theme switching** from the extension popup — no page reload.
- **Cyberpunk V2 (Stitch)** — dark glitch aesthetic with neon cyan / red accents, corner brackets, and a custom logo.
- **Gday** — "Ethereal Terminal" / neon-minimalist HUD. Glassmorphic cards with hairline accents and a `NEURAL_LINK` wordmark.
- **Gday v2** — "Industrial Surveillance OS". Stencil typography, orange + red palette, scanline overlay, corner-bracketed hard rectangles.
- All three market-data themes share the HIVE / LEO / BTC price ticker (30-min cache, CoinGecko).

### Feed & Composer
- **Integrated mute button**: A `[ mute ]` control next to every username in the feed. Muted users' posts hide instantly and persist across sessions.
- **Targeted sidebar cleanup**: hides `LeoDex`, `Perps`, `Predict`, `Auto Vote`, and `HivePro` from the left menu and `Who to Follow`, `Portfolio`, and `LEO Tokenomics` from the right rail — without breaking either column.
- **Editor toolbar cleanup**: hides the `Heading`, `Italic`, and `Upload Short` buttons across every composer instance.
- **Avatar outlines**: cyan for your own avatar, red for everyone else, so you can spot yourself in threadcasts at a glance.
- **Phrase Filtering**: Hide specific posts based on their content (e.g. `/rafiki spin` commands) without muting the author. Configure phrases in Options.
- **Hashtag Assistant (v2)**: A SwiftKey-style suggestion strip between the text area and toolbar. Suggests relevant tags derived from your post body. Click a chip to append it in UPPERCASE at the end of your text, automatically comma-separated. Uses a main-world Slate.js bridge to survive React re-renders. Fully local, deterministic, and no-AI — rules + entity maps in `data/`. Configurable in Options (enable/disable, max tag count, always-include list, blocked list).

### Wallet
- **In-page wallet view** that replaces the center content on `/:user/wallet` without losing the sidebars.
- **Per-user cache** — viewing another account's wallet no longer overwrites your own cached data. Keeps up to 10 recent users, fresh for 5 minutes.
- **HIVE + HBD balances**, effective HP, outgoing / incoming delegations (with detail modal), savings APR, estimated staking APR range.
- **Hive Engine tokens**: LEO, SURGE, LSTR, EDSI, POSH, SWAP.HIVE — with USD conversion via the cached HIVE price.
- **Dual RPC** with automatic fallback between `api.deathwing.me` and `api.hive.blog` (configurable in Options).
- **SPA-safe routing**: navigating to `/wallet` via pushState, popstate, or a direct URL all open the wallet correctly; leaving `/wallet` cleanly restores the feed.

## How It Works

The extension is plain-JavaScript Manifest V3 with no bundler. Content scripts are split across small, single-purpose modules that attach to a shared `window.InleoSkins` namespace:

- `core/` — logger, storage schema, shared state, DOM utils, scheduler, route controller.
- `data/` — hashtag entity map + deterministic scoring rules.
- `features/` — composer hashtag assistant, user/phrase muting, UI tweaks, market ticker, and Slate.js bridge.
- `styles/` — externalized CSS (wallet styling; themes live in `themes/`).
- `content.js` + `wallet.js` — feed / theme feature host and wallet feature host, respectively.

Themes load as constructed `CSSStyleSheet` objects attached to `document.adoptedStyleSheets`, so Next.js SPA navigation cannot remove them. A 3s watchdog re-attaches anything SPA mutations strip (ticker, settings link, `data-inleo-skin` attribute).

## Tested Behavior

- Verified on desktop Chrome with the unpacked extension loaded.
- All three themes persist across SPA navigation and page reloads.
- Hashtag suggestions update live as you type; blocked tags are always filtered out; clicked chips grey out to show they've been inserted.
- Wallet per-user cache survives account switching; stale fetches from prior views are dropped via the render-token guard.

## Installation

1. Clone or download this repository.
2. Open your browser's extensions page (e.g., `chrome://extensions/`).
3. Enable "Developer mode" in the top right.
4. Click "Load unpacked" and select the `inleo-skin` directory.
5. Pin the extension to your toolbar, open it on `inleo.io`, and select your theme.
6. Optionally open the extension **Options** to configure muted users, Hive API node, and the hashtag assistant.
