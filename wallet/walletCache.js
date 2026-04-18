/* wallet/walletCache.js — Per-user wallet cache.

   Shape:
       { "<username>": { data: <processed>, timestamp: <ms> }, ... }

   Replaces the legacy single-slot key that overwrote your own wallet
   every time you searched another user. Up to 10 users are retained
   (LRU by timestamp). Legacy single-slot data is read once, honored
   if it happens to match the current user, then removed on first load. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});

    const W_CACHE_KEY_LEGACY = 'inleo_wallet_data_cache';
    const W_CACHE_KEY = 'inleo_wallet_data_cache_v2';
    const W_CACHE_TTL = 5 * 60 * 1000;
    const MAX_USERS = 10;

    function get(u) {
        return new Promise(resolve => {
            chrome.storage.local.get([W_CACHE_KEY, W_CACHE_KEY_LEGACY], res => {
                const map = res[W_CACHE_KEY] || {};
                const entry = map[u];
                if (entry && entry.data && Date.now() - entry.timestamp < W_CACHE_TTL) {
                    return resolve(entry.data);
                }
                /* Legacy migration: honor the old single-slot record once
                   if it happens to match the current user. */
                const legacy = res[W_CACHE_KEY_LEGACY];
                if (legacy && legacy.u === u && legacy.d && Date.now() - legacy.t < W_CACHE_TTL) {
                    return resolve(legacy.d);
                }
                resolve(null);
            });
        });
    }

    function set(u, d) {
        return new Promise(resolve => {
            chrome.storage.local.get([W_CACHE_KEY], res => {
                const map = res[W_CACHE_KEY] || {};
                map[u] = { data: d, timestamp: Date.now() };
                /* Soft LRU cap — prevents local storage growing unbounded
                   if someone spelunks through many accounts. */
                const entries = Object.entries(map)
                    .sort((a, b) => b[1].timestamp - a[1].timestamp)
                    .slice(0, MAX_USERS);
                const trimmed = Object.fromEntries(entries);
                chrome.storage.local.set({ [W_CACHE_KEY]: trimmed }, resolve);
            });
        });
    }

    /* One-shot cleanup of the legacy single-slot key. */
    try { chrome.storage.local.remove(W_CACHE_KEY_LEGACY); } catch (e) { }

    NS.walletCache = { get, set, KEY: W_CACHE_KEY, TTL: W_CACHE_TTL };
})();
