/* core/utils.js — Small, pure-ish DOM + string helpers shared by every
   feature module. Extracted verbatim from the monolithic content.js so
   behavior is preserved; only the location changed. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});

    function normalizeSidebarLabel(text) {
        return (text || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function getSidebarNav() {
        return Array.from(document.querySelectorAll('nav')).find(nav => {
            const className = typeof nav.className === 'string' ? nav.className : '';
            return className.includes('sm:flex') && className.includes('hidden');
        }) || document.querySelector('nav');
    }

    function getNavItemContainer(node, nav) {
        if (!node || !nav) return null;
        let current = node;
        while (current.parentElement && current.parentElement !== nav) {
            const parent = current.parentElement;
            const interactiveCount = parent.querySelectorAll('a, button').length;
            if (interactiveCount > 1) break;
            current = parent;
        }
        return current;
    }

    function findRightRailCardContainer(node) {
        let current = node;
        let bestCandidate = null;
        while (current && current !== document.body) {
            if (current.matches?.('aside, main, nav')) break;
            const className = typeof current.className === 'string' ? current.className : '';
            const isColumnWrapper = /\bsticky\b|top-0|max-w-\[|tbl:block|gap-y-3/.test(className);
            if (isColumnWrapper) break;
            const isCardContainer = /(widget-card-wallet|tokenomics-card|rounded-xl|rounded-2xl|overflow-hidden|shadow|border)/.test(className);
            if (isCardContainer) bestCandidate = current;
            current = current.parentElement;
        }
        return bestCandidate || node.parentElement;
    }

    function markElementHidden(element, reason) {
        if (!element) return;
        if (element.dataset.inleoHiddenBy === reason) return;
        element.dataset.inleoHiddenBy = reason;
        element.style.setProperty('display', 'none', 'important');
    }

    /* True if `el` is rendered inside a Radix popup / tooltip / hover card
       or any absolutely-positioned overlay that isn't the main feed or nav.
       Avoids getComputedStyle() for scroll-time cheapness. */
    function isInsidePopupOrCard(el) {
        let ancestor = el;
        for (let i = 0; i < 15; i++) {
            ancestor = ancestor.parentElement;
            if (!ancestor || ancestor === document.body) break;
            if (ancestor.hasAttribute('data-radix-popper-content-wrapper')) return true;
            const role = ancestor.getAttribute('role');
            if (role === 'tooltip' || role === 'dialog') return true;
            if (ancestor.id && ancestor.id.startsWith('radix-')) return true;
            const cls = ancestor.className || '';
            if (cls.includes('shadow-[') && cls.includes('text-xs')) return true;
            const style = ancestor.getAttribute('style') || '';
            if (style.includes('position') && (style.includes('fixed') || style.includes('absolute'))) {
                if (!ancestor.closest('nav') && !ancestor.closest('main#threads')) return true;
            }
        }
        return false;
    }

    NS.utils = {
        normalizeSidebarLabel,
        getSidebarNav,
        getNavItemContainer,
        findRightRailCardContainer,
        markElementHidden,
        isInsidePopupOrCard
    };
})();
