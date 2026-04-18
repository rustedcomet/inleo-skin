/* content.js — Thin bootstrap for the feed / theme / misc features.

   Each feature lives in its own file under features/ (see the manifest
   for load order). This file wires them together:

   - Applies the saved theme on initial load + message from the popup.
   - Starts the mute / feed observer.
   - Owns the 3s watchdog that keeps DOM-injected elements alive across
     SPA navigation (ticker, settings link, data-inleo-skin attribute).
   - Listens for SPA route changes and schedules a sidebar-cleanup pass.

   Nothing heavy happens here — all real logic lives in the feature
   modules on `window.InleoSkins`. */
(function () {
    const NS = window.InleoSkins || {};
    const log = NS.logger || { log: () => { } };
    const storage = NS.storage;
    const state = NS.state;
    const scheduler = NS.scheduler;
    const route = NS.route;

    function updatePageContext() {
        const path = window.location.pathname || '';
        document.body?.classList.toggle('inleo-wallet-page', /\/wallet(\/|$)/.test(path));
        document.body?.classList.toggle('inleo-articles-page', /\/posts(\/|$)/.test(path));
    }

    /* ----- Initial theme apply ----- */
    storage.getActiveTheme().then(theme => {
        if (theme && theme !== 'none') NS.theme.apply(theme);
    });

    /* ----- Popup → content script messaging ----- */
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'updateTheme') {
            NS.theme.apply(request.theme);
            sendResponse({ status: 'ok' });
        }
    });

    /* ----- Mute / feed feature startup ----- */
    NS.muteFeed.loadInitial();
    NS.muteFeed.startObserver();

    /* ----- Route-driven sidebar cleanup ----- */
    if (route) {
        route.subscribe(() => {
            updatePageContext();
            scheduler.sidebarCleanup(() => NS.sidebarCleanup.hideAll(), 150);
            scheduler.processFeed(() => NS.muteFeed.processFeed(), 300);
        });
    }

    /* ----- Watchdog (3s) — rebuilds DOM-injected UI SPA mutations wipe. */
    setInterval(async () => {
        updatePageContext();
        NS.sidebarCleanup.hideAll();

        const theme = await storage.getActiveTheme();

        if (!theme || theme === 'none') {
            if (state.currentThemeSheet) {
                document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== state.currentThemeSheet);
                state.currentThemeSheet = null;
                state.currentThemeName = null;
            }
            if (NS.marketTicker) NS.marketTicker.remove();
        } else {
            /* 1) data-inleo-skin attribute */
            const dataAttr = document.documentElement.getAttribute('data-inleo-skin');
            if (dataAttr !== theme) {
                document.documentElement.setAttribute('data-inleo-skin', theme);
            }

            /* 2) adoptedStyleSheet + fonts (bfcache / hard SPA wipe). */
            const sheetMissing = !state.currentThemeSheet
                || !document.adoptedStyleSheets.includes(state.currentThemeSheet)
                || state.currentThemeName !== theme;
            const fontsMissing = !document.getElementById('inleo-skin-font-0');
            if (sheetMissing || fontsMissing) {
                NS.theme.apply(theme);
            }

            /* 3) Ticker presence. */
            if (NS.marketTicker && NS.marketTicker.themeUsesTicker(theme)) {
                NS.marketTicker.ensureMounted();
            } else if (NS.marketTicker) {
                if (document.getElementById(NS.marketTicker.TICKER_ID)) {
                    NS.marketTicker.remove();
                }
            }
        }

        /* 4) Feature maintenance. */
        NS.currentUser.update();
        scheduler.processFeed(() => NS.muteFeed.processFeed(), 300);
        NS.settingsLink.inject();
    }, 3000);

    /* ----- Sidebar cleanup on window load ----- */
    window.addEventListener('load', () => {
        scheduler.sidebarCleanup(() => NS.sidebarCleanup.hideAll(), 0);
    });

    /* ----- Observer safety-net (re-attach in case SPA detached it) ----- */
    setInterval(() => {
        if (!document.body && !document.documentElement) return;
        NS.muteFeed.reattach();
    }, 5000);

    updatePageContext();
    log.log('bootstrap', 'content.js ready');
})();
