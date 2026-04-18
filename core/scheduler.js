/* core/scheduler.js — Debounced schedulers that prevent the
   MutationObserver -> DOM change -> MutationObserver feedback loop
   that caused scroll jank in earlier versions. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    const state = NS.state;

    /* Generic single-shot debouncer: if a timer is already armed, drop the
       new call. The original run will still fire and pick up whatever
       state is current when it does. */
    function debounceOnce(key, fn, delay) {
        if (state[key]) return;
        state[key] = setTimeout(() => {
            state[key] = null;
            fn();
        }, delay);
    }

    NS.scheduler = {
        /* Schedule processFeed() — the mute/avatar/profile-link pass. */
        processFeed(fn, delay = 200) {
            debounceOnce('_processFeedTimer', () => {
                if (state._isProcessingFeed) return;
                state._isProcessingFeed = true;
                try { fn(); } finally { state._isProcessingFeed = false; }
            }, delay);
        },
        /* Schedule hideUnwantedSidebarSections(). Cheap but not free, so we
           still coalesce bursty observer traffic. */
        sidebarCleanup(fn, delay = 150) {
            debounceOnce('_sidebarCleanupTimer', fn, delay);
        }
    };
})();
