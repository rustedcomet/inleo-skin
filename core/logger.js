/* core/logger.js — single debug flag + namespaced console logger.
   Exposed as window.InleoSkins.logger so every subsystem shares one flag. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});

    // Flip to true during development. In production this stays off so the
    // extension stays quiet in the host page console.
    const DEBUG = false;

    function log(scope, ...args) {
        if (DEBUG) console.log(`[Inleo Skins:${scope}]`, ...args);
    }

    function warn(scope, ...args) {
        console.warn(`[Inleo Skins:${scope}]`, ...args);
    }

    function error(scope, ...args) {
        console.error(`[Inleo Skins:${scope}]`, ...args);
    }

    NS.logger = { DEBUG, log, warn, error };
})();
