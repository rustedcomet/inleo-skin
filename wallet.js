/* wallet.js — Thin bootstrap for the wallet feature.

   All the actual wallet logic lives in the wallet/ modules; this file
   exists only as a load-order anchor for the inline CSS fallback and a
   single place to mention the module layout.

   Load order (see manifest.json):
       core/* → data/* → features/* → content.js
                                      → wallet/walletStyles.js
                                      → wallet/walletApi.js
                                      → wallet/walletCache.js
                                      → wallet/walletView.js
                                      → wallet/walletRender.js
                                      → wallet/walletModal.js
                                      → wallet/walletRoute.js
                                      → wallet.js
*/
(function () {
    const NS = window.InleoSkins || {};
    const log = NS.logger || { log: () => { } };
    /* Inline CSS fallback — kept here so styles/wallet.css can fail to
       load (corporate firewall, extension packaging hiccup) without
       leaving the wallet style-less. walletStyles.ensure() checks for
       this global. The canonical copy is in styles/wallet.css. */
    NS.walletInlineCSS = `
#inleo-wallet-container { padding: 28px 24px 60px; font-family: "Share Tech Mono", monospace; color: #e0e0e0; line-height: 1.6; }
#inleo-wallet-container * { box-sizing: border-box; }
.wlt-inner { max-width: 640px; margin: 0 auto; }
.wlt-header { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; flex-wrap: wrap; }
.wlt-title { font-size: 22px; font-weight: 700; color: #00f3ff; margin: 0; }
.wlt-section { background: rgba(0,243,255,0.02); border: 1px solid rgba(0,243,255,0.08); border-radius: 10px; padding: 18px 20px; margin-bottom: 14px; }
.wlt-token-row { display: flex; justify-content: space-between; gap: 12px; }
.wlt-btn { background: rgba(0,243,255,0.06); border: 1px solid rgba(0,243,255,0.2); color: #00f3ff; padding: 6px 14px; border-radius: 6px; font-family: inherit; cursor: pointer; }
.wlt-error { background: rgba(231,76,60,0.08); border: 1px solid rgba(231,76,60,0.2); padding: 16px; border-radius: 8px; color: #e74c3c; }
`;
    log.log('bootstrap', 'wallet.js ready');
})();
