/* wallet/walletModal.js — Delegation details modal.
   Opened from the "DETAILS" button on the Delegated HIVE row. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});

    const fmt = (...a) => NS.walletRender ? NS.walletRender.fmt(...a) : String(a[0]);

    async function showDelegations(user, data) {
        let m = document.getElementById('wlt-modal');
        if (m) m.remove();

        m = document.createElement('div');
        m.id = 'wlt-modal';
        m.className = 'wlt-modal-bg';
        m.innerHTML = `<div class="wlt-modal">
            <button class="wlt-modal-close" id="wlt-m-close">&times;</button>
            <h3>Delegation Details — @${user}</h3>
            <div id="wlt-m-body"><p style="color:#555">Loading delegations...</p></div>
        </div>`;
        document.body.appendChild(m);

        m.addEventListener('click', e => { if (e.target === m) m.remove(); });
        document.getElementById('wlt-m-close').addEventListener('click', () => m.remove());

        try {
            const out = await NS.walletApi.hiveCall('condenser_api.get_vesting_delegations', [user, '', 100]) || [];
            const body = document.getElementById('wlt-m-body');
            if (!body) return;

            let h = `<div class="wlt-modal-sect"><h4>Summary</h4>
                <p style="font-size:13px;color:#ccc;margin:0;line-height:1.8">
                Own HP: <strong>${fmt(data.hp.own)}</strong> &nbsp;|&nbsp;
                Delegated Out: <strong>${fmt(data.hp.del)}</strong> &nbsp;|&nbsp;
                Received: <strong>${fmt(data.hp.rec)}</strong> &nbsp;|&nbsp;
                Effective: <strong>${fmt(data.hp.eff)}</strong></p></div>`;

            h += '<div class="wlt-modal-sect"><h4>Outgoing Delegations</h4>';
            if (out.length === 0) {
                h += '<p style="color:#555;font-style:italic">No outgoing delegations</p>';
            } else {
                h += '<table class="wlt-dtable"><thead><tr><th>Delegatee</th><th style="text-align:right">HP</th></tr></thead><tbody>';
                for (const d of out) {
                    const hp = (parseFloat(d.vesting_shares) / data.tvs) * data.tvf;
                    h += `<tr><td>@${d.delegatee}</td><td style="text-align:right">${fmt(hp)}</td></tr>`;
                }
                h += '</tbody></table>';
            }
            h += '</div>';
            body.innerHTML = h;
        } catch (e) {
            const body = document.getElementById('wlt-m-body');
            if (body) body.innerHTML = `<div class="wlt-error">Failed: ${e.message}</div>`;
        }
    }

    NS.walletModal = { showDelegations };
})();
