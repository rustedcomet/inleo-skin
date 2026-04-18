/* core/routeController.js — Single source of truth for SPA navigation.
   Next.js uses history.pushState / replaceState for route changes and
   those don't fire a `popstate` event, so any feature that wants to
   react to "user just navigated" needs to be notified some other way.

   This module monkey-patches pushState + replaceState once, listens for
   popstate, and re-broadcasts every navigation through a subscribe()
   callback list. Multiple features can subscribe; each gets the new
   pathname + a render token they can stash to detect stale async work. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    if (NS.route) return; // idempotent — guard against double-load

    const log = NS.logger || { log: () => { } };
    const subscribers = new Set();
    let renderToken = 0;
    let lastPath = window.location.pathname;

    function emit(reason) {
        const path = window.location.pathname;
        // Always bump the token — even for same-path pushes, features may
        // want to treat a manual refresh as "drop anything in-flight".
        renderToken++;
        const detail = { path, prevPath: lastPath, reason, token: renderToken };
        lastPath = path;
        subscribers.forEach(cb => {
            try { cb(detail); } catch (e) { log.log('route', 'subscriber threw', e); }
        });
    }

    /* Patch pushState/replaceState — call the original first so the URL bar
       and history are in the correct state before subscribers react. */
    const origPush = history.pushState;
    history.pushState = function (...args) {
        const ret = origPush.apply(this, args);
        emit('pushState');
        return ret;
    };
    const origReplace = history.replaceState;
    history.replaceState = function (...args) {
        const ret = origReplace.apply(this, args);
        emit('replaceState');
        return ret;
    };
    window.addEventListener('popstate', () => emit('popstate'));

    NS.route = {
        /* Subscribe to route changes. Returns an unsubscribe function. */
        subscribe(cb) {
            subscribers.add(cb);
            return () => subscribers.delete(cb);
        },
        /* Current render token. Features can capture this before starting
           an async fetch and compare on completion — if it's changed, the
           user has navigated and the work should be discarded. */
        getToken() { return renderToken; },
        /* Force a re-broadcast — useful if a feature mounted late and
           wants to run its route handler for the current URL. */
        replay(reason = 'replay') { emit(reason); }
    };
})();
