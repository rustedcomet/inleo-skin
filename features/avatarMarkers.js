/* features/avatarMarkers.js — Adds `.avatar-self-target` /
   `.avatar-other-target` classes to avatar wrappers so themes can
   outline your own avatar differently from everyone else's.

   Inleo wraps each avatar's parent span with `id="<username>"`, which
   is the most reliable signal we have for "who does this avatar
   belong to". We walk up at most 4 ancestors to find that ID. */
(function () {
    const NS = (window.InleoSkins = window.InleoSkins || {});
    const state = NS.state;

    function markAll() {
        const avatars = document.querySelectorAll('img[src*="avatar"]');
        const self = state.currentUser;

        avatars.forEach(img => {
            let targetNode = img.parentElement;
            let foundUsername = null;
            for (let i = 0; i < 4; i++) {
                if (!targetNode) break;
                if (targetNode.id && targetNode.id.trim() !== '') {
                    foundUsername = targetNode.id.toLowerCase().trim();
                    break;
                }
                targetNode = targetNode.parentElement;
            }

            if (!foundUsername || !targetNode) return;

            if (self && foundUsername === self) {
                targetNode.classList.add('avatar-self-target');
                targetNode.classList.remove('avatar-other-target');
            } else {
                targetNode.classList.add('avatar-other-target');
                targetNode.classList.remove('avatar-self-target');
            }
        });
    }

    NS.avatarMarkers = { markAll };
})();
