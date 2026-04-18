/* wallet/walletRender.js — Fills wallet DOM cells with data.

   Split from walletView so the view (layout) and render (data binding)
   can evolve independently. Render functions are pure DOM writes — no
   fetches, no state beyond the passed-in data. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});

    function fmt(n, d = 3) {
        if (n == null || isNaN(n)) return '---';
        return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    }

    function renderAccount(d) {
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        set('w-hive', fmt(d.hive));
        set('w-hp', fmt(d.hp.eff));
        set('w-hp-tot', 'Tot: ' + fmt(d.hp.tot));
        set('w-hp-apr', '~' + d.hpAprMin.toFixed(2) + ' - ' + d.hpAprMax.toFixed(2) + '%');
        set('w-deleg', fmt(d.net));
        set('w-hbd', fmt(d.hbd));
        set('w-hbd-sav', fmt(d.savHBD));
        set('w-hbd-apr', d.hbdRate.toFixed(2) + '%');

        chrome.storage.local.get(['inleo_market_data_cache'], r => {
            const mc = r.inleo_market_data_cache;
            const p = mc?.data?.hive?.usd || 0;
            const usd = (d.hive + d.savHive + d.hp.own) * p + d.hbd + d.savHBD;
            const el = document.getElementById('w-est');
            if (!el) return;
            if (p > 0) {
                el.textContent = '$' + usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else {
                el.textContent = 'Price unavailable';
                el.style.fontSize = '14px';
            }
        });
    }

    function renderHiveEngineTokens(tokens, accountData) {
        const grid = document.getElementById('wlt-he-grid');
        if (!grid) return;

        if (tokens.length === 0) {
            grid.innerHTML = '<div class="wlt-he-loading">No tracked tokens found</div>';
            return;
        }

        chrome.storage.local.get(['inleo_market_data_cache'], r => {
            const mc = r.inleo_market_data_cache;
            const hiveUsd = mc?.data?.hive?.usd || 0;

            let heTokensUsdTotal = 0;

            grid.innerHTML = tokens.map(t => {
                const total = t.balance + t.stake;
                const hasStake = t.stake > 0;
                const tokenUsd = total * t.priceHive * hiveUsd;
                heTokensUsdTotal += tokenUsd;

                const hasUsd = hiveUsd > 0 && t.priceHive > 0;
                const usdFmt = '$' + tokenUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const showMeta = hasStake || hasUsd;

                return `<div class="wlt-he-card">
                    <div class="wlt-he-top">
                        <span class="wlt-he-sym">${t.symbol}</span>
                        <span class="wlt-he-bal">${fmt(total)}</span>
                    </div>
                    ${showMeta ? `<div class="wlt-he-meta">
                        <span class="wlt-he-staked">${hasStake ? 'Staked: ' + fmt(t.stake) : ''}</span>
                        <span class="wlt-he-usd">${hasUsd ? usdFmt : ''}</span>
                    </div>` : ''}
                </div>`;
            }).join('');

            const totalEl = document.getElementById('w-total-est');
            if (totalEl && accountData && hiveUsd > 0) {
                const d = accountData;
                const hiveValue = (d.hive + d.savHive + d.hp.own) * hiveUsd + d.hbd + d.savHBD;
                const grandTotal = hiveValue + heTokensUsdTotal;
                totalEl.textContent = '$' + grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else if (totalEl) {
                totalEl.textContent = 'Price unavailable';
                totalEl.style.fontSize = '14px';
            }
        });
    }

    function resetPlaceholders() {
        ['w-hive', 'w-hp', 'w-hp-tot', 'w-hp-apr', 'w-deleg', 'w-hbd', 'w-hbd-sav', 'w-hbd-apr', 'w-est', 'w-total-est']
            .forEach(id => {
                const e = document.getElementById(id);
                if (e) e.textContent = '---';
            });
    }

    NS.walletRender = {
        fmt,
        renderAccount,
        renderHiveEngineTokens,
        resetPlaceholders
    };
})();
