/* features/theme.js — Applies a theme by loading its CSS file into a
   constructed CSSStyleSheet and attaching it to document.adoptedStyleSheets.

   Adopted sheets survive Next.js SPA navigation — we don't need a
   MutationObserver watching <link> tags. We do still poll (via the
   content.js watchdog) to re-attach on bfcache restore / hard wipes,
   and to reset the data-inleo-skin attribute SPA mutations sometimes
   strip.

   The `--bg-image` custom property is reset on every apply so the
   previous theme's background doesn't leak through. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    const log = NS.logger || { log: () => { }, error: () => { } };
    const state = NS.state;

    function injectFontLink(url, index) {
        const id = `inleo-skin-font-${index}`;
        if (document.getElementById(id)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        link.id = id;
        (document.head || document.documentElement).appendChild(link);
    }

    function removeFontLinks() {
        document.querySelectorAll('link[id^="inleo-skin-font-"]').forEach(el => el.remove());
    }

    async function apply(themeName) {
        /* "none" (or a falsy value) — detach and clean up. */
        if (!themeName || themeName === 'none') {
            if (state.currentThemeSheet) {
                document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== state.currentThemeSheet);
            }
            state.currentThemeSheet = null;
            state.currentThemeName = null;
            document.documentElement.removeAttribute('data-inleo-skin');
            document.documentElement.style.removeProperty('--bg-image');
            if (NS.marketTicker) NS.marketTicker.remove();
            removeFontLinks();
            return;
        }

        document.documentElement.setAttribute('data-inleo-skin', themeName);
        document.documentElement.style.setProperty('--bg-image', '');

        try {
            const cssUrl = chrome.runtime.getURL(`themes/${themeName}.css`);
            const response = await fetch(cssUrl);
            const cssText = await response.text();

            /* @import rules don't work inside constructed stylesheets, so
               we pull them out and inject them as <link> tags. */
            const importRegex = /@import\s+url\(['"]?([^'")\s]+)['"]?\)\s*;?/g;
            let match;
            let fontIndex = 0;
            while ((match = importRegex.exec(cssText)) !== null) {
                injectFontLink(match[1], fontIndex++);
            }
            const strippedCss = cssText.replace(importRegex, '');

            if (!state.currentThemeSheet) {
                state.currentThemeSheet = new CSSStyleSheet();
            }
            state.currentThemeSheet.replaceSync(strippedCss);

            if (!document.adoptedStyleSheets.includes(state.currentThemeSheet)) {
                document.adoptedStyleSheets = [...document.adoptedStyleSheets, state.currentThemeSheet];
            }

            state.currentThemeName = themeName;
            log.log('theme', 'applied via adoptedStyleSheets:', themeName);
        } catch (err) {
            log.error('theme', 'failed to apply', err);
        }

        if (NS.marketTicker && NS.marketTicker.themeUsesTicker(themeName)) {
            NS.marketTicker.waitAndInject();
        } else if (NS.marketTicker) {
            NS.marketTicker.remove();
        }
    }

    NS.theme = { apply, injectFontLink, removeFontLinks };
})();
