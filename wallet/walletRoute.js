/* wallet/walletRoute.js — The wallet feature's controller.

   Ties together the cache, view, render, modal, and route controller
   modules. Owns the "is wallet open?" state and the render-token guard
   that keeps stale fetches from clobbering the UI after navigation.

   Also installs the document-level click interceptor that catches
   wallet links before Next.js can navigate to them. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    const log = NS.logger || { log: () => { }, warn: () => { } };
    const state = NS.state;
    const api = NS.walletApi;
    const cache = NS.walletCache;
    const view = NS.walletView;
    const render = NS.walletRender;
    const modal = NS.walletModal;
    const styles = NS.walletStyles;
    const route = NS.route;

    let active = false;
    let accountData = null;
    let user = null;
    let originalMain = null;
    /* Bumped on every load() start; stale fetches that finish after a
       navigation or switch are dropped silently. */
    let renderToken = 0;

    function isWalletPath(path) {
        return /\/wallet(\/|$|\?)/.test(path || window.location.pathname);
    }

    function extractUserFromPath() {
        const m = window.location.pathname.match(/^\/([^/]+)\/wallet/);
        return m ? m[1].toLowerCase() : null;
    }

    function resolveUser() {
        return (state && state.currentUser) || extractUserFromPath();
    }

    async function open() {
        if (active) return;

        const username = resolveUser();
        if (!username) {
            log.warn('wallet', 'no username yet, retrying in 1s');
            setTimeout(open, 1000);
            return;
        }

        if (!view.getCenterMain()) {
            log.warn('wallet', 'center main not found, retrying in 500ms');
            setTimeout(open, 500);
            return;
        }

        await styles.ensure();

        user = username;
        active = true;
        renderToken++;

        const mounted = view.mount(username);
        if (!mounted) {
            active = false;
            return;
        }
        originalMain = mounted.original;

        wireEvents(username);

        load(username, false, renderToken);
        log.log('wallet', 'opened for', username);
    }

    function close() {
        if (!active) return;
        active = false;
        accountData = null;
        user = null;
        renderToken++;
        view.unmount(originalMain);
        originalMain = null;
        log.log('wallet', 'closed');
    }

    function wireEvents(username) {
        const byId = id => document.getElementById(id);

        byId('wlt-refresh')?.addEventListener('click', () => {
            renderToken++;
            load(user || username, true, renderToken);
        });

        const doSearch = () => {
            const q = byId('wlt-search')?.value.trim().toLowerCase().replace('@', '');
            if (!q) return;
            user = q;
            renderToken++;
            const lbl = byId('wlt-label');
            if (lbl) lbl.textContent = '@' + q;
            byId('wlt-search').value = '';
            render.resetPlaceholders();
            load(q, false, renderToken);
        };
        byId('wlt-go')?.addEventListener('click', doSearch);
        byId('wlt-search')?.addEventListener('keypress', e => { if (e.key === 'Enter') doSearch(); });

        byId('wlt-deleg-btn')?.addEventListener('click', () => {
            if (accountData) modal.showDelegations(user || username, accountData);
        });
    }

    async function load(u, force, token) {
        const startToken = token != null ? token : renderToken;
        const isStale = () => !active || startToken !== renderToken || u !== (user || u);

        const ec = document.getElementById('wlt-errors');
        if (ec) ec.innerHTML = '';
        if (force) render.resetPlaceholders();

        try {
            let data = null;
            if (!force) data = await cache.get(u);
            if (!data) {
                data = await api.fetchAccount(u);
                await cache.set(u, data);
            }
            if (isStale()) return;
            accountData = data;
            render.renderAccount(data);
        } catch (err) {
            if (isStale()) return;
            if (ec) {
                ec.innerHTML = `<div class="wlt-error">${err.message}<br><button class="wlt-error-retry" id="wlt-retry">Retry</button></div>`;
            }
            document.getElementById('wlt-retry')?.addEventListener('click', () => {
                renderToken++;
                load(u, true, renderToken);
            });
        }

        api.fetchHiveEngineTokens(u).then(tokens => {
            if (isStale()) return;
            render.renderHiveEngineTokens(tokens, accountData);
        });
    }

    /* Document-level click interceptor — the fast, synchronous first line
       of defense against Next.js navigating to /wallet before we can
       react. The route controller catches keyboard nav / popstate. */
    document.addEventListener('click', (e) => {
        let target = e.target;
        for (let i = 0; i < 10; i++) {
            if (!target || target === document.body) break;
            if (target.tagName === 'A') {
                const href = target.getAttribute('href') || '';
                if (href.includes('/wallet')) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    open();
                    return;
                }
                /* Any other nav link while open → let Inleo navigate, but
                   tear down the wallet first so the feed restores cleanly. */
                if (active) {
                    close();
                    return;
                }
            }
            target = target.parentElement;
        }
    }, true);

    function handleRouteChange() {
        if (isWalletPath()) {
            if (!active) {
                const tryOpen = () => {
                    if (view.getCenterMain()) open();
                    else setTimeout(tryOpen, 500);
                };
                tryOpen();
            }
        } else if (active) {
            close();
        }
    }

    if (route) route.subscribe(handleRouteChange);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', handleRouteChange);
    } else {
        handleRouteChange();
    }

    NS.walletRoute = { open, close, isWalletPath };
})();
