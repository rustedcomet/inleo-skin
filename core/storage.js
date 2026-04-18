/* core/storage.js — Central storage schema for the extension.
   Every chrome.storage read/write should route through here so keys,
   defaults, and the sync-vs-local split stay consistent across modules. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    const log = NS.logger || { log: () => { }, warn: () => { }, error: () => { } };

    /* Sync storage — roams with the Chrome profile. Use for things the user
       would expect to follow them across machines. */
    const SYNC_KEYS = {
        activeTheme: 'activeTheme',         // string: 'none' | 'cyberpunk-v2' | 'gday' | 'gday-v2'
        hiveApiNode: 'hiveApiNode',         // string: Hive RPC node URL
        hashtagSettings: 'hashtagSettings', // object: { enabled, maxTags, alwaysInclude[], blockedTags[] }
        mutedPhrases: 'mutedPhrases'        // string[]: content patterns to hide (e.g. '/rafiki')
    };

    /* Local storage — stays on this machine. Use for caches, noisy data,
       and anything that can be regenerated from scratch. */
    const LOCAL_KEYS = {
        mutedUsers: 'mutedUsers',                       // string[]
        currentUser: 'inleo_current_user',              // string (cached for wallet page)
        marketCache: 'inleo_market_data_cache',         // { timestamp, data }
        walletCache: 'inleo_wallet_data_cache_v2',      // { "<user>": { data, timestamp } }
        walletCacheLegacy: 'inleo_wallet_data_cache'    // legacy single-user shape (migrated on read)
    };

    const STORAGE_KEYS = { ...SYNC_KEYS, ...LOCAL_KEYS };

    const DEFAULTS = {
        activeTheme: 'none',
        hiveApiNode: 'https://api.deathwing.me',
        hashtagSettings: {
            enabled: true,
            maxTags: 5,
            alwaysInclude: ['leofinance'],
            blockedTags: []
        },
        mutedUsers: [],
        mutedPhrases: ['/rafiki']
    };

    /* Promise wrappers around chrome.storage. Swallow errors into console so
       callers can `await` without try/catch noise. */
    function getSync(keys) {
        return new Promise(resolve => {
            try {
                chrome.storage.sync.get(keys, result => resolve(result || {}));
            } catch (e) {
                log.warn('storage', 'sync.get failed', e);
                resolve({});
            }
        });
    }
    function setSync(obj) {
        return new Promise(resolve => {
            try {
                chrome.storage.sync.set(obj, () => resolve());
            } catch (e) {
                log.warn('storage', 'sync.set failed', e);
                resolve();
            }
        });
    }
    function getLocal(keys) {
        return new Promise(resolve => {
            try {
                chrome.storage.local.get(keys, result => resolve(result || {}));
            } catch (e) {
                log.warn('storage', 'local.get failed', e);
                resolve({});
            }
        });
    }
    function setLocal(obj) {
        return new Promise(resolve => {
            try {
                chrome.storage.local.set(obj, () => resolve());
            } catch (e) {
                log.warn('storage', 'local.set failed', e);
                resolve();
            }
        });
    }

    /* Convenience readers with defaults applied. */
    async function getActiveTheme() {
        const r = await getSync([SYNC_KEYS.activeTheme]);
        return r[SYNC_KEYS.activeTheme] || DEFAULTS.activeTheme;
    }
    async function getHiveApiNode() {
        const r = await getSync({ [SYNC_KEYS.hiveApiNode]: DEFAULTS.hiveApiNode });
        return r[SYNC_KEYS.hiveApiNode];
    }
    async function getHashtagSettings() {
        const r = await getSync([SYNC_KEYS.hashtagSettings]);
        const saved = r[SYNC_KEYS.hashtagSettings] || {};
        // Merge saved over defaults so new fields always have sensible values.
        return { ...DEFAULTS.hashtagSettings, ...saved };
    }
    async function setHashtagSettings(partial) {
        const current = await getHashtagSettings();
        const next = { ...current, ...partial };
        await setSync({ [SYNC_KEYS.hashtagSettings]: next });
        return next;
    }
    async function getMutedUsers() {
        const r = await getLocal({ [LOCAL_KEYS.mutedUsers]: [] });
        return r[LOCAL_KEYS.mutedUsers] || [];
    }
    async function getMutedPhrases() {
        const r = await getSync({ [SYNC_KEYS.mutedPhrases]: DEFAULTS.mutedPhrases });
        return r[SYNC_KEYS.mutedPhrases] || DEFAULTS.mutedPhrases;
    }

    NS.storage = {
        SYNC_KEYS, LOCAL_KEYS, STORAGE_KEYS, DEFAULTS,
        getSync, setSync, getLocal, setLocal,
        getActiveTheme, getHiveApiNode,
        getHashtagSettings, setHashtagSettings,
        getMutedUsers, getMutedPhrases
    };
})();
