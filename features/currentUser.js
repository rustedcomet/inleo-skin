/* features/currentUser.js — Detects the currently logged-in Hive
   username from the left sidebar's "Profile" link and mirrors it into
   shared state + chrome.storage.local for the standalone wallet page. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    const state = NS.state;
    const utils = NS.utils;

    function update() {
        const nav = utils.getSidebarNav();
        if (!nav) return;

        const profileLinks = Array.from(nav.querySelectorAll('a[href^="/profile/"]'));
        const sidebarProfileLink = profileLinks.find(link => link.closest('nav') === nav);
        if (!sidebarProfileLink) return;

        const hrefParts = sidebarProfileLink.getAttribute('href').split('/profile/');
        if (hrefParts.length <= 1) return;

        const detected = hrefParts[1].toLowerCase().trim().split('/')[0].split('?')[0];
        if (detected && detected !== state.currentUser) {
            state.currentUser = detected;
            /* Persist for the standalone wallet page (wallet.html) to read. */
            try { chrome.storage.local.set({ inleo_current_user: detected }); } catch (e) { }
        }
    }

    NS.currentUser = { update };
})();
