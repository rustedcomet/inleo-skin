/* wallet/walletStyles.js — Lazy-loads styles/wallet.css into a
   constructed CSSStyleSheet the first time the wallet is opened.

   Externalizing wallet CSS (Phase 6) keeps the inline style blob out of
   wallet.js and means theme authors can inspect the same file browsers
   load. The embedded fallback lives in wallet.js's `getWalletCSS()`
   in case the resource fails to fetch — we keep a reference to it here
   via `window.InleoSkins.walletInlineCSS` if the old bootstrap sets
   it, but the canonical source is the file. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    const log = NS.logger || { log: () => { }, warn: () => { } };

    let sheet = null;

    async function ensure() {
        if (sheet) return;
        sheet = new CSSStyleSheet();
        try {
            const cssUrl = chrome.runtime.getURL('styles/wallet.css');
            const res = await fetch(cssUrl);
            const text = await res.text();
            sheet.replaceSync(text);
        } catch (err) {
            log.warn('wallet', 'failed to load styles/wallet.css', err);
            if (typeof NS.walletInlineCSS === 'string') {
                sheet.replaceSync(NS.walletInlineCSS);
            }
        }
        if (!document.adoptedStyleSheets.includes(sheet)) {
            document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        }
    }

    NS.walletStyles = { ensure };
})();
