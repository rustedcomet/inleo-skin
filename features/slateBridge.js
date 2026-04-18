/* features/slateBridge.js — Main-world bridge for Slate.js editor access.

   Chrome MV3 content scripts run in an isolated world and cannot access
   React internals (fiber, props, Slate editor instances) on DOM elements.
   This script is injected into the PAGE's main world (world: "MAIN" in
   manifest.json) so it CAN access those internals.

   Communication uses window.postMessage (CustomEvent detail doesn't
   cross world boundaries in MV3):
     Content script → Bridge:  { type: "inleo-slate-request", ... }
     Bridge → Content script:  { type: "inleo-slate-response", ... }

   Supported commands:
     { cmd: "insertText", selector: "...", text: "..." }
     { cmd: "getText",    selector: "..." }
*/
(function () {
    'use strict';

    const MSG_REQ = 'inleo-slate-request';
    const MSG_RES = 'inleo-slate-response';

    /** Walk the React fiber tree to find the Slate editor instance. */
    function getSlateEditor(el) {
        const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber'));
        if (!fiberKey) return null;
        let fiber = el[fiberKey];
        for (let i = 0; i < 30 && fiber; i++) {
            if (fiber.memoizedProps?.editor && fiber.memoizedProps.editor.insertText) {
                return fiber.memoizedProps.editor;
            }
            if (fiber.memoizedState) {
                let state = fiber.memoizedState;
                while (state) {
                    if (state.memoizedState?.insertText) return state.memoizedState;
                    state = state.next;
                }
            }
            fiber = fiber.return;
        }
        return null;
    }

    /** Read the full text from Slate's internal model. */
    function getSlateText(slateEditor) {
        function walk(nodes) {
            let t = '';
            for (const n of nodes) {
                if (n.text !== undefined) t += n.text;
                if (n.children) t += walk(n.children);
            }
            return t;
        }
        return walk(slateEditor.children);
    }

    /** Move Slate's selection to the very end of the document. */
    function moveToEnd(slate) {
        const lastIdx = slate.children.length - 1;
        const lastBlock = slate.children[lastIdx];
        const lastLeaf = lastBlock.children
            ? lastBlock.children[lastBlock.children.length - 1]
            : lastBlock;
        const endOffset = (lastLeaf.text || '').length;
        const endPath = lastBlock.children
            ? [lastIdx, lastBlock.children.length - 1]
            : [lastIdx, 0];
        const endPoint = { path: endPath, offset: endOffset };
        slate.selection = { anchor: endPoint, focus: endPoint };
    }

    /** Handle a request from the content script. */
    function handleMessage(e) {
        if (e.source !== window) return;
        const data = e.data;
        if (!data || data.type !== MSG_REQ) return;

        const { cmd, selector, text, reqId } = data;
        if (!cmd || !selector) return;

        const el = document.querySelector(selector);
        if (!el) {
            respond(reqId, { ok: false, error: 'element not found' });
            return;
        }

        const slate = getSlateEditor(el);
        if (!slate) {
            respond(reqId, { ok: false, error: 'slate not found' });
            return;
        }

        if (cmd === 'getText') {
            const t = getSlateText(slate);
            respond(reqId, { ok: true, text: t });
        } else if (cmd === 'insertText') {
            moveToEnd(slate);
            slate.insertText(text || '');
            const t = getSlateText(slate);
            respond(reqId, { ok: true, text: t });
        } else {
            respond(reqId, { ok: false, error: 'unknown cmd: ' + cmd });
        }
    }

    function respond(reqId, payload) {
        window.postMessage({ type: MSG_RES, reqId, ...payload }, '*');
    }

    window.addEventListener('message', handleMessage);
})();
