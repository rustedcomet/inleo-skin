/* wallet/walletApi.js — Hive RPC + Hive Engine fetch helpers.

   - `hiveCall(method, params)` tries the user-configured node first and
     falls back to the other one if it errors, then throws if both fail.
   - `fetchAccount(user)` reads the `condenser_api.get_accounts` +
     `get_dynamic_global_properties` pair and shapes the result into the
     flat structure the render module expects.
   - `fetchHiveEngineTokens(user)` pulls balances + market metrics in
     parallel and returns just the tokens we track. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    const log = NS.logger || { log: () => { }, warn: () => { } };

    const HIVE_NODE_DEFAULT = 'https://api.deathwing.me';
    const HIVE_NODE_FALLBACK = 'https://api.hive.blog';

    const HE_TOKENS_WANTED = ['LEO', 'SURGE', 'LSTR', 'EDSI', 'POSH', 'SWAP.HIVE'];

    async function getNode() {
        return new Promise(resolve => {
            chrome.storage.sync.get({ hiveApiNode: HIVE_NODE_DEFAULT }, res => {
                resolve(res.hiveApiNode || HIVE_NODE_DEFAULT);
            });
        });
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
            } catch (e) {
                log.warn('wallet', node, 'fail:', e.message);
            }
        }
        throw new Error('All Hive API nodes unreachable. Try again later.');
    }

    function processAccount(a, gp) {
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

    async function fetchAccount(user) {
        const [accts, gp] = await Promise.all([
            hiveCall('condenser_api.get_accounts', [[user]]),
            hiveCall('condenser_api.get_dynamic_global_properties', [])
        ]);
        if (!accts || accts.length === 0) throw new Error(`Account "${user}" not found.`);
        return processAccount(accts[0], gp);
    }

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

            const [balances, metrics] = await Promise.all([
                heCall('tokens', 'balances', { account: username }),
                heCall('market', 'metrics', { symbol: { $in: HE_TOKENS_WANTED } })
            ]);

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
            log.warn('wallet', 'Hive Engine fetch failed:', err.message);
            return [];
        }
    }

    NS.walletApi = {
        HIVE_NODE_DEFAULT,
        HIVE_NODE_FALLBACK,
        HE_TOKENS_WANTED,
        hiveCall,
        fetchAccount,
        fetchHiveEngineTokens
    };
})();
