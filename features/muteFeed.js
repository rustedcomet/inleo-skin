/* features/muteFeed.js — Mute-user + mute-phrase feature.

   Responsibilities:
   - Inject a `[ mute ]` button next to every username in the feed.
   - Hide posts from users in the muted list (class `inleo-muted-post`
     on the outer row; CSS hides it).
   - Hide posts whose text matches any muted phrase (content-based
     filtering, e.g. "/rafiki" hides all Rafiki bot commands without
     muting the posting user). Uses class `inleo-phrase-muted`.
   - Keep the in-memory mutedUsers + mutedPhrases lists in sync with
     chrome.storage.
   - Drive the MutationObserver that catches infinite-scroll posts.

   Avatar marker passes piggy-back on processFeed() for efficiency
   (single querySelectorAll pass over the feed area). */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    const log = NS.logger || { log: () => { }, warn: () => { } };
    const state = NS.state;
    const utils = NS.utils;
    const scheduler = NS.scheduler;

    /* Base CSS for muted posts — ensures hiding works even when no theme
       is active (theme CSS also declares these for consistency). */
    const muteSheet = new CSSStyleSheet();
    muteSheet.replaceSync(`
        .inleo-muted-post,
        .inleo-phrase-muted {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
        }
    `);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, muteSheet];

    function getPrimaryProfileLinks(feedArea) {
        return Array.from(feedArea.querySelectorAll('a[href^="/profile/"]')).filter(link => {
            if (utils.isInsidePopupOrCard(link)) return false;
            /* Only inject on the primary bold name link in post headers,
               not avatar-only links and not @mentions inside <p>. */
            if (!link.classList.contains('font-bold') && !link.className.includes('font-bold')) return false;
            if (link.closest('p')) return false;
            return true;
        });
    }

    function getUsernameFromLink(link) {
        const href = link.getAttribute('href') || '';
        const hrefParts = href.split('/profile/');
        if (hrefParts.length < 2) return '';
        return hrefParts[1].toLowerCase().trim().split('/')[0].split('?')[0];
    }

    function getPostOuterWrapper(link) {
        let postContainer = link.closest('div.cursor-pointer');
        if (!postContainer) {
            let parent = link.parentElement;
            for (let i = 0; i < 6; i++) {
                if (!parent) break;
                if (parent.tagName === 'DIV' && parent.classList.contains('cursor-pointer')) {
                    postContainer = parent;
                    break;
                }
                parent = parent.parentElement;
            }
        }

        if (!postContainer) return null;
        return link.closest('.relative.min-h-px')
            || postContainer.closest('.relative.min-h-px')
            || postContainer.parentElement
            || null;
    }

    function processFeed() {
        const mutedUsers = state.mutedUsers || [];

        /* 1) Unhide any `.inleo-muted-post` whose user is no longer muted. */
        document.querySelectorAll('.inleo-muted-post').forEach(el => {
            const link = el.querySelector('a[href^="/profile/"]');
            if (link) {
                const href = link.getAttribute('href');
                const parts = href.split('/profile/');
                const user = parts.length > 1
                    ? parts[1].toLowerCase().trim().split('/')[0].split('?')[0]
                    : '';
                if (!mutedUsers.includes(user)) {
                    el.classList.remove('inleo-muted-post');
                }
            } else {
                el.classList.remove('inleo-muted-post');
            }
        });

        /* 2) Remove orphaned mute buttons (no wrapper, or inside popups). */
        document.querySelectorAll('.inleo-mute-btn').forEach(btn => {
            const wrapper = btn.closest('.inleo-mute-wrapper');
            if (!wrapper || utils.isInsidePopupOrCard(btn)) {
                if (wrapper) wrapper.remove();
                else btn.remove();
            }
        });

        /* 3) Walk all profile links in the feed and either hide or inject
              a mute button, depending on whether the user is muted. */
        const feedArea = document.querySelector('main#threads') || document.body;
        const profileLinks = getPrimaryProfileLinks(feedArea);

        profileLinks.forEach(link => {
            const username = getUsernameFromLink(link);
            if (!username) return;

            const outerWrapper = getPostOuterWrapper(link);
            if (!outerWrapper) return;

            if (mutedUsers.includes(username)) {
                outerWrapper.classList.add('inleo-muted-post');
            } else {
                injectMuteButton(link, username);
            }
        });

        /* 4) Content-based phrase filtering — hide posts whose text body
              matches any pattern in the mutedPhrases list. This runs
              independently of user muting; the user is NOT muted, just
              this specific post is hidden. */
        const mutedPhrases = (state.mutedPhrases || []).map(p => p.toLowerCase());
        const seenPhraseTargets = new Set();

        profileLinks.forEach(link => {
            const outer = getPostOuterWrapper(link);
            if (!outer || seenPhraseTargets.has(outer)) return;
            seenPhraseTargets.add(outer);

            /* Skip posts already hidden by user-mute. */
            if (outer.classList.contains('inleo-muted-post')) {
                outer.classList.remove('inleo-phrase-muted');
                return;
            }

            if (mutedPhrases.length === 0) {
                outer.classList.remove('inleo-phrase-muted');
                return;
            }

            /* Use the full thread row text instead of only <p> tags so
               command-only posts like "/rafiki spin" are still detected
               even if the site changes the body markup. */
            const postText = (outer.textContent || '').toLowerCase();
            const matched = mutedPhrases.some(phrase => phrase && postText.includes(phrase));
            if (matched) {
                outer.classList.add('inleo-phrase-muted');
            } else {
                outer.classList.remove('inleo-phrase-muted');
            }
        });

        if (mutedPhrases.length === 0) {
            document.querySelectorAll('.inleo-phrase-muted').forEach(el => {
                if (!seenPhraseTargets.has(el)) el.classList.remove('inleo-phrase-muted');
            });
        }

        /* 5) Avatar outlining pass — piggy-backs on the same feed tick to
              avoid an extra full-page scan. */
        if (NS.avatarMarkers) NS.avatarMarkers.markAll();
    }

    function injectMuteButton(link, username) {
        const parent = link.parentElement;
        if (!parent) return;
        if (parent.querySelector('.inleo-mute-btn')) return;

        const muteBtn = document.createElement('button');
        muteBtn.className = 'inleo-mute-btn';
        muteBtn.textContent = '[ mute ]';
        muteBtn.title = `Mute ${username}`;

        muteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            muteUser(username);
        });

        const wrapper = document.createElement('span');
        wrapper.className = 'inleo-mute-wrapper';
        wrapper.appendChild(muteBtn);
        parent.appendChild(wrapper);
    }

    function muteUser(username) {
        const mutedUsers = state.mutedUsers || [];
        if (mutedUsers.includes(username)) return;
        mutedUsers.push(username);
        state.mutedUsers = mutedUsers;
        /* Hide immediately for responsive UI, then persist. */
        processFeed();
        chrome.storage.local.set({ mutedUsers }, () => {
            log.log('mute', 'muted user:', username);
        });
    }

    /* ----- Bootstrapping + observer ----- */

    function loadInitial() {
        let pendingLoads = 2;
        const finishLoad = () => {
            pendingLoads -= 1;
            if (pendingLoads === 0) scheduler.processFeed(processFeed, 100);
        };

        chrome.storage.local.get({ mutedUsers: [] }, (result) => {
            state.mutedUsers = result.mutedUsers || [];
            finishLoad();
        });
        chrome.storage.sync.get({ mutedPhrases: ['/rafiki'] }, (result) => {
            state.mutedPhrases = result.mutedPhrases || ['/rafiki'];
            finishLoad();
        });
    }

    /* Live updates from the options page or the wallet page. */
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.mutedUsers) {
            state.mutedUsers = changes.mutedUsers.newValue || [];
            scheduler.processFeed(processFeed, 100);
        }
        if (area === 'sync' && changes.mutedPhrases) {
            state.mutedPhrases = changes.mutedPhrases.newValue || [];
            scheduler.processFeed(processFeed, 100);
        }
    });

    const feedObserver = new MutationObserver((mutations) => {
        if (state._isProcessingFeed) return;

        let shouldProcess = false;
        for (const mutation of mutations) {
            if (mutation.addedNodes.length === 0) continue;
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1 && !node.classList?.contains('inleo-mute-wrapper')) {
                    shouldProcess = true;
                    break;
                }
            }
            if (shouldProcess) break;
        }

        if (shouldProcess) {
            scheduler.sidebarCleanup(() => NS.sidebarCleanup && NS.sidebarCleanup.hideAll(), 150);
            scheduler.processFeed(processFeed, 150);
        }
    });

    function startObserver() {
        try {
            feedObserver.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true
            });
        } catch (e) {
            log.warn('mute', 'could not attach feed observer', e);
        }
    }

    NS.muteFeed = {
        processFeed,
        loadInitial,
        startObserver,
        /* Exposed so the backup watchdog in content.js can re-attach if
           the SPA ever detaches the observer entirely. */
        reattach: () => {
            try {
                feedObserver.observe(document.body || document.documentElement, {
                    childList: true,
                    subtree: true
                });
            } catch (e) { /* already observing */ }
        }
    };
})();
