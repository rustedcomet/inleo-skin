/* features/sidebarCleanup.js — Hides opinionated left-nav + right-rail
   sections that aren't relevant for our users. Runs idempotently: a
   section that's already been marked hidden stays hidden but isn't
   touched again. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    const utils = NS.utils;

    const LEFT_MENU_ITEMS_TO_HIDE = new Set([
        'leodex',
        'perps',
        'predict',
        'auto vote',
        'hivepro'
    ]);
    const RIGHT_COLUMN_SECTIONS_TO_HIDE = new Set([
        'who to follow',
        'portfolio',
        'leo tokenomics'
    ]);

    function hideLeftMenuItems() {
        const nav = utils.getSidebarNav();
        if (!nav) return;

        nav.querySelectorAll('a, button').forEach(link => {
            const label = utils.normalizeSidebarLabel(link.textContent || link.getAttribute('title'));
            if (!LEFT_MENU_ITEMS_TO_HIDE.has(label)) return;

            const container = utils.getNavItemContainer(link, nav);
            utils.markElementHidden(container, 'left-nav');
        });
    }

    function hideRightColumnSections() {
        const candidates = document.querySelectorAll(
            'aside h1, aside h2, aside h3, aside h4, aside h5, aside h6, aside strong, aside span, aside p, aside div'
        );

        candidates.forEach(node => {
            if (!node || node.children.length > 0) return;

            const label = utils.normalizeSidebarLabel(node.textContent);
            if (!RIGHT_COLUMN_SECTIONS_TO_HIDE.has(label)) return;

            const card = utils.findRightRailCardContainer(node);
            utils.markElementHidden(card, 'right-rail');
        });
    }

    function hideAll() {
        hideLeftMenuItems();
        hideRightColumnSections();
    }

    NS.sidebarCleanup = { hideAll };
})();
