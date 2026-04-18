document.addEventListener('DOMContentLoaded', () => {
    const usernameInput = document.getElementById('usernameInput');
    const addBtn = document.getElementById('addBtn');
    const userList = document.getElementById('userList');
    const hiveNodeSelect = document.getElementById('hiveNodeSelect');
    const nodeSavedIndicator = document.getElementById('node-saved');

    // ---- Muted Users ----

    function loadUsers() {
        chrome.storage.local.get({ mutedUsers: [] }, (result) => {
            userList.innerHTML = '';
            result.mutedUsers.forEach(user => {
                const li = document.createElement('li');
                li.textContent = user;
                const removeBtn = document.createElement('button');
                removeBtn.innerHTML = '&#10005;';
                removeBtn.className = 'remove-btn';
                removeBtn.onclick = () => removeUser(user);
                li.appendChild(removeBtn);
                userList.appendChild(li);
            });
        });
    }

    function addUser() {
        const user = usernameInput.value.trim().toLowerCase();
        if (!user) return;

        chrome.storage.local.get({ mutedUsers: [] }, (result) => {
            let users = result.mutedUsers;
            if (!users.includes(user)) {
                users.push(user);
                chrome.storage.local.set({ mutedUsers: users }, () => {
                    usernameInput.value = '';
                    loadUsers();
                });
            }
        });
    }

    function removeUser(user) {
        chrome.storage.local.get({ mutedUsers: [] }, (result) => {
            let users = result.mutedUsers.filter(u => u !== user);
            chrome.storage.local.set({ mutedUsers: users }, () => {
                loadUsers();
            });
        });
    }

    addBtn.addEventListener('click', addUser);
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addUser();
    });

    loadUsers();

    // ---- Muted Phrases ----

    const mutedPhrasesEl = document.getElementById('mutedPhrases');
    const phrasesSaved = document.getElementById('phrases-saved');

    chrome.storage.sync.get({ mutedPhrases: ['/rafiki'] }, (result) => {
        mutedPhrasesEl.value = (result.mutedPhrases || []).join('\n');
    });

    let phraseTimer = null;
    function schedulePhrasesSave() {
        if (phraseTimer) clearTimeout(phraseTimer);
        phraseTimer = setTimeout(() => {
            const lines = mutedPhrasesEl.value
                .split('\n')
                .map(l => l.trim().toLowerCase())
                .filter(Boolean);
            chrome.storage.sync.set({ mutedPhrases: lines }, () => {
                phrasesSaved.classList.add('show');
                setTimeout(() => phrasesSaved.classList.remove('show'), 1500);
            });
        }, 400);
    }

    mutedPhrasesEl.addEventListener('input', schedulePhrasesSave);
    mutedPhrasesEl.addEventListener('change', schedulePhrasesSave);

    // ---- Wallet: Hive API Node ----

    // Load saved node preference
    chrome.storage.sync.get({ hiveApiNode: 'https://api.deathwing.me' }, (result) => {
        hiveNodeSelect.value = result.hiveApiNode;
    });

    // Save on change
    hiveNodeSelect.addEventListener('change', () => {
        chrome.storage.sync.set({ hiveApiNode: hiveNodeSelect.value }, () => {
            // Flash "Saved" indicator
            nodeSavedIndicator.classList.add('show');
            setTimeout(() => nodeSavedIndicator.classList.remove('show'), 1500);
        });
    });

    // ---- Hashtag Assistant ----
    const hashEnabled = document.getElementById('hashtag-enabled');
    const hashMax = document.getElementById('hashtag-max');
    const hashAlways = document.getElementById('hashtag-always');
    const hashBlocked = document.getElementById('hashtag-blocked');
    const hashSaved = document.getElementById('hashtag-saved');

    const HASHTAG_DEFAULTS = {
        enabled: true,
        maxTags: 5,
        alwaysInclude: ['leofinance'],
        blockedTags: []
    };

    function tagsToString(arr) {
        return (arr || []).join(', ');
    }
    function stringToTags(s) {
        return (s || '')
            .split(',')
            .map(t => t.trim().toLowerCase().replace(/^#/, ''))
            .filter(Boolean);
    }

    // Load saved hashtag settings (merged with defaults for forward-compat)
    chrome.storage.sync.get({ hashtagSettings: HASHTAG_DEFAULTS }, (result) => {
        const s = { ...HASHTAG_DEFAULTS, ...(result.hashtagSettings || {}) };
        hashEnabled.checked = !!s.enabled;
        hashMax.value = s.maxTags;
        hashAlways.value = tagsToString(s.alwaysInclude);
        hashBlocked.value = tagsToString(s.blockedTags);
    });

    let saveTimer = null;
    function scheduleSave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(commitHashtagSettings, 300);
    }
    function commitHashtagSettings() {
        const next = {
            enabled: !!hashEnabled.checked,
            maxTags: Math.max(1, Math.min(15, parseInt(hashMax.value, 10) || HASHTAG_DEFAULTS.maxTags)),
            alwaysInclude: stringToTags(hashAlways.value),
            blockedTags: stringToTags(hashBlocked.value)
        };
        chrome.storage.sync.set({ hashtagSettings: next }, () => {
            hashSaved.classList.add('show');
            setTimeout(() => hashSaved.classList.remove('show'), 1500);
        });
    }

    [hashEnabled, hashMax, hashAlways, hashBlocked].forEach(el => {
        el.addEventListener('change', scheduleSave);
        el.addEventListener('input', scheduleSave);
    });
});
