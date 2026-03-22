/* =========================================================
   WALLET MODULE — Swaps InLeo's center content with wallet
   No overlay, no cloning. Hides the feed <main> and inserts
   wallet content in its place. Sidebars stay untouched.
   ========================================================= */

let _walletActive = false;
let _walletData = null;
let _walletUser = null;
let _walletStyleSheet = null;
let _originalMain = null; // reference to hidden center <main>

const HIVE_NODE_DEFAULT = 'https://api.deathwing.me';
const HIVE_NODE_FALLBACK = 'https://api.hive.blog';
const W_CACHE_KEY = 'inleo_wallet_data_cache';
const W_CACHE_TTL = 5 * 60 * 1000;

/* =========================================================
   STYLES (wallet content only — everything else is InLeo's)
   ========================================================= */
function ensureWalletStyles() {
    if (_walletStyleSheet) return;
    _walletStyleSheet = new CSSStyleSheet();
    _walletStyleSheet.replaceSync(getWalletCSS());
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, _walletStyleSheet];
}

function getWalletCSS() {
    return `
/* ---- Wallet container (replaces center main) ---- */
#inleo-wallet-container {
    padding: 28px 24px 60px;
    font-family: "Share Tech Mono", monospace;
    color: #e0e0e0;
    line-height: 1.6;
}
#inleo-wallet-container * { box-sizing: border-box; }

.wlt-inner {
    max-width: 640px;
    margin: 0 auto;
}

/* ---- Header ---- */
.wlt-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 28px;
    flex-wrap: wrap;
}
.wlt-title {
    font-size: 22px;
    font-weight: 700;
    color: #00f3ff;
    text-shadow: 0 0 10px rgba(0,243,255,0.3);
    margin: 0;
}
.wlt-user { font-size: 14px; color: #888; }
.wlt-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}
.wlt-search {
    background: rgba(0,243,255,0.04);
    border: 1px solid rgba(0,243,255,0.2);
    color: #00f3ff;
    padding: 6px 10px;
    border-radius: 6px;
    font-family: inherit;
    font-size: 13px;
    width: 175px;
    outline: none;
    transition: all 0.2s;
}
.wlt-search::placeholder { color: #334; }
.wlt-search:focus {
    border-color: #00f3ff;
    box-shadow: 0 0 8px rgba(0,243,255,0.15);
}
.wlt-btn {
    background: rgba(0,243,255,0.06);
    border: 1px solid rgba(0,243,255,0.2);
    color: #00f3ff;
    padding: 6px 14px;
    border-radius: 6px;
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
}
.wlt-btn:hover {
    background: rgba(0,243,255,0.12);
    box-shadow: 0 0 8px rgba(0,243,255,0.15);
}
.wlt-refresh { font-size: 16px; padding: 5px 11px; }

/* ---- Token Sections ---- */
.wlt-section {
    background: rgba(0,243,255,0.02);
    border: 1px solid rgba(0,243,255,0.08);
    border-radius: 10px;
    padding: 18px 20px;
    margin-bottom: 14px;
    transition: border-color 0.3s;
}
.wlt-section:hover { border-color: rgba(0,243,255,0.15); }

.wlt-token-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}
.wlt-token-left { display: flex; align-items: center; gap: 10px; }
.wlt-token-icon {
    width: 30px; height: 30px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 700; flex-shrink: 0;
}
.wlt-icon-hive {
    background: linear-gradient(135deg, #ff2a00, #ff4560);
    color: #fff;
    box-shadow: 0 0 8px rgba(255,42,0,0.3);
}
.wlt-icon-hbd {
    background: linear-gradient(135deg, #2ecc71, #27ae60);
    color: #fff;
    box-shadow: 0 0 8px rgba(46,204,113,0.3);
}
.wlt-token-name { font-size: 17px; font-weight: 700; color: #fff; }
.wlt-token-bal { font-size: 21px; font-weight: 700; color: #fff; text-align: right; }
.wlt-token-desc { font-size: 12px; color: #666; margin-top: 2px; margin-bottom: 10px; }

/* ---- Sub-rows ---- */
.wlt-sub {
    padding: 12px 0 12px 18px;
    border-top: 1px solid rgba(255,255,255,0.04);
    position: relative;
}
.wlt-sub::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 2px;
    background: #ff2a00;
    box-shadow: 0 0 6px rgba(255,42,0,0.4);
    border-radius: 1px;
}
.wlt-sub.wlt-sub-last::before { bottom: 50%; }
.wlt-sub-head {
    display: flex; align-items: center;
    justify-content: space-between; gap: 8px;
}
.wlt-sub-name { font-size: 14px; font-weight: 600; color: #ddd; }
.wlt-sub-name-row { display: flex; align-items: center; gap: 8px; }
.wlt-sub-right { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
.wlt-sub-bal { font-size: 17px; font-weight: 600; color: #fff; }
.wlt-sub-detail { font-size: 11px; color: #777; }
.wlt-sub-desc { font-size: 12px; color: #555; margin-top: 4px; }

.wlt-badge {
    display: inline-block; padding: 1px 8px;
    border-radius: 4px; font-size: 11px; font-weight: 600;
}
.wlt-apr { background: rgba(0,243,255,0.1); color: #00f3ff; }
.wlt-more { background: rgba(255,255,255,0.06); color: #888; font-size: 10px; text-transform: uppercase; }

.wlt-details-btn {
    background: rgba(0,243,255,0.06);
    border: 1px solid rgba(0,243,255,0.15);
    color: #00f3ff;
    padding: 3px 10px; border-radius: 4px;
    font-family: inherit; font-size: 11px;
    cursor: pointer; transition: all 0.2s;
}
.wlt-details-btn:hover { background: rgba(0,243,255,0.12); }

/* ---- Estimate ---- */
.wlt-estimate { border-top: 2px solid rgba(0,243,255,0.12); }
.wlt-est-row { display: flex; align-items: center; justify-content: space-between; }
.wlt-est-label { font-size: 16px; font-weight: 700; color: #fff; }
.wlt-est-desc { font-size: 12px; color: #555; margin-top: 2px; }
.wlt-est-val {
    font-size: 24px; font-weight: 700;
    color: #00f3ff; text-shadow: 0 0 12px rgba(0,243,255,0.3);
}

/* ---- Error ---- */
.wlt-error {
    background: rgba(231,76,60,0.08);
    border: 1px solid rgba(231,76,60,0.2);
    border-radius: 8px; padding: 16px;
    text-align: center; color: #e74c3c; margin-bottom: 14px;
}
.wlt-error-retry {
    background: rgba(231,76,60,0.12);
    border: 1px solid rgba(231,76,60,0.3);
    color: #e74c3c; padding: 6px 18px;
    border-radius: 6px; cursor: pointer;
    margin-top: 10px; font-family: inherit; font-size: 13px;
}
.wlt-error-retry:hover { background: rgba(231,76,60,0.2); }

/* ---- Modal ---- */
.wlt-modal-bg {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.88);
    z-index: 2147483647;
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(6px);
}
.wlt-modal {
    background: #0a0a16;
    border: 1px solid rgba(0,243,255,0.15);
    border-radius: 12px; padding: 24px;
    max-width: 560px; width: 92%;
    max-height: 75vh; margin: 0 auto;
    overflow-y: auto; color: #e0e0e0;
    font-family: "Share Tech Mono", monospace;
}
.wlt-modal h3 { font-size: 18px; color: #00f3ff; margin: 0 0 16px; }
.wlt-modal-close {
    float: right; background: none; border: none;
    color: #888; font-size: 22px; cursor: pointer;
}
.wlt-modal-close:hover { color: #fff; }
.wlt-modal-sect { margin-bottom: 16px; }
.wlt-modal-sect h4 { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 8px; }
.wlt-dtable { width: 100%; border-collapse: collapse; font-size: 13px; }
.wlt-dtable th { text-align: left; padding: 6px 8px; border-bottom: 1px solid rgba(0,243,255,0.1); color: #777; font-weight: 600; }
.wlt-dtable td { padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,0.03); }
.wlt-dtable tr:hover td { background: rgba(0,243,255,0.03); }

/* ---- Hive Engine Tokens ---- */
.wlt-he-title {
    font-size: 15px; font-weight: 700; color: #00f3ff;
    margin: 24px 0 12px; text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex; align-items: center; gap: 8px;
}
.wlt-he-title::after {
    content: ''; flex: 1; height: 1px;
    background: rgba(0,243,255,0.1);
}
.wlt-he-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 10px; margin-bottom: 14px;
}
@media (max-width: 500px) { .wlt-he-grid { grid-template-columns: 1fr; } }
.wlt-he-card {
    background: rgba(0,243,255,0.02);
    border: 1px solid rgba(0,243,255,0.06);
    border-radius: 8px; padding: 12px 14px;
    transition: border-color 0.3s;
}
.wlt-he-card:hover { border-color: rgba(0,243,255,0.15); }
.wlt-he-top {
    display: flex; align-items: center;
    justify-content: space-between;
}
.wlt-he-sym { font-size: 13px; font-weight: 700; color: #ccc; }
.wlt-he-bal { font-size: 15px; font-weight: 600; color: #fff; text-align: right; }
.wlt-he-meta {
    display: flex; align-items: center;
    justify-content: space-between;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(255,255,255,0.03);
}
.wlt-he-staked { font-size: 11px; color: #666; }
.wlt-he-usd { font-size: 11px; color: #00f3ff; opacity: 0.7; }
.wlt-he-loading { color: #444; font-size: 12px; padding: 8px 0; }
.wlt-total-estimate { margin-top: 20px; border-top-color: rgba(0,243,255,0.2); }

.wlt-footer {
    text-align: center; padding: 24px 0 0;
    font-size: 11px; color: #333;
    border-top: 1px solid rgba(255,255,255,0.04);
    margin-top: 28px;
}
`;
}

/* =========================================================
   WALLET HTML (center content)
   ========================================================= */
function buildWalletHTML(username) {
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

/* =========================================================
   ACTIVATION / DEACTIVATION
   ========================================================= */
function getCenterMain() {
    // InLeo structure: body > div > [header, aside(left), main(outer) > [main(center), aside(right)]]
    const outerMain = document.querySelector('body > div > main');
    return outerMain?.querySelector(':scope > main');
}

function openWallet() {
    if (_walletActive) return;

    const username = currentUser || extractUserFromPath();
    if (!username) {
        console.warn('[Wallet] No username yet, retrying in 1s');
        setTimeout(openWallet, 1000);
        return;
    }

    const centerMain = getCenterMain();
    if (!centerMain) {
        console.warn('[Wallet] Center main not found, retrying in 500ms');
        setTimeout(openWallet, 500);
        return;
    }

    ensureWalletStyles();
    _walletUser = username;
    _walletActive = true;
    _originalMain = centerMain;

    // Hide the original center content
    centerMain.style.display = 'none';

    // Create wallet container with same classes as the original center main
    const walletEl = document.createElement('div');
    walletEl.id = 'inleo-wallet-container';
    // Copy the original main's classes so it gets the same flex/width behavior
    walletEl.className = centerMain.className;
    walletEl.innerHTML = buildWalletHTML(username);

    // Insert right where the original main was
    centerMain.parentElement.insertBefore(walletEl, centerMain);

    // Wire events
    wireWalletEvents(username);

    // Fetch data
    loadWallet(username, false);

    // Scroll to top
    window.scrollTo(0, 0);

    console.log('[Wallet] Opened for', username);
}

function closeWallet() {
    if (!_walletActive) return;
    _walletActive = false;
    _walletData = null;
    _walletUser = null;

    // Remove wallet container
    const wc = document.getElementById('inleo-wallet-container');
    if (wc) wc.remove();

    // Show original center content
    if (_originalMain) {
        _originalMain.style.display = '';
        _originalMain = null;
    }

    // Remove modal if open
    const modal = document.getElementById('wlt-modal');
    if (modal) modal.remove();

    console.log('[Wallet] Closed');
}

function extractUserFromPath() {
    const m = window.location.pathname.match(/^\/([^/]+)\/wallet/);
    return m ? m[1].toLowerCase() : null;
}

/* =========================================================
   EVENTS
   ========================================================= */
function wireWalletEvents(username) {
    const $ = id => document.getElementById(id);

    $('wlt-refresh')?.addEventListener('click', () => loadWallet(_walletUser || username, true));

    const doSearch = () => {
        const q = $('wlt-search')?.value.trim().toLowerCase().replace('@', '');
        if (q) {
            _walletUser = q;
            const lbl = $('wlt-label');
            if (lbl) lbl.textContent = '@' + q;
            $('wlt-search').value = '';
            loadWallet(q, true);
        }
    };
    $('wlt-go')?.addEventListener('click', doSearch);
    $('wlt-search')?.addEventListener('keypress', e => { if (e.key === 'Enter') doSearch(); });

    $('wlt-deleg-btn')?.addEventListener('click', () => {
        if (_walletData) showDelegModal(_walletUser || username, _walletData);
    });
}

/* =========================================================
   HIVE API
   ========================================================= */
async function getNode() {
    return new Promise(r => chrome.storage.sync.get({ hiveApiNode: HIVE_NODE_DEFAULT }, res => r(res.hiveApiNode)));
}

async function hiveCall(method, params) {
    const primary = await getNode();
    const fallback = primary === HIVE_NODE_DEFAULT ? HIVE_NODE_FALLBACK : HIVE_NODE_DEFAULT;
    for (const node of [primary, fallback]) {
        try {
            const res = await fetch(node, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
            });
            const j = await res.json();
            if (j.error) throw new Error(j.error.message);
            return j.result;
        } catch (e) { console.warn('[Wallet]', node, 'fail:', e.message); }
    }
    throw new Error('All Hive API nodes unreachable. Try again later.');
}

/* =========================================================
   DATA
   ========================================================= */
async function loadWallet(user, force) {
    const ec = document.getElementById('wlt-errors');
    if (ec) ec.innerHTML = '';
    if (force) resetPlaceholders();

    try {
        const data = await fetchData(user, force);
        _walletData = data;
        renderData(data);
    } catch (err) {
        if (ec) ec.innerHTML = `<div class="wlt-error">${err.message}<br><button class="wlt-error-retry" id="wlt-retry">Retry</button></div>`;
        document.getElementById('wlt-retry')?.addEventListener('click', () => loadWallet(user, true));
    }

    fetchHiveEngineTokens(user).then(renderHiveEngineTokens);
}

async function fetchData(user, force) {
    if (!force) {
        const c = await getWCache(user);
        if (c) return c;
    }
    const [accts, gp] = await Promise.all([
        hiveCall('condenser_api.get_accounts', [[user]]),
        hiveCall('condenser_api.get_dynamic_global_properties', [])
    ]);
    if (!accts || accts.length === 0) throw new Error(`Account "${user}" not found.`);
    const data = processAcct(accts[0], gp);
    await setWCache(user, data);
    return data;
}

function processAcct(a, gp) {
    const tvf = parseFloat(gp.total_vesting_fund_hive);
    const tvs = parseFloat(gp.total_vesting_shares);
    const vs = parseFloat(a.vesting_shares);
    const dv = parseFloat(a.delegated_vesting_shares);
    const rv = parseFloat(a.received_vesting_shares);
    const ownHP = (vs / tvs) * tvf;
    const delHP = (dv / tvs) * tvf;
    const recHP = (rv / tvs) * tvf;

    const head = gp.head_block_number;
    const inflRate = Math.max(978 - Math.floor(head / 250000), 95) / 10000;
    const virtualSupply = parseFloat(gp.virtual_supply);
    const newHivePerYear = virtualSupply * inflRate;
    const stakingAPR = (newHivePerYear * 0.15) / tvf * 100;
    const curationAPR = (newHivePerYear * 0.65 * 0.5) / tvf * 100;

    return {
        user: a.name,
        hive: parseFloat(a.balance),
        savHive: parseFloat(a.savings_balance),
        hp: { own: ownHP, del: delHP, rec: recHP, eff: ownHP - delHP + recHP, tot: ownHP + recHP },
        net: recHP - delHP,
        hbd: parseFloat(a.hbd_balance),
        savHBD: parseFloat(a.savings_hbd_balance),
        hbdRate: gp.hbd_interest_rate / 100,
        hpAprMin: stakingAPR,
        hpAprMax: stakingAPR + curationAPR,
        tvf, tvs
    };
}

/* =========================================================
   HIVE ENGINE TOKENS
   ========================================================= */
const HE_TOKENS_WANTED = ['LEO', 'SURGE', 'LSTR', 'EDSI', 'POSH', 'SWAP.HIVE'];

async function fetchHiveEngineTokens(username) {
    try {
        const heCall = (contract, table, query) => fetch('https://api.hive-engine.com/rpc/contracts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 1, method: 'find',
                params: { contract, table, query, limit: 1000 }
            })
        }).then(r => r.json()).then(j => j.result || []);

        // Fetch balances and market prices in parallel
        const [balances, metrics] = await Promise.all([
            heCall('tokens', 'balances', { account: username }),
            heCall('market', 'metrics', { symbol: { $in: HE_TOKENS_WANTED } })
        ]);

        // Build price map: symbol -> lastPrice in HIVE
        const priceMap = {};
        metrics.forEach(m => { priceMap[m.symbol] = parseFloat(m.lastPrice) || 0; });

        return balances
            .filter(t => HE_TOKENS_WANTED.includes(t.symbol))
            .map(t => ({
                symbol: t.symbol,
                balance: parseFloat(t.balance) || 0,
                stake: parseFloat(t.stake) || 0,
                priceHive: priceMap[t.symbol] || 0
            }))
            .sort((a, b) => HE_TOKENS_WANTED.indexOf(a.symbol) - HE_TOKENS_WANTED.indexOf(b.symbol));
    } catch (err) {
        console.warn('[Wallet] Hive Engine fetch failed:', err.message);
        return [];
    }
}

function renderHiveEngineTokens(tokens) {
    const grid = document.getElementById('wlt-he-grid');
    if (!grid) return;

    if (tokens.length === 0) {
        grid.innerHTML = '<div class="wlt-he-loading">No tracked tokens found</div>';
        return;
    }

    // Get HIVE USD price to convert HE token prices
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

        // Calculate and render total account value (HIVE + HBD + HE tokens)
        const totalEl = document.getElementById('w-total-est');
        if (totalEl && _walletData && hiveUsd > 0) {
            const d = _walletData;
            const hiveValue = (d.hive + d.savHive + d.hp.own) * hiveUsd + d.hbd + d.savHBD;
            const grandTotal = hiveValue + heTokensUsdTotal;
            totalEl.textContent = '$' + grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else if (totalEl) {
            totalEl.textContent = 'Price unavailable';
            totalEl.style.fontSize = '14px';
        }
    });
}

function getWCache(u) {
    return new Promise(r => chrome.storage.local.get([W_CACHE_KEY], res => {
        const c = res[W_CACHE_KEY];
        r(c && c.u === u && c.d && Date.now() - c.t < W_CACHE_TTL ? c.d : null);
    }));
}
function setWCache(u, d) {
    return new Promise(r => chrome.storage.local.set({ [W_CACHE_KEY]: { u, d, t: Date.now() } }, r));
}

/* =========================================================
   RENDER
   ========================================================= */
function fmt(n, d = 3) {
    if (n == null || isNaN(n)) return '---';
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function renderData(d) {
    const s = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    s('w-hive', fmt(d.hive));
    s('w-hp', fmt(d.hp.eff));
    s('w-hp-tot', 'Tot: ' + fmt(d.hp.tot));
    s('w-hp-apr', '~' + d.hpAprMin.toFixed(2) + ' - ' + d.hpAprMax.toFixed(2) + '%');
    s('w-deleg', fmt(d.net));
    s('w-hbd', fmt(d.hbd));
    s('w-hbd-sav', fmt(d.savHBD));
    s('w-hbd-apr', d.hbdRate.toFixed(2) + '%');

    chrome.storage.local.get(['inleo_market_data_cache'], r => {
        const mc = r.inleo_market_data_cache;
        let p = 0;
        if (mc?.data?.hive) p = mc.data.hive.usd || 0;
        const usd = (d.hive + d.savHive + d.hp.own) * p + d.hbd + d.savHBD;
        const el = document.getElementById('w-est');
        if (!el) return;
        if (p > 0) el.textContent = '$' + usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        else { el.textContent = 'Price unavailable'; el.style.fontSize = '14px'; }
    });
}

function resetPlaceholders() {
    ['w-hive','w-hp','w-hp-tot','w-hp-apr','w-deleg','w-hbd','w-hbd-sav','w-hbd-apr','w-est','w-total-est']
        .forEach(id => { const e = document.getElementById(id); if (e) e.textContent = '---'; });
}

/* =========================================================
   DELEGATION MODAL
   ========================================================= */
async function showDelegModal(user, data) {
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
        const out = await hiveCall('condenser_api.get_vesting_delegations', [user, '', 100]) || [];
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

/* =========================================================
   CLICK INTERCEPTION & NAVIGATION
   ========================================================= */
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
                openWallet();
                return;
            }
            // If clicking a non-wallet nav link while wallet is open, close wallet
            if (_walletActive) {
                closeWallet();
                return; // let InLeo handle navigation
            }
        }
        target = target.parentElement;
    }
}, true);

// If user lands directly on a /wallet URL, open our wallet
function checkInitialRoute() {
    if (window.location.pathname.includes('/wallet')) {
        const tryOpen = () => {
            if (getCenterMain()) {
                openWallet();
            } else {
                setTimeout(tryOpen, 500);
            }
        };
        tryOpen();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkInitialRoute);
} else {
    checkInitialRoute();
}
