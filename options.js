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
});
