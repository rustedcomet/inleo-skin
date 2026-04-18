# Phase 6 — Codebase Stabilization, Modular Refactor, and Composer Assistant

## Executive Summary

After reviewing the current state of `inleo-skin`, the codebase is functional but has clearly accumulated “debugging gravity” from rapid iteration. The biggest issue is not that any one feature is wrong — it is that too much unrelated behavior now lives inside two very large runtime files:

- `content.js`
- `wallet.js`

That makes the extension harder to reason about, harder to debug safely, and riskier to extend.

**Phase 6 should do two things in this order:**

1. **Stabilize and modularize the current extension**
2. **Add the first “creator utility” feature: automatic hashtag suggestions in the composer**

This phase turns the project from “theme extension with some attached features” into a structured Inleo enhancement suite.

---

## Current Code Review — Main Findings

## 1. The extension has outgrown its original file structure

The current architecture still looks like a small theme extension, but the product is no longer small.

The extension now includes:

- theme loading
- persistent stylesheet handling
- editor toolbar tweaks
- market ticker
- settings link injection
- current-user detection
- mute system
- avatar styling support
- wallet route interception
- wallet rendering
- Hive RPC calls
- Hive Engine token calls
- wallet caching
- modal handling
- options page settings

That is too much responsibility for two monolithic content scripts.

### Recommendation
Split responsibilities into focused files and make `manifest.json` load them in a controlled order.

---

## 2. `content.js` is doing too many unrelated jobs

`content.js` currently contains at least these distinct systems:

- theme application
- font link injection
- market ticker fetching/rendering
- DOM maintenance polling
- settings link injection
- muted user storage synchronization
- feed processing
- popup/hover-card detection
- mute button injection
- avatar highlighting
- MutationObserver lifecycle
- editor toolbar CSS tweaks

### Why this is a problem
- hard to isolate regressions
- difficult to safely add composer features
- debugging one feature risks breaking another
- onboarding cost is high for any future contributor or coding agent

### Recommendation
Refactor `content.js` into smaller runtime modules.

Suggested split:

- `core/state.js`
- `core/storage.js`
- `features/theme.js`
- `features/editorTweaks.js`
- `features/marketTicker.js`
- `features/settingsLink.js`
- `features/muteFeed.js`
- `features/avatarMarkers.js`
- `features/composerHashtags.js`
- `features/domScheduler.js`

If ES modules are not desired, use plain IIFE-style files loaded in order by `manifest.json`.

---

## 3. `wallet.js` is also a full subsystem and should be treated as one

`wallet.js` is no longer “just a page swap.” It now contains:

- route interception
- wallet open/close lifecycle
- CSS generation
- HTML rendering
- Hive RPC client
- cache access
- account data transformation
- Hive Engine token retrieval
- total value calculations
- modal rendering
- direct route bootstrapping

### Why this matters
The wallet is now a real product feature and deserves a proper internal structure.

### Recommendation
Split wallet into dedicated files:

- `wallet/walletRoute.js`
- `wallet/walletView.js`
- `wallet/walletStyles.js`
- `wallet/walletApi.js`
- `wallet/walletCache.js`
- `wallet/walletRender.js`
- `wallet/walletModal.js`

---

## 4. Some files are clearly stale relative to the current product

There are visible mismatches between implementation and supporting files.

### Examples
- `popup.html` still shows `v1.0`
- `manifest.json` is `1.1`
- `README.md` still describes the extension mostly as a theme extension with mute support, but does not reflect the wallet and broader product direction
- `popup.js` and `background.js` still feel like early-phase files
- `DEVELOPMENT_PLAN.md` has detailed history, but the project now needs a forward-looking architectural cleanup phase

### Recommendation
Phase 6 should explicitly include a documentation and UI sync pass:
- update `README.md`
- update popup version display
- align popup/options language with current product scope
- add a short architecture section describing the new module layout

---

## 5. Storage usage needs centralization

The extension currently uses both:

- `chrome.storage.sync`
- `chrome.storage.local`

That is correct in principle, but the storage model is currently implicit instead of centralized.

### Risk
As more features are added, key names, defaults, and TTL policies can drift.

### Recommendation
Create a single storage schema definition.

Suggested structure:

```js
const STORAGE_KEYS = {
  activeTheme: 'activeTheme',
  hiveApiNode: 'hiveApiNode',
  mutedUsers: 'mutedUsers',
  marketCache: 'inleo_market_data_cache',
  walletCache: 'inleo_wallet_data_cache',
  hashtagSettings: 'hashtagSettings'
};

const DEFAULTS = {
  activeTheme: 'none',
  hiveApiNode: 'https://api.deathwing.me',
  mutedUsers: [],
  hashtagSettings: {
    enabled: true,
    alwaysInclude: ['#skiptvadsthreads'],
    maxTags: 5
  }
};
```

This should live in one place and be used everywhere.

---

## 6. Route handling around the wallet should be made more explicit

Current wallet behavior relies heavily on click interception and initial route checks. It works, but it is brittle.

### Likely weak spots
- browser back/forward edge cases
- route changes that do not come from direct anchor clicks
- race conditions when DOM is not ready
- async rendering results arriving after the user switched wallet targets

### Recommendation
Add a small route controller that watches pathname changes and owns wallet open/close decisions.

At minimum:
- keep `currentRoute`
- react to `pushState`, `replaceState`, `popstate`, and interval/pathname fallback
- ensure async wallet renders are ignored if the requested user is no longer current

Also add a request token / render token pattern:

```js
let walletRequestId = 0;

async function loadWallet(user, force) {
  const requestId = ++walletRequestId;
  const data = await fetchData(user, force);
  if (requestId !== walletRequestId) return; // stale response
  renderData(data);
}
```

---

## 7. Wallet cache should become multi-user aware

The current wallet cache stores one structure under a single key. That is fine for basic use, but the wallet now supports viewing other accounts too.

### Problem
Switching between accounts will constantly overwrite the same cache entry.

### Recommendation
Change from:
- one cache object

to:
- a per-user cache map

Suggested structure:

```js
{
  inleo_wallet_data_cache: {
    "username1": { data: {...}, timestamp: 123 },
    "username2": { data: {...}, timestamp: 456 }
  }
}
```

This makes account switching feel much faster and cleaner.

---

## 8. CSS-in-JS for wallet should be externalized

The current wallet CSS is embedded in `wallet.js` as a huge template string. It works, but it is difficult to maintain.

### Why it should change
- hard to read
- hard to diff
- hard to theme later
- harder for code agents to edit safely

### Recommendation
Move wallet CSS into a dedicated file, for example:

- `styles/wallet.css`

Load it similarly to the theme CSS and inject it via `adoptedStyleSheets`.

This keeps the SPA-safe behavior while making styling maintainable.

---

## 9. Popup and options UX should be re-scoped

The popup still behaves like the project only does theme switching. That no longer matches reality.

### Recommendation
Use the popup for quick actions only:
- theme selector
- open settings
- maybe feature status indicators

Use `options.html` for actual feature configuration:
- muted users
- wallet node
- hashtag feature toggles
- always-on tags
- max suggested tags
- optional future toggles like Hivemoji

---

## 10. Phase 6 should include lightweight guardrails for future debugging

Because the project grew through trial-and-error, it now needs basic internal discipline.

### Add:
- one debug flag
- namespaced console logs
- feature-local init functions
- idempotent DOM injection checks
- comments at subsystem boundaries

Suggested pattern:

```js
const DEBUG = false;
function log(scope, ...args) {
  if (DEBUG) console.log(`[Inleo Skins:${scope}]`, ...args);
}
```

---

## Phase 6 Goals

## Goal A — Clean up the architecture without changing the product identity

Preserve existing behavior while making the code safe to extend.

## Goal B — Introduce the first creator-side utility

Add a **composer hashtag assistant** that suggests relevant hashtags based on thread content.

---

## Phase 6 Scope

## Part 1 — Stabilization and Refactor

### 1.1 File and module reorganization

Recommended target structure:

```text
inleo-skin/
  manifest.json
  background.js
  popup.html
  popup.js
  popup.css
  options.html
  options.js

  core/
    state.js
    storage.js
    utils.js
    logger.js

  features/
    theme.js
    editorTweaks.js
    marketTicker.js
    settingsLink.js
    muteFeed.js
    avatarMarkers.js
    composerHashtags.js
    domScheduler.js

  wallet/
    walletRoute.js
    walletApi.js
    walletCache.js
    walletView.js
    walletRender.js
    walletModal.js
    walletStyles.js

  styles/
    wallet.css

  data/
    hashtagEntities.js
    hashtagRules.js

  themes/
    cyberpunk-v2.css
```

### 1.2 Manifest cleanup

Update `manifest.json` so content scripts are loaded in a clear order.

Suggested order:
1. core/state
2. core/storage
3. core/utils/logger
4. feature modules
5. wallet modules

### 1.3 Central storage schema

Create a single source of truth for:
- keys
- defaults
- TTL values
- sync vs local storage placement

### 1.4 Route and async safety fixes

Add:
- route controller for wallet lifecycle
- stale-request guards
- safer async rendering
- better user-switch handling

### 1.5 Wallet cache upgrade

Switch from one-user cache to multi-user cache.

### 1.6 Externalize wallet CSS

Move wallet styling to `styles/wallet.css`.

### 1.7 Documentation refresh

Update:
- `README.md`
- popup version string
- options copy
- `DEVELOPMENT_PLAN.md` summary references after Phase 6 is merged

---

## Part 2 — Composer Assistant: Automatic Hashtag Suggestions

## Product direction

This is the first step toward turning the extension into an **Inleo creator assistant**.

The feature should not auto-post or silently rewrite content. It should **suggest** hashtags and let the user choose what to insert.

## Why this feature fits the product
- creator-side utility
- low-friction
- zero external API needed for v1
- immediate visible value
- can be expanded later into a broader writing assistant

---

## Hashtag Assistant — Phase 6 Functional Spec

## 2.1 V1 behavior

When a user is writing in the Inleo composer, the extension should:

- detect the active composer/editor
- read the current draft text
- analyze the text with a rule-based engine
- show suggested hashtag chips below or near the composer
- allow click-to-insert
- avoid duplicates
- update live as the user types

### Example

Input:

> Slowly but surely, took E05, E06, E07 like nothing, 3hrs of MONARCH, I got to say the show is ok although the amount of monsters they have come up with is very cool

Expected suggestions:

- `#tvonleo`
- `#monarch`
- `#episode`
- `#skiptvadsthreads`

---

## 2.2 V1 rules — no AI required

Phase 6 should be deterministic and local.

### Always include
- `#skiptvadsthreads` if enabled in settings

### Topic detection
Examples:
- TV/show words → `#tvonleo`
- movie words → `#moviesonleo`
- gaming words → `#gamingonleo`
- crypto/blockchain words → `#cryptoonleo`

### Format detection
Examples:
- `E05`, `ep 5`, `episode 5` → `#episode`
- `review`, `thoughts`, `my take` → `#review`
- `trailer` → `#trailer`

### Entity detection
Use:
- known title dictionaries
- uppercase emphasis detection
- nearby context words

Examples:
- `MONARCH` + show context → `#monarch`

---

## 2.3 Recommended engine design

Do not use plain yes/no rules only. Use scoring.

Example concept:

```js
function scoreHashtags(text) {
  const scores = new Map();

  function add(tag, points) {
    scores.set(tag, (scores.get(tag) || 0) + points);
  }

  add('#skiptvadsthreads', 100);

  if (/\b(e|ep|episode)\s?\d{1,2}\b/i.test(text)) {
    add('#episode', 60);
    add('#tvonleo', 30);
  }

  if (/\b(show|series|season)\b/i.test(text)) {
    add('#tvonleo', 20);
  }

  if (/\bmonarch\b/i.test(text)) {
    add('#monarch', 80);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
}
```

This gives future flexibility without needing AI.

---

## 2.4 Suggested data model

Create a small rules/data layer.

### `data/hashtagEntities.js`
Contains known entities by category:
- TV shows
- movies
- games
- franchises
- platforms if useful

### `data/hashtagRules.js`
Contains:
- topic keywords
- format patterns
- default tags
- stopwords
- score weights

### `features/composerHashtags.js`
Contains:
- composer detection
- text extraction
- debounced analysis
- chip rendering
- insertion logic

---

## 2.5 UI behavior

Recommended UI:
- small “Suggested hashtags” row under composer
- clickable chips
- already-inserted tags appear disabled or marked
- limit to 4–6 visible tags
- hide when no useful tags are found except always-on defaults
- re-scan after each draft change with debounce

### Important
Do **not** auto-insert tags without user action in v1.

That keeps the feature predictable and non-annoying.

---

## 2.6 Settings for the hashtag feature

Add to `options.html` and `options.js`:

- enable hashtag suggestions
- always include `#skiptvadsthreads`
- max suggested tags
- custom always-include tags
- custom blocked tags

Suggested storage shape:

```js
{
  hashtagSettings: {
    enabled: true,
    maxTags: 5,
    alwaysInclude: ['#skiptvadsthreads'],
    blockedTags: []
  }
}
```

---

## 2.7 Edge cases to handle

- tag already exists in draft
- duplicate suggestions from multiple rules
- composer re-renders because of SPA updates
- multiple composer instances
- user clicks chip multiple times
- title/entity false positives from random uppercase words
- suggestions must not break editor layout

---

## 2.8 Why AI should not be used in Phase 6

AI is optional later, but not recommended for initial rollout.

### Reasons
- slower
- adds API complexity
- adds operating cost
- harder to test
- less predictable
- unnecessary for the first version

### AI can be revisited in a later phase for
- obscure title detection
- smarter ranking
- personalized tags based on accepted suggestions

But Phase 6 should ship a strong local version first.

---

## Recommended Implementation Order

## Step 1 — Cleanup foundation
- create `core/` and `features/` structure
- centralize storage keys/defaults
- split `content.js`
- split `wallet.js`
- move wallet CSS to dedicated file
- keep behavior unchanged

## Step 2 — Reliability pass
- add wallet route controller
- add stale-request guards
- upgrade wallet cache to per-user map
- clean popup/options/documentation mismatches

## Step 3 — Composer assistant v1
- detect composer
- parse content
- score hashtag suggestions
- render clickable chips
- insert selected tags into draft

## Step 4 — Settings integration
- add hashtag settings to options
- store defaults centrally
- support always-on and blocked tags

## Step 5 — Final polish
- dedupe insertion
- validate SPA resilience
- test across navigation and editor rerenders

---

## Definition of Done

Phase 6 is complete when all of the following are true:

### Refactor / cleanup
- `content.js` is no longer a single monolith
- `wallet.js` is split into logical modules
- wallet CSS is externalized
- storage keys/defaults are centralized
- popup/options/docs are aligned with current product
- wallet routing is more explicit and safer under async changes

### Hashtag assistant
- suggestions appear in the composer
- suggestions update while typing
- `#skiptvadsthreads` can be always suggested via settings
- entity/topic/format tags are generated by rules
- clicking a tag inserts it only once
- feature survives Inleo SPA rerenders
- no external AI/API is required

---

## Non-Goals for Phase 6

These should **not** be part of this phase unless time remains after completion:

- AI-based hashtag generation
- automatic posting
- full writing assistant
- sentiment analysis
- server-side syncing
- analytics dashboard
- major wallet redesign beyond structural cleanup

---

## Recommended Notes for Codex

When implementing Phase 6, Codex should follow these rules:

1. **Do not rewrite the whole extension from scratch**
   - preserve working behavior
   - refactor incrementally

2. **Keep runtime logic modular**
   - each feature should expose an `init()` or similarly clear entry point

3. **Prefer deterministic logic for hashtags**
   - no AI dependency in Phase 6

4. **Do not silently auto-insert hashtags**
   - suggestions should be user-controlled

5. **Avoid introducing bundlers unless truly necessary**
   - plain Chrome extension files are fine

6. **Keep all DOM injections idempotent**
   - no duplicate chips, duplicate containers, or duplicate listeners

7. **Preserve SPA resilience**
   - any new feature must survive route and DOM re-render behavior on Inleo

---

## Final Recommendation

Phase 6 should be treated as a **stabilization + expansion** phase.

The cleanup is not optional anymore. The project has enough value and enough moving parts that continuing to stack features onto the current monolithic structure will make future work slower and more fragile.

The hashtag assistant is the right next feature because it:
- adds creator-side value immediately
- does not require AI
- fits naturally into the current extension direction
- opens the door to a broader “Inleo creator tools” roadmap later
