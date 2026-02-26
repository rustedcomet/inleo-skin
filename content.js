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
        const response = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,hive,wrapped-leo&vs_currencies=usd&include_24hr_change=true'
        );
        const data = await response.json();

        updateTickerRow('ticker-btc', data.bitcoin);
        updateTickerRow('ticker-hive', data.hive);
        updateTickerRow('ticker-leo', data['wrapped-leo']);
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
    });
}, 1000);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateTheme") {
        applyTheme(request.theme);
        sendResponse({ status: "ok" });
    }
});
