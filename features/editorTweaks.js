/* features/editorTweaks.js — Always-on stylesheet that hides unwanted
   toolbar buttons (Heading, Italic, Upload Short) across every text
   editor instance on the site.

   Uses its own constructed CSSStyleSheet so it stays applied regardless
   of which theme (if any) is active. Idempotent: load-order safe. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    if (NS._editorTweaksLoaded) return;
    NS._editorTweaksLoaded = true;

    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
        button[aria-label="Heading"] { display: none !important; }
        button[aria-label="Italic"] { display: none !important; }
        button[aria-label="Upload Short"] { display: none !important; }
    `);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
})();
