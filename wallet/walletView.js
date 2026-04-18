/* wallet/walletView.js — Builds the wallet container HTML and manages
   activation / deactivation (swap-in / swap-out of the center main).

   The wallet deliberately hides the existing center <main> rather than
   cloning it — that way the sidebars keep their own layout untouched
   and restoring the feed is a one-line `display: ''`. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    const log = NS.logger || { log: () => { }, warn: () => { } };

    const CONTAINER_ID = 'inleo-wallet-container';

    function getCenterMain() {
        /* Inleo DOM: body > div > [header, aside(left), main(outer) > [main(center), aside(right)]]. */
        const outerMain = document.querySelector('body > div > main');
        return outerMain?.querySelector(':scope > main');
    }

    function buildHTML(username) {
        const ph = '---';
        return `
<div class="wlt-inner">
    <div class="wlt-header">
        <h2 class="wlt-title">Wallet</h2>
        <span class="wlt-user" id="wlt-label">@${username}</span>
        <div class="wlt-actions">
            <input type="text" class="wlt-search" id="wlt-search" placeholder="View another account..." />
            <button class="wlt-btn" id="wlt-go">Go</button>
            <button class="wlt-btn wlt-refresh" id="wlt-refresh" title="Refresh">&#8635;</button>
        </div>
    </div>
    <div id="wlt-errors"></div>

    <div class="wlt-section">
        <div class="wlt-token-row">
            <div class="wlt-token-left">
                <div class="wlt-token-icon wlt-icon-hive">H</div>
                <span class="wlt-token-name">HIVE</span>
            </div>
            <span class="wlt-token-bal" id="w-hive">${ph}</span>
        </div>
        <div class="wlt-token-desc">Hive's primary token</div>
        <div class="wlt-sub">
            <div class="wlt-sub-head">
                <div class="wlt-sub-name-row">
                    <span class="wlt-sub-name">Staked HIVE</span>
                    <span class="wlt-badge wlt-more">MORE &#9662;</span>
                </div>
                <div class="wlt-sub-right">
                    <span class="wlt-sub-bal" id="w-hp">${ph}</span>
                    <span class="wlt-sub-detail" id="w-hp-tot">Tot: ---</span>
                </div>
            </div>
            <div class="wlt-sub-desc">Also known as HP or Hive Power. Powers governance, voting and rewards.</div>
            <div class="wlt-sub-desc">Increases the more effectively you vote on posts: <span class="wlt-badge wlt-apr" id="w-hp-apr">${ph}</span></div>
        </div>
        <div class="wlt-sub wlt-sub-last">
            <div class="wlt-sub-head">
                <span class="wlt-sub-name">Delegated HIVE</span>
                <div class="wlt-sub-right">
                    <span class="wlt-sub-bal" id="w-deleg">${ph}</span>
                    <button class="wlt-details-btn" id="wlt-deleg-btn">&#128269; DETAILS</button>
                </div>
            </div>
            <div class="wlt-sub-desc">Staked tokens delegated between users.</div>
        </div>
    </div>

    <div class="wlt-section">
        <div class="wlt-token-row">
            <div class="wlt-token-left">
                <div class="wlt-token-icon wlt-icon-hbd">$</div>
                <span class="wlt-token-name">HBD</span>
            </div>
            <span class="wlt-token-bal" id="w-hbd">${ph}</span>
        </div>
        <div class="wlt-token-desc">US dollar pegged token backed by HIVE</div>
        <div class="wlt-sub wlt-sub-last">
            <div class="wlt-sub-head">
                <span class="wlt-sub-name">Staked HBD</span>
                <div class="wlt-sub-right">
                    <span class="wlt-sub-bal" id="w-hbd-sav">${ph}</span>
                </div>
            </div>
            <div class="wlt-sub-desc">When staked in this "savings account" it receives interest: <span class="wlt-badge wlt-apr" id="w-hbd-apr">${ph}</span></div>
        </div>
    </div>

    <div class="wlt-section wlt-estimate">
        <div class="wlt-est-row">
            <div>
                <span class="wlt-est-label">Estimated Account Value</span>
                <div class="wlt-est-desc">USD value of all Hive tokens in your wallet.</div>
            </div>
            <span class="wlt-est-val" id="w-est">${ph}</span>
        </div>
    </div>

    <div class="wlt-he-title">Hive Engine Tokens</div>
    <div class="wlt-he-grid" id="wlt-he-grid">
        <div class="wlt-he-loading">Loading tokens...</div>
    </div>

    <div class="wlt-section wlt-estimate wlt-total-estimate">
        <div class="wlt-est-row">
            <div>
                <span class="wlt-est-label">Estimated Total Account Value</span>
                <div class="wlt-est-desc">HIVE + HBD + Hive Engine tokens combined.</div>
            </div>
            <span class="wlt-est-val" id="w-total-est">${ph}</span>
        </div>
    </div>

    <div class="wlt-footer">Powered by Inleo Skins Extension &middot; Data from Hive Blockchain</div>
</div>`;
    }

    /* Internal mount / unmount — the higher-level open/close lives in
       walletRoute.js and calls these. */
    function mount(username) {
        const centerMain = getCenterMain();
        if (!centerMain) return null;

        centerMain.style.display = 'none';

        const walletEl = document.createElement('div');
        walletEl.id = CONTAINER_ID;
        walletEl.className = centerMain.className;
        walletEl.innerHTML = buildHTML(username);

        centerMain.parentElement.insertBefore(walletEl, centerMain);
        window.scrollTo(0, 0);
        log.log('wallet', 'mounted for', username);
        return { container: walletEl, original: centerMain };
    }

    function unmount(original) {
        const wc = document.getElementById(CONTAINER_ID);
        if (wc) wc.remove();
        if (original) original.style.display = '';
        /* Dismiss any open modal. */
        const modal = document.getElementById('wlt-modal');
        if (modal) modal.remove();
        log.log('wallet', 'unmounted');
    }

    NS.walletView = {
        CONTAINER_ID,
        getCenterMain,
        buildHTML,
        mount,
        unmount
    };
})();
