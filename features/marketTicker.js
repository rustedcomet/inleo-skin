/* features/marketTicker.js — HIVE / LEO / BTC price ticker injected
   into the left sidebar below "Publish".

   Used by the Cyberpunk V2, Gday, and Gday v2 themes. Each theme
   restyles the ticker via its own CSS (e.g. HUD panel, SYS_REPORT
   block). Prices come from CoinGecko's free API and are cached in
   chrome.storage.local for 30 minutes. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    const log = NS.logger || { log: () => { }, warn: () => { } };
    const utils = NS.utils;

    const TICKER_THEMES = new Set(['cyberpunk-v2', 'gday', 'gday-v2']);
    const TICKER_ID = 'cyber-price-ticker';
    const CACHE_KEY = 'inleo_market_data_cache';
    const CACHE_TIME_MS = 30 * 60 * 1000;
    const REFRESH_INTERVAL_MS = 60000;

    let tickerInterval = null;

    function themeUsesTicker(themeName) {
        return !!themeName && TICKER_THEMES.has(themeName);
    }

    function remove() {
        const existing = document.getElementById(TICKER_ID);
        if (existing) existing.remove();
        if (tickerInterval) {
            clearInterval(tickerInterval);
            tickerInterval = null;
        }
    }

    function waitAndInject() {
        /* Nav may not be in the DOM yet on first paint — poll every 500ms
           for up to 15 seconds. */
        const check = setInterval(() => {
            const nav = utils.getSidebarNav();
            if (nav) {
                clearInterval(check);
                inject();
            }
        }, 500);
        setTimeout(() => clearInterval(check), 15000);
    }

    function findPublishContainer(nav) {
        if (!nav || !nav.parentElement) return null;

        const siblingPublishContainer = Array.from(nav.parentElement.children).find(child => {
            return child.querySelector?.('a[title="Publish"], a[aria-label="Publish"], a[href="/publish"]');
        });
        if (siblingPublishContainer) return siblingPublishContainer;

        const publishControl = Array.from(nav.querySelectorAll('a, button')).find(control => {
            const label = utils.normalizeSidebarLabel(
                control.textContent ||
                control.getAttribute('title') ||
                control.getAttribute('aria-label')
            );
            return label === 'publish';
        });

        return utils.getNavItemContainer(publishControl, nav);
    }

    function mount(ticker, nav) {
        const publishContainer = findPublishContainer(nav);
        if (!publishContainer || !publishContainer.parentElement) return false;

        if (publishContainer.parentElement === nav) {
            publishContainer.style.setProperty('order', '9', 'important');
            ticker.style.setProperty('order', '10', 'important');
            ticker.style.setProperty('width', '100%', 'important');
            if (publishContainer.nextSibling !== ticker) {
                nav.insertBefore(ticker, publishContainer.nextSibling);
            }
            return true;
        }

        ticker.style.removeProperty('order');
        ticker.style.removeProperty('width');
        if (publishContainer.nextSibling !== ticker) {
            publishContainer.parentElement.insertBefore(ticker, publishContainer.nextSibling);
        }
        return true;
    }

    function inject() {
        const nav = utils.getSidebarNav();
        if (!nav || !nav.parentElement) return;

        let ticker = document.getElementById(TICKER_ID);
        if (!ticker) {
            ticker = document.createElement('div');
            ticker.id = TICKER_ID;
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
        }

        mount(ticker, nav);
        log.log('ticker', 'injected');

        updatePrices();
        if (!tickerInterval) {
            tickerInterval = setInterval(updatePrices, REFRESH_INTERVAL_MS);
        }
    }

    async function updatePrices() {
        try {
            const result = await chrome.storage.local.get([CACHE_KEY]);
            const cached = result[CACHE_KEY];

            if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TIME_MS)) {
                log.log('ticker', 'loaded from cache');
                updateRow('ticker-btc', cached.data.bitcoin);
                updateRow('ticker-hive', cached.data.hive);
                updateRow('ticker-leo', cached.data['bep20-leo']);
                return;
            }

            log.log('ticker', 'fetching fresh data');
            const response = await fetch(
                'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,hive,bep20-leo&vs_currencies=usd&include_24hr_change=true'
            );
            const data = await response.json();

            await chrome.storage.local.set({
                [CACHE_KEY]: { timestamp: Date.now(), data }
            });

            updateRow('ticker-btc', data.bitcoin);
            updateRow('ticker-hive', data.hive);
            updateRow('ticker-leo', data['bep20-leo']);
        } catch (err) {
            log.warn('ticker', 'price fetch failed:', err.message);
        }
    }

    function updateRow(id, coinData) {
        const row = document.getElementById(id);
        if (!row || !coinData) return;

        const price = coinData.usd;
        const change = coinData.usd_24h_change;

        const priceEl = row.querySelector('.ticker-price');
        const changeEl = row.querySelector('.ticker-change');

        if (priceEl) {
            priceEl.textContent = price >= 1
                ? `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `$${price.toFixed(4)}`;
        }

        if (changeEl && change != null) {
            const sign = change >= 0 ? '+' : '';
            changeEl.textContent = `${sign}${change.toFixed(1)}%`;
            changeEl.className = `ticker-change ${change >= 0 ? 'up' : 'down'}`;
        }
    }

    /* Called from the watchdog to re-mount the ticker if SPA navigation
       wiped the DOM or the nav got replaced. */
    function ensureMounted() {
        const nav = utils.getSidebarNav();
        if (!nav) return;
        if (!document.getElementById(TICKER_ID)) {
            inject();
        } else {
            mount(document.getElementById(TICKER_ID), nav);
        }
    }

    NS.marketTicker = {
        TICKER_ID,
        themeUsesTicker,
        waitAndInject,
        inject,
        remove,
        ensureMounted,
        updatePrices
    };
})();
