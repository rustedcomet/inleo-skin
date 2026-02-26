let currentThemeLink = null;

// Initial load
chrome.storage.sync.get(['activeTheme'], (result) => {
    if (result.activeTheme) {
        applyTheme(result.activeTheme);
    }
    // Start the persistence observer after initial theme is applied
    startThemeObserver();
});

function applyTheme(themeName) {
    // Remove existing theme
    if (currentThemeLink) {
        currentThemeLink.remove();
        currentThemeLink = null;
    }

    // If none, stop
    if (!themeName || themeName === 'none') {
        document.documentElement.removeAttribute('data-inleo-skin');
        document.documentElement.style.removeProperty('--bg-image');
        removePriceTicker();
        return;
    }

    // Set skin attribute
    document.documentElement.setAttribute('data-inleo-skin', themeName);

    // Set background image CSS variable dynamically to bypass chrome-extension:// path issues in injected CSS
    let bgImageUrl = '';
    document.documentElement.style.setProperty('--bg-image', bgImageUrl);

    // Inject the theme CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL(`themes/${themeName}.css`);
    link.id = 'inleo-skin-theme-stylesheet';

    document.head.appendChild(link);
    currentThemeLink = link;
    console.log(`[Inleo Skins] Applied theme: ${themeName} with bg ${bgImageUrl}`);

    // Inject price ticker for cyberpunk themes
    if (themeName.includes('cyberpunk')) {
        waitForNavAndInjectTicker();
    }
}

/* =========================================================
       THEME PERSISTENCE — MutationObserver
       Inleo is a SPA; client-side navigation can remove our
       injected <link> and price ticker. This observer detects
       removal and re-injects automatically.
       ========================================================= */
let themeObserver = null;
let reapplyDebounce = null;

function startThemeObserver() {
    if (themeObserver) return; // already watching

    themeObserver = new MutationObserver(() => {
        // Check if our stylesheet was removed
        if (!document.getElementById('inleo-skin-theme-stylesheet')) {
            // Debounce to avoid rapid re-fire during SPA transitions
            clearTimeout(reapplyDebounce);
            reapplyDebounce = setTimeout(() => {
                chrome.storage.sync.get(['activeTheme'], (result) => {
                    if (result.activeTheme && result.activeTheme !== 'none') {
                        console.log('[Inleo Skins] Stylesheet removed by SPA — re-injecting');
                        applyTheme(result.activeTheme);
                    }
                });
            }, 200);
        }
    });

    // Watch <head> for child additions/removals
    themeObserver.observe(document.head, { childList: true });

    // Also watch for full-body re-renders (some SPAs replace <body> children)
    const bodyObserver = new MutationObserver(() => {
        // Re-inject ticker if it disappeared
        chrome.storage.sync.get(['activeTheme'], (result) => {
            if (result.activeTheme && result.activeTheme.includes('cyberpunk')) {
                if (!document.getElementById('cyber-price-ticker')) {
                    waitForNavAndInjectTicker();
                }
            }
        });
    });
    bodyObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: false
    });

    console.log('[Inleo Skins] Theme persistence observer active');
}

/* =========================================================
   PRICE TICKER — HIVE, LEO, BTC
   Fetches from CoinGecko free API, refreshes every 60s.
   ========================================================= */
let tickerInterval = null;

function removePriceTicker() {
    const existing = document.getElementById('cyber-price-ticker');
    if (existing) existing.remove();
    if (tickerInterval) {
        clearInterval(tickerInterval);
        tickerInterval = null;
    }
}

function waitForNavAndInjectTicker() {
    // Wait for nav to be available in DOM
    const check = setInterval(() => {
        const nav = document.querySelector('nav');
        if (nav) {
            clearInterval(check);
            injectPriceTicker();
        }
    }, 500);
    // Stop checking after 15 seconds
    setTimeout(() => clearInterval(check), 15000);
}

function injectPriceTicker() {
    if (document.getElementById('cyber-price-ticker')) return;

    const nav = document.querySelector('nav');
    if (!nav || !nav.parentElement) return;

    const ticker = document.createElement('div');
    ticker.id = 'cyber-price-ticker';
    ticker.innerHTML = `
        <div class="ticker-title">Market Data</div>
        <div class="ticker-row" id="ticker-btc">
            <span class="ticker-symbol">BTC</span>
            <span class="ticker-price">Loading...</span>
            <span class="ticker-change">—</span>
        </div>
        <div class="ticker-row" id="ticker-hive">
            <span class="ticker-symbol">HIVE</span>
            <span class="ticker-price">Loading...</span>
            <span class="ticker-change">—</span>
        </div>
        <div class="ticker-row" id="ticker-leo">
            <span class="ticker-symbol">LEO</span>
            <span class="ticker-price">Loading...</span>
            <span class="ticker-change">—</span>
        </div>
    `;

    // Insert after the nav element's parent container (the sidebar wrapper)
    nav.parentElement.insertBefore(ticker, nav.nextSibling);
    console.log('[Inleo Skins] Price ticker injected');

    // Fetch immediately, then every 60s
    updatePrices();
    tickerInterval = setInterval(updatePrices, 60000);
}

async function updatePrices() {
    try {
        const CACHE_KEY = 'inleo_market_data_cache';
        const CACHE_TIME_MS = 30 * 60 * 1000; // 30 minutes

        // Check cache first
        const result = await chrome.storage.local.get([CACHE_KEY]);
        const cached = result[CACHE_KEY];

        if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TIME_MS)) {
            console.log('[Inleo Skins] Loaded Market Data from cache');
            updateTickerRow('ticker-btc', cached.data.bitcoin);
            updateTickerRow('ticker-hive', cached.data.hive);
            updateTickerRow('ticker-leo', cached.data['bep20-leo']);
            return;
        }

        console.log('[Inleo Skins] Fetching fresh Market Data from API');
        const response = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,hive,bep20-leo&vs_currencies=usd&include_24hr_change=true'
        );
        const data = await response.json();

        // Save to cache
        await chrome.storage.local.set({
            [CACHE_KEY]: {
                timestamp: Date.now(),
                data: data
            }
        });

        updateTickerRow('ticker-btc', data.bitcoin);
        updateTickerRow('ticker-hive', data.hive);
        updateTickerRow('ticker-leo', data['bep20-leo']);
    } catch (err) {
        console.warn('[Inleo Skins] Price fetch failed:', err.message);
    }
}

function updateTickerRow(id, coinData) {
    const row = document.getElementById(id);
    if (!row || !coinData) return;

    const price = coinData.usd;
    const change = coinData.usd_24h_change;

    const priceEl = row.querySelector('.ticker-price');
    const changeEl = row.querySelector('.ticker-change');

    if (priceEl) {
        priceEl.textContent = price >= 1 ? `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${price.toFixed(4)}`;
    }

    if (changeEl && change != null) {
        const sign = change >= 0 ? '+' : '';
        changeEl.textContent = `${sign}${change.toFixed(1)}%`;
        changeEl.className = `ticker-change ${change >= 0 ? 'up' : 'down'}`;
    }
}

/* =========================================================
   BUG FIX — Theme persistence (The "Nuclear" Option)
   Inleo is a Next.js SPA. Standard MutationObservers and 
   history API hooks often fail to catch React completely
   replacing the <head> during bfcache restorations or 
   complex client-side routes (like /premium).
   A lightweight interval guarantees the CSS stays injected
   and the price ticker survives structural DOM wipes.
   ========================================================= */
setInterval(() => {
    chrome.storage.sync.get(['activeTheme'], (result) => {
        const theme = result.activeTheme;
        if (!theme || theme === 'none') {
            if (currentThemeLink) {
                currentThemeLink.remove();
                currentThemeLink = null;
            }
            return;
        }

        // 1. Ensure the <link> tag is actually in the DOM
        const existing = document.getElementById('inleo-skin-theme-stylesheet');

        // 2. Ensure the <html> data attribute is present
        const dataAttr = document.documentElement.getAttribute('data-inleo-skin');

        if (!existing || dataAttr !== theme) {
            console.log('[Inleo Skins] Poller detected missing theme — re-applying');
            applyTheme(theme);
        }

        // 3. Ensure the ticker survives body replacements (Market Data bug fix)
        if (theme.includes('cyberpunk')) {
            if (!document.getElementById('cyber-price-ticker')) {
                // The nav might rebuild itself, so we check if nav is there
                const nav = document.querySelector('nav');
                if (nav && nav.parentElement) {
                    injectPriceTicker();
                }
            }
        }

        // --- NEW FEATURES DATA ACQUISITION ---
        updateCurrentUser();

        // 4. Ensure Mute functionality survives SPA navigation (Premium page bug fix)
        processFeed();

        // 5. Inject Settings Link after Profile
        injectSettingsLink();

        // 6. Handle Wallet Page Layout Overlaps
        if (window.location.pathname.includes('/wallet')) {
            document.body.classList.add('inleo-wallet-page');
        } else {
            document.body.classList.remove('inleo-wallet-page');
        }

    });
}, 1000);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateTheme") {
        applyTheme(request.theme);
        sendResponse({ status: "ok" });
    }
});

/* =========================================================
   SETTINGS LINK INJECTION
   Injects a "Settings" link right after the "Profile" link
   in the left sidebar navigation.
   ========================================================= */
function injectSettingsLink() {
    if (document.getElementById('inleo-skin-settings-link')) return;

    const nav = document.querySelector('nav');
    if (!nav) return;

    // Find the exact Profile link container by checking text content directly
    const navLinks = Array.from(nav.querySelectorAll('a'));
    const sidebarProfileLink = navLinks.find(link => {
        const textSpan = Array.from(link.querySelectorAll('span')).find(s => !s.classList.contains('material-symbols-outlined'));
        return textSpan && textSpan.textContent.trim().toLowerCase() === 'profile';
    });

    if (!sidebarProfileLink) return;

    // The actual flex container we need to duplicate is the parent of the <a>
    const profileContainer = sidebarProfileLink.parentElement;
    if (!profileContainer) return;

    const settingsContainer = profileContainer.cloneNode(true);
    const settingsLink = settingsContainer.querySelector('a');

    if (!settingsLink) return;

    // Assign ID to prevent duplicates
    settingsContainer.id = 'inleo-skin-settings-link';

    // Update Href
    settingsLink.setAttribute('href', '/settings');

    // Update Icon and Text
    const svgIcon = settingsLink.querySelector('svg');
    if (svgIcon) {
        svgIcon.innerHTML = `<path fill="currentColor" d="M495.9 166.6c3.2 8.7 .5 18.4-6.4 24.6l-43.3 39.4c1.1 8.3 1.7 16.8 1.7 25.4s-.6 17.1-1.7 25.4l43.3 39.4c6.9 6.2 9.6 15.9 6.4 24.6c-4.4 11.9-9.7 23.3-15.8 34.3l-4.7 8.1c-6.6 11-14 21.4-22.1 31.2c-5.9 7.2-15.7 9.6-24.5 6.8l-55.7-17.7c-13.4 10.3-28.2 18.9-44 25.4l-12.5 57.1c-2 9.1-9 16.3-18.2 17.8c-13.8 2.3-28 3.5-42.5 3.5s-28.7-1.2-42.5-3.5c-9.2-1.5-16.2-8.7-18.2-17.8l-12.5-57.1c-15.8-6.5-30.6-15.1-44-25.4L83.1 425.9c-8.8 2.8-18.6 .3-24.5-6.8c-8.1-9.8-15.5-20.2-22.1-31.2l-4.7-8.1c-6.1-11-11.4-22.4-15.8-34.3c-3.2-8.7-.5-18.4 6.4-24.6l43.3-39.4C64.6 273.1 64 264.6 64 256s.6-17.1 1.7-25.4L22.4 191.2c-6.9-6.2-9.6-15.9-6.4-24.6c4.4-11.9 9.7-23.3 15.8-34.3l4.7-8.1c6.6-11 14-21.4 22.1-31.2c5.9-7.2 15.7-9.6 24.5-6.8l55.7 17.7c13.4-10.3 28.2-18.9 44-25.4l12.5-57.1c2-9.1 9-16.3 18.2-17.8C227.3 1.2 241.5 0 256 0s28.7 1.2 42.5 3.5c9.2 1.5 16.2 8.7 18.2 17.8l12.5 57.1c15.8 6.5 30.6 15.1 44 25.4l55.7-17.7c8.8-2.8 18.6-.3 24.5 6.8c8.1 9.8 15.5 20.2 22.1 31.2l4.7 8.1c6.1 11 11.4 22.4 15.8 34.3zM256 336a80 80 0 1 0 0-160 80 80 0 1 0 0 160z"/></svg>`;
        svgIcon.setAttribute('viewBox', '0 0 512 512');
        svgIcon.setAttribute('data-icon', 'gear');
    }

    const textSpans = settingsLink.querySelectorAll('span');
    textSpans.forEach(span => {
        if (!span.classList.contains('material-symbols-outlined')) {
            span.textContent = 'Settings';
        }
    });

    // Remove any active classes so it doesn't look like we are ON the settings page incorrectly
    settingsLink.classList.remove('item-active');
    settingsLink.classList.remove('text-pri');

    // Explicitly un-style active container too if applicable
    settingsContainer.classList.remove('text-pri');

    // Insert directly after the Profile container
    profileContainer.parentElement.insertBefore(settingsContainer, profileContainer.nextSibling);
}

/* =========================================================
   MUTE FEATURE & AVATARS
   Hides posts from specific users, injects a mute button,
   and colors avatars based on current user.
   ========================================================= */
let mutedUsers = [];
let currentUser = null;

// Function to find the logged-in username securely from the left menu
function updateCurrentUser() {
    const profileLinks = Array.from(document.querySelectorAll('nav a[href^="/profile/"]'));
    const sidebarProfileLink = profileLinks.find(link => link.closest('nav'));
    if (sidebarProfileLink) {
        const hrefParts = sidebarProfileLink.getAttribute('href').split('/profile/');
        if (hrefParts.length > 1) {
            currentUser = hrefParts[1].toLowerCase().trim().split('/')[0].split('?')[0];
        }
    }
}

// Load the initial list of muted users
chrome.storage.local.get({ mutedUsers: [] }, (result) => {
    mutedUsers = result.mutedUsers || [];
    processFeed();
});

// Listen for storage changes to apply updates live (e.g., from options page if added later)
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.mutedUsers) {
        mutedUsers = changes.mutedUsers.newValue || [];
        processFeed();
    }
});

function processFeed() {
    // Clear all existing muted classes to recalculate
    document.querySelectorAll('.inleo-muted-post').forEach(el => {
        el.classList.remove('inleo-muted-post');
    });

    const profileLinks = document.querySelectorAll('a[href^="/profile/"]');

    profileLinks.forEach(link => {
        // Avoid running inside popups or tooltips
        if (link.closest('div[role="tooltip"]') || link.closest('.absolute') || link.closest('[id^="radix-"]')) {
            return;
        }

        // Extract the username from the href
        const hrefParts = link.getAttribute('href').split('/profile/');
        if (hrefParts.length < 2) return;

        let username = hrefParts[1].toLowerCase().trim();
        username = username.split('/')[0].split('?')[0]; // Strip trailing slashes or queries

        // Ensure it's inside a post container so we don't accidentally hide sidebar elements
        let postContainer = link.closest('div.cursor-pointer');
        if (!postContainer) {
            let parent = link.parentElement;
            for (let i = 0; i < 6; i++) {
                if (!parent) break;
                if (parent.tagName === 'DIV' && parent.classList.contains('cursor-pointer')) {
                    postContainer = parent;
                    break;
                }
                parent = parent.parentElement;
            }
        }

        if (postContainer) {
            // Find the outermost row for the post
            let outerWrapper = link.closest('.relative.min-h-px') || postContainer.closest('.relative.min-h-px') || postContainer.parentElement;

            if (mutedUsers.includes(username)) {
                outerWrapper.classList.add('inleo-muted-post');
            } else {
                injectMuteButton(link, username);
            }
        }

    });

    // --- Avatar Outline Logic ---
    // Inleo avatars are wrapped directly in a span where the `id` is the username
    const avatars = document.querySelectorAll('img[src*="avatar"]');
    avatars.forEach(img => {
        let targetNode = img.parentElement;
        let foundUsername = null;
        for (let i = 0; i < 4; i++) {
            if (!targetNode) break;
            if (targetNode.id && targetNode.id.trim() !== '') {
                foundUsername = targetNode.id.toLowerCase().trim();
                break;
            }
            targetNode = targetNode.parentElement;
        }

        if (foundUsername && targetNode) {
            if (currentUser && foundUsername === currentUser) {
                targetNode.classList.add('avatar-self-target');
                targetNode.classList.remove('avatar-other-target');
            } else {
                targetNode.classList.add('avatar-other-target');
                targetNode.classList.remove('avatar-self-target');
            }
        }
    });
}

function injectMuteButton(link, username) {
    // Prevent adding multiple buttons
    if (link.parentElement.querySelector('.inleo-mute-btn')) return;

    const muteBtn = document.createElement('button');
    muteBtn.className = 'inleo-mute-btn';
    muteBtn.textContent = '[ MUTE ]';
    muteBtn.title = `Mute ${username}`;

    muteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        muteUser(username);
    });

    // Inject it right after the profile link
    link.parentElement.insertBefore(muteBtn, link.nextSibling);
}

function muteUser(username) {
    if (!mutedUsers.includes(username)) {
        mutedUsers.push(username);
        // Hide immediately for responsive UI
        processFeed();
        chrome.storage.local.set({ mutedUsers }, () => {
            console.log(`[Inleo Skins] Muted user: ${username}`);
        });
    }
}

// Observe DOM for infinite scrolling/dynamic posts to inject mute buttons
const feedObserver = new MutationObserver((mutations) => {
    let shouldProcess = false;
    for (let mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
            shouldProcess = true;
            break;
        }
    }
    if (shouldProcess) {
        processFeed();
    }
});

// Start observing the body for deep changes (feed loading)
function startFeedObserver() {
    try {
        feedObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (e) {
        console.warn("[Inleo Skins] Could not attach feedObserver", e);
    }
}
startFeedObserver();

// Backup: try to re-attach observer if it gets completely detached by SPA
setInterval(() => {
    if (!document.body && !document.documentElement) return;
    try {
        // Will throw an error if already observing, or silently succeed, ensuring we have an active observer
        feedObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (e) { }
}, 5000);
