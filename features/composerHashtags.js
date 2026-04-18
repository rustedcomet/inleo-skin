/* features/composerHashtags.js — Composer hashtag assistant v2.

   SwiftKey-style suggestion strip that sits between the text area and
   the formatting toolbar. Tags are rendered as UPPERCASE chips in a
   single row (overflow hidden). Always-include tags sit on the left,
   contextual suggestions on the right, separated by a small gap.

   Clicking a chip appends "#TAG" to the very end of the post text and
   removes the chip from the strip. If the user deletes the tag from
   the text, the chip reappears. The strip hides entirely when no
   suggestions remain.

   Scoped to the threads composer only (the short-post editor on the
   home feed). The /publish long-form article editor is out of scope.

   Inleo's composer uses Slate.js, so we insert text via Slate's own
   editor.insertText() API (accessed through React fiber internals).
   This keeps Slate's internal model, React state, and the DOM in sync
   so the tags survive re-renders and are included when the post is
   published. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    const log = (NS.logger && NS.logger.log) ? (...a) => NS.logger.log('hashtags', ...a) : () => { };
    const warn = (NS.logger && NS.logger.warn) ? (...a) => NS.logger.warn('hashtags', ...a) : () => { };
    const storage = NS.storage;
    const utils = NS.utils;
    const route = NS.route;

    if (!storage || !utils || !NS.hashtagRules) {
        warn('required modules missing, composer hashtags disabled');
        return;
    }

    const STRIP_CLASS = 'inleo-hashtag-strip';
    const ATTACHED_ATTR = 'data-inleo-hashtag-attached';
    const DEBOUNCE_MS = 400;

    /* ---- Stylesheet ---- */
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
        .${STRIP_CLASS} {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            overflow: hidden;
            max-height: 32px;
            font-family: inherit;
            font-size: 12px;
            flex-shrink: 0;
        }
        .${STRIP_CLASS}[data-empty="1"] {
            display: none;
        }
        .${STRIP_CLASS}-gap {
            width: 8px;
            flex-shrink: 0;
        }
        .${STRIP_CLASS}-chip {
            display: inline-flex;
            align-items: center;
            padding: 3px 10px;
            border-radius: 4px;
            border: 1px solid rgba(127,127,127,0.3);
            background: rgba(127,127,127,0.08);
            color: rgba(255,255,255,0.75);
            font-size: 11px;
            font-weight: 600;
            line-height: 1;
            letter-spacing: 0.03em;
            cursor: pointer;
            white-space: nowrap;
            flex-shrink: 0;
            transition: opacity 0.12s, background 0.12s;
            text-transform: uppercase;
        }
        .${STRIP_CLASS}-chip:hover {
            opacity: 1;
            background: rgba(127,127,127,0.18);
        }

        /* ---- Theme-adaptive colors ---- */

        /* Cyberpunk V2 — cyan */
        :root[data-inleo-skin="cyberpunk-v2"] .${STRIP_CLASS}-chip {
            border-color: rgba(0,243,255,0.3);
            background: rgba(0,243,255,0.06);
            color: #00f3ff;
        }
        :root[data-inleo-skin="cyberpunk-v2"] .${STRIP_CLASS}-chip:hover {
            background: rgba(0,243,255,0.15);
        }

        /* Gday — neon purple */
        :root[data-inleo-skin="gday"] .${STRIP_CLASS}-chip {
            border-color: rgba(236,178,255,0.3);
            background: rgba(236,178,255,0.06);
            color: #ecb2ff;
        }
        :root[data-inleo-skin="gday"] .${STRIP_CLASS}-chip:hover {
            background: rgba(236,178,255,0.15);
        }

        /* Gday v2 — industrial orange */
        :root[data-inleo-skin="gday-v2"] .${STRIP_CLASS}-chip {
            border-color: rgba(211,84,0,0.3);
            background: rgba(211,84,0,0.06);
            color: #d35400;
        }
        :root[data-inleo-skin="gday-v2"] .${STRIP_CLASS}-chip:hover {
            background: rgba(211,84,0,0.15);
        }
    `);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

    /* ---- Composer detection ---- */

    function isCandidateComposer(el) {
        if (!el || !el.isConnected) return false;
        if (el.getAttribute(ATTACHED_ATTR) === '1') return false;
        /* Must be Inleo's markdown-editor (threads composer). */
        if (!el.classList.contains('markdown-editor')) return false;
        /* Must be inside <main>. */
        if (!el.closest('main')) return false;
        /* Stay out of popups / modals. */
        if (utils.isInsidePopupOrCard(el)) return false;
        /* Width sanity — at least 200px. */
        const rect = el.getBoundingClientRect();
        if (rect.width < 200) return false;
        return true;
    }

    function findCandidates() {
        const out = [];
        document.querySelectorAll('main [contenteditable="true"].markdown-editor').forEach(el => {
            if (isCandidateComposer(el)) out.push(el);
        });
        return out;
    }

    /* ---- DOM helpers ---- */

    /** Find the column container (flex-col wrapper) and the toolbar child. */
    function findComposerStructure(editor) {
        /* Walk up: editor → flex wrapper → editor row → column container.
           Column container is the one with flex-col that has the toolbar child. */
        let col = editor.parentElement;
        for (let i = 0; i < 5; i++) {
            if (!col) return null;
            /* Check if this node has a child with the Bold button (toolbar). */
            const toolbar = Array.from(col.children).find(c =>
                c !== editor && !c.contains(editor) &&
                c.querySelector('button[aria-label="Bold"]')
            );
            if (toolbar) return { col, toolbar };
            col = col.parentElement;
        }
        return null;
    }

    /* ---- Slate bridge helpers ---- */

    /* The Slate.js editor lives in the page's main world. Content scripts
       run in an isolated world and can't touch React internals. We talk
       to slateBridge.js (world: "MAIN") via custom events.

       slateBridge listens for "inleo-slate-request" and responds on
       "inleo-slate-response". Each request carries a unique reqId so
       we can match responses. */

    const MSG_REQ = 'inleo-slate-request';
    const MSG_RES = 'inleo-slate-response';
    let _reqCounter = 0;
    const _pending = new Map();   /* reqId → { resolve } */

    window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        const data = e.data;
        if (!data || data.type !== MSG_RES) return;
        const p = _pending.get(data.reqId);
        if (p) {
            _pending.delete(data.reqId);
            p.resolve(data);
        }
    });

    /** Send a command to the Slate bridge and return a Promise. */
    function slateBridgeCall(cmd, selector, extra) {
        return new Promise((resolve) => {
            const reqId = ++_reqCounter;
            _pending.set(reqId, { resolve });
            window.postMessage({ type: MSG_REQ, cmd, selector, reqId, ...extra }, '*');
            /* Timeout — if bridge is missing, resolve with error. */
            setTimeout(() => {
                if (_pending.has(reqId)) {
                    _pending.delete(reqId);
                    resolve({ ok: false, error: 'timeout' });
                }
            }, 500);
        });
    }

    /** Build a unique CSS selector for the editor element. */
    function editorSelector(editor) {
        /* data-slate-editor-id is unique per Slate instance. */
        const id = editor.getAttribute('data-slate-editor-id');
        if (id != null) return `[data-slate-editor-id="${id}"]`;
        /* Fallback: generic. */
        return 'main [contenteditable="true"].markdown-editor';
    }

    /** Fallback: read text from the DOM if Slate bridge is unavailable. */
    function getText(el) {
        return el.innerText || el.textContent || '';
    }

    /** Extract all #TAG occurrences from text (case-insensitive). */
    function extractTagsInText(text) {
        const found = new Set();
        const re = /#([a-z0-9][a-z0-9\-_]{0,39})/gi;
        let m;
        while ((m = re.exec(text)) !== null) {
            found.add(m[1].toUpperCase());
        }
        return found;
    }

    /** Build the prefix to insert before a new hashtag token.
        If the text already ends with a hashtag, use " , " as separator;
        otherwise just add a space. */
    function tagPrefix(currentText) {
        const trimmed = currentText.trimEnd();
        if (trimmed.length === 0) return '';
        /* Already ends with a hashtag? Use comma separator. */
        if (/#[a-z0-9][a-z0-9\-_]*$/i.test(trimmed)) return ' , ';
        return ' ';
    }

    /** Append " #TAG" (or " , #TAG") to the end of the post via the
        Slate bridge. Falls back to execCommand if unreachable. */
    async function appendTag(editor, tag) {
        const token = '#' + tag.toUpperCase();
        const sel = editorSelector(editor);

        /* First get current text from Slate to decide spacing. */
        const readRes = await slateBridgeCall('getText', sel);
        if (readRes.ok) {
            const currentText = readRes.text || '';
            const insertion = tagPrefix(currentText) + token;

            const insertRes = await slateBridgeCall('insertText', sel, { text: insertion });
            if (insertRes.ok) {
                log('appended tag via Slate bridge:', token);
                return;
            }
        }

        /* Fallback (bridge unavailable): use execCommand. */
        warn('Slate bridge unavailable, falling back to execCommand');
        const currentText = getText(editor);
        const insertion = tagPrefix(currentText) + token;
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const domSel = window.getSelection();
        domSel.removeAllRanges();
        domSel.addRange(range);
        document.execCommand('insertText', false, insertion);
    }

    /* ---- Strip rendering ---- */

    function buildStrip() {
        const strip = document.createElement('div');
        strip.className = STRIP_CLASS;
        strip.dataset.empty = '1';
        return strip;
    }

    function renderStrip(strip, pinnedTags, contextualTags) {
        strip.innerHTML = '';

        const total = pinnedTags.length + contextualTags.length;
        if (total === 0) {
            strip.dataset.empty = '1';
            return;
        }
        strip.dataset.empty = '0';

        /* Always-include chips (left). */
        pinnedTags.forEach(tag => {
            strip.appendChild(makeChip(tag));
        });

        /* Gap between pinned and contextual — only if both sections have content. */
        if (pinnedTags.length > 0 && contextualTags.length > 0) {
            const gap = document.createElement('div');
            gap.className = STRIP_CLASS + '-gap';
            strip.appendChild(gap);
        }

        /* Contextual chips (right). */
        contextualTags.forEach(tag => {
            strip.appendChild(makeChip(tag));
        });
    }

    function makeChip(tag) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = STRIP_CLASS + '-chip';
        chip.dataset.tag = tag.toUpperCase();
        chip.textContent = '#' + tag.toUpperCase();
        return chip;
    }

    /* ---- Per-composer controller ---- */

    async function attach(editor) {
        editor.setAttribute(ATTACHED_ATTR, '1');

        const structure = findComposerStructure(editor);
        if (!structure) {
            log('could not find toolbar for composer, aborting');
            editor.removeAttribute(ATTACHED_ATTR);
            return;
        }

        const { col, toolbar } = structure;
        const strip = buildStrip();

        /* Insert strip before the toolbar. */
        col.insertBefore(strip, toolbar);

        const settings = await storage.getHashtagSettings();
        if (!settings.enabled) {
            strip.remove();
            editor.removeAttribute(ATTACHED_ATTR);
            return;
        }

        let debounceTimer = null;
        let lastText = '';
        let recomputeRunning = false;
        const sel = editorSelector(editor);

        async function recompute() {
            if (recomputeRunning) return;
            recomputeRunning = true;

            /* Read from Slate's model (source of truth) via bridge. */
            let fullText;
            const res = await slateBridgeCall('getText', sel);
            if (res.ok) {
                fullText = res.text || '';
            } else {
                fullText = getText(editor);
            }

            recomputeRunning = false;
            if (fullText === lastText) return;
            lastText = fullText;

            /* Tags already present in the post body (typed or appended). */
            const tagsInText = extractTagsInText(fullText);

            /* Run scoring engine. */
            const allScored = NS.hashtagRules.score(fullText, {
                blockedTags: settings.blockedTags,
                alwaysInclude: settings.alwaysInclude
            });

            const max = Math.max(1, Math.min(15, settings.maxTags | 0 || 5));

            /* Partition into pinned and contextual, filtering out tags in text. */
            const pinnedSet = new Set((settings.alwaysInclude || []).map(t => t.toUpperCase()));
            const pinned = [];
            const contextual = [];

            for (const s of allScored) {
                const upper = s.tag.toUpperCase();
                if (tagsInText.has(upper)) continue; /* Already in post — hide. */

                if (pinnedSet.has(upper)) {
                    pinned.push(upper);
                    pinnedSet.delete(upper); /* Don't double-add. */
                } else {
                    if (contextual.length < max) {
                        contextual.push(upper);
                    }
                }
            }

            /* Also add any pinned tags that didn't come from the scorer
               (no entity match, but user pinned them). */
            pinnedSet.forEach(t => {
                if (!tagsInText.has(t)) pinned.push(t);
            });

            renderStrip(strip, pinned, contextual);
        }

        function onInput() {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(recompute, DEBOUNCE_MS);
        }

        /* Listen on the editor itself. */
        editor.addEventListener('input', onInput);
        editor.addEventListener('change', onInput);

        /* Watch the prose preview sibling for changes — Slate/React
           updates the preview when the model changes, so we use it as
           a secondary change signal. Find it by looking for the .prose
           class rather than a fixed child index (our strip shifts indices). */
        const prosePreview = Array.from(col.children).find(c =>
            !c.contains(editor) &&
            !c.classList.contains(STRIP_CLASS) &&
            !c.querySelector('button[aria-label="Bold"]') &&
            c.querySelector('.prose')
        );
        if (prosePreview) {
            const proseObserver = new MutationObserver(() => {
                lastText = ''; /* Force recompute on next tick. */
                onInput();
            });
            proseObserver.observe(prosePreview, { childList: true, subtree: true, characterData: true });
        }

        /* Delegate chip clicks at the strip level. */
        strip.addEventListener('click', async (e) => {
            const chip = e.target.closest('.' + STRIP_CLASS + '-chip');
            if (!chip) return;
            e.preventDefault();
            e.stopPropagation();

            const tag = chip.dataset.tag;
            await appendTag(editor, tag);

            /* Trigger recompute so the chip disappears and new ones may appear. */
            lastText = '';
            /* Small delay to let Slate/React process the insertion. */
            setTimeout(recompute, 80);
        });

        /* Self-clean if the composer leaves the DOM (SPA navigation). */
        const deadmanCheck = setInterval(() => {
            if (!editor.isConnected) {
                clearInterval(deadmanCheck);
                strip.remove();
                log('composer removed from DOM, cleaned up');
            } else if (!strip.isConnected) {
                /* Strip was wiped by React re-render — re-insert. */
                const freshStructure = findComposerStructure(editor);
                if (freshStructure) {
                    freshStructure.col.insertBefore(strip, freshStructure.toolbar);
                    lastText = '';
                    recompute();
                }
            }
        }, 2000);

        /* Initial pass — show always-include tags immediately. */
        recompute();
        log('attached to composer');
    }

    /* ---- Lifecycle ---- */

    function rescan() {
        /* Also remove any orphaned old-style chip rows from v1. */
        document.querySelectorAll('.inleo-hashtag-assistant').forEach(el => el.remove());

        const candidates = findCandidates();
        candidates.forEach(attach);
    }

    /* Re-scan on route changes — /threads navigation is the main trigger. */
    if (route) route.subscribe(() => setTimeout(rescan, 400));

    NS.composerHashtags = { rescan };

    /* First sweep — delay to let the page mount. */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(rescan, 500));
    } else {
        setTimeout(rescan, 500);
    }
})();
