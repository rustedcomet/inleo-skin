/* core/state.js — Shared mutable state exposed on window.InleoSkins.state.
   Modules read/write these fields instead of keeping their own globals, so
   when one module learns something (e.g. the current user) every other
   module sees it immediately. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});

    NS.state = NS.state || {
        /* Theme tracking — owned by content.js / theme feature. */
        currentThemeSheet: null,
        currentThemeName: null,

        /* User tracking — owned by currentUser feature, consumed by wallet
           and any other user-scoped feature. */
        currentUser: null,

        /* Mute list — kept in memory to avoid hitting chrome.storage on
           every MutationObserver tick. */
        mutedUsers: [],

        /* Editor tweaks + debounce guards. */
        _processFeedTimer: null,
        _isProcessingFeed: false,
        _sidebarCleanupTimer: null
    };
})();
