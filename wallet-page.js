/* =========================================================
   WALLET PAGE JS — Standalone extension page
   Fetches Hive blockchain data and renders the wallet.
   Runs as a normal page script (NOT a content script).
   ========================================================= */

const DEFAULT_NODE = 'https://api.deathwing.me';
const FALLBACK_NODE = 'https://api.hive.blog';
const CACHE_KEY = 'inleo_wallet_data_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let currentViewUser = null;
let storedData = null;

/* =========================================================
   INIT
   ========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
    // Determine which user to show:
    // 1. ?user= URL param (for viewing other accounts)
    // 2. Stored currentUser from content script
    const params = new URLSearchParams(window.location.search);
    const paramUser = params.get('user');

    if (paramUser) {
        startWallet(paramUser.toLowerCase().replace('@', ''));
    } else {
        // Read the logged-in username saved by content.js
        chrome.storage.local.get(['inleo_current_user'], (result) => {
            const user = result.inleo_current_user;
            if (user) {
                startWallet(user);
            } else {
                showError('Could not determine your username. Make sure you are logged into InLeo in another tab.');
            }
        });
    }

    // Wire up UI
    document.getElementById('back-btn').addEventListener('click', () => {
        // Try to go back, or close the tab
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.close();
        }
    });

    document.getElementById('refresh-btn').addEventListener('click', () => {
        if (currentViewUser) loadData(currentViewUser, true);
    });

    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-input');
    const doSearch = () => {
        const q = searchInput.value.trim().toLowerCase().replace('@', '');
        if (q) {
            searchInput.value = '';
            startWallet(q);
            // Update URL without reload
            const url = new URL(window.location);
            url.searchParams.set('user', q);
            history.replaceState(null, '', url);
        }
    };
    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') doSearch(); });

    document.getElementById('deleg-details-btn').addEventListener('click', () => {
        if (storedData) showDelegationModal(currentViewUser, storedData);
    });

    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('deleg-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });
});

function startWallet(username) {
    currentViewUser = username;
    document.getElementById('viewing-user').textContent = `@${username}`;
    document.title = `Wallet — @${username}`;
    loadData(username, false);
}

/* =========================================================
   HIVE API
   ========================================================= */
async function getPreferredNode() {
    return new Promise(resolve => {
        chrome.storage.sync.get({ hiveApiNode: DEFAULT_NODE }, (r) => resolve(r.hiveApiNode));
    });
}

async function hiveCall(method, params) {
    const primary = await getPreferredNode();
    const fallback = primary === DEFAULT_NODE ? FALLBACK_NODE : DEFAULT_NODE;

    for (const node of [primary, fallback]) {
        try {
            const res = await fetch(node, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error.message);
            return json.result;
        } catch (err) {
            console.warn(`[Wallet] ${node} failed:`, err.message);
        }
    }
    throw new Error('All Hive API nodes are unreachable. Try again later.');
}

/* =========================================================
   DATA
   ========================================================= */
async function loadData(username, force) {
    clearError();
    if (force) resetPlaceholders();

    try {
        const data = await fetchWallet(username, force);
        storedData = data;
        render(data);
    } catch (err) {
        showError(err.message, () => loadData(username, true));
    }
}

async function fetchWallet(username, force) {
    if (!force) {
        const cached = await getCache(username);
        if (cached) return cached;
    }

    const [accounts, globals] = await Promise.all([
        hiveCall('condenser_api.get_accounts', [[username]]),
        hiveCall('condenser_api.get_dynamic_global_properties', [])
    ]);

    if (!accounts || accounts.length === 0) {
        throw new Error(`Account "${username}" not found on the Hive blockchain.`);
    }

    const data = process(accounts[0], globals);
    await setCache(username, data);
    return data;
}

function process(acct, gp) {
    const tvf = parseFloat(gp.total_vesting_fund_hive);
    const tvs = parseFloat(gp.total_vesting_shares);
    const hbdRate = gp.hbd_interest_rate / 100;

    const vs = parseFloat(acct.vesting_shares);
    const dv = parseFloat(acct.delegated_vesting_shares);
    const rv = parseFloat(acct.received_vesting_shares);

    const ownHP = (vs / tvs) * tvf;
    const delHP = (dv / tvs) * tvf;
    const recHP = (rv / tvs) * tvf;
    const effHP = ownHP - delHP + recHP;

    const hive = parseFloat(acct.balance);
    const hbd = parseFloat(acct.hbd_balance);
    const savHBD = parseFloat(acct.savings_hbd_balance);
    const savHive = parseFloat(acct.savings_balance);

    // HP APR estimate from inflation schedule
    const head = gp.head_block_number;
    const inflation = Math.max(978 - (head * 0.01 / 250000 * 100), 95) / 100;
    const hpApr = inflation * 0.15;

    return {
        username: acct.name, hive, savHive,
        hp: { own: ownHP, delegated: delHP, received: recHP, effective: effHP, total: ownHP + recHP },
        netDelegation: recHP - delHP,
        hbd, savHBD, hbdRate, hpApr, tvf, tvs
    };
}

/* =========================================================
   CACHE
   ========================================================= */
function getCache(user) {
    return new Promise(resolve => {
        chrome.storage.local.get([CACHE_KEY], r => {
            const c = r[CACHE_KEY];
            if (c && c.user === user && c.data && Date.now() - c.ts < CACHE_TTL) resolve(c.data);
            else resolve(null);
        });
    });
}
function setCache(user, data) {
    return new Promise(resolve => {
        chrome.storage.local.set({ [CACHE_KEY]: { user, data, ts: Date.now() } }, resolve);
    });
}

/* =========================================================
   RENDER
   ========================================================= */
function fmt(n, d = 3) {
    if (n == null || isNaN(n)) return '---';
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function render(d) {
    setText('hive-balance', fmt(d.hive));
    setText('hp-effective', fmt(d.hp.effective));
    setText('hp-total', `Tot: ${fmt(d.hp.total)}`);
    setText('hp-apr', `~${d.hpApr.toFixed(2)}%`);
    setText('delegation-net', fmt(d.netDelegation));
    setText('hbd-balance', fmt(d.hbd));
    setText('hbd-savings', fmt(d.savHBD));
    setText('hbd-apr', `${d.hbdRate.toFixed(2)}%`);

    // Estimated value using cached market price
    chrome.storage.local.get(['inleo_market_data_cache'], (r) => {
        const mc = r.inleo_market_data_cache;
        let price = 0;
        if (mc && mc.data && mc.data.hive) price = mc.data.hive.usd || 0;

        const totalHive = d.hive + d.savHive + d.hp.own;
        const totalHBD = d.hbd + d.savHBD;
        const usd = (totalHive * price) + totalHBD;

        const el = document.getElementById('estimate-value');
        if (price > 0) {
            el.textContent = '$' + usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
            el.textContent = 'Price unavailable';
            el.style.fontSize = '14px';
        }
    });
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function resetPlaceholders() {
    ['hive-balance', 'hp-effective', 'hp-total', 'hp-apr',
     'delegation-net', 'hbd-balance', 'hbd-savings', 'hbd-apr', 'estimate-value']
        .forEach(id => setText(id, '---'));
}

/* =========================================================
   ERROR
   ========================================================= */
function showError(msg, retryFn) {
    const c = document.getElementById('error-container');
    c.innerHTML = `<div class="error-box"><div>${msg}</div>${retryFn ? '<button class="error-retry" id="retry-btn">Retry</button>' : ''}</div>`;
    if (retryFn) {
        document.getElementById('retry-btn').addEventListener('click', retryFn);
    }
}
function clearError() {
    document.getElementById('error-container').innerHTML = '';
}

/* =========================================================
   DELEGATION MODAL
   ========================================================= */
async function showDelegationModal(username, data) {
    const modal = document.getElementById('deleg-modal');
    const content = document.getElementById('modal-content');
    modal.style.display = 'flex';
    content.innerHTML = '<p class="placeholder">Loading delegations...</p>';

    try {
        const outgoing = await hiveCall('condenser_api.get_vesting_delegations', [username, '', 100]) || [];

        let html = `
            <div class="modal-section">
                <h3>Summary</h3>
                <p style="font-size:13px;color:#ccc;margin:0;line-height:1.8">
                    Own HP: <strong>${fmt(data.hp.own)}</strong> &nbsp;|&nbsp;
                    Delegated Out: <strong>${fmt(data.hp.delegated)}</strong> &nbsp;|&nbsp;
                    Received: <strong>${fmt(data.hp.received)}</strong> &nbsp;|&nbsp;
                    Effective: <strong>${fmt(data.hp.effective)}</strong>
                </p>
            </div>
            <div class="modal-section"><h3>Outgoing Delegations</h3>`;

        if (outgoing.length === 0) {
            html += '<p class="no-data">No outgoing delegations</p>';
        } else {
            html += '<table class="deleg-table"><thead><tr><th>Delegatee</th><th style="text-align:right">HP</th></tr></thead><tbody>';
            for (const d of outgoing) {
                const hp = (parseFloat(d.vesting_shares) / data.tvs) * data.tvf;
                html += `<tr><td>@${d.delegatee}</td><td style="text-align:right">${fmt(hp)}</td></tr>`;
            }
            html += '</tbody></table>';
        }
        html += '</div>';
        content.innerHTML = html;
    } catch (err) {
        content.innerHTML = `<div class="error-box">Failed to load delegations: ${err.message}</div>`;
    }
}

function closeModal() {
    document.getElementById('deleg-modal').style.display = 'none';
}
