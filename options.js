document.addEventListener('DOMContentLoaded', () => {
    const usernameInput = document.getElementById('usernameInput');
    const addBtn = document.getElementById('addBtn');
    const userList = document.getElementById('userList');

    // Load blocked users
    function loadUsers() {
        chrome.storage.local.get({ mutedUsers: [] }, (result) => {
            userList.innerHTML = '';
            result.mutedUsers.forEach(user => {
                const li = document.createElement('li');
                li.textContent = user;
                const removeBtn = document.createElement('button');
                removeBtn.innerHTML = '&#10005;'; // X mark
                removeBtn.className = 'remove-btn';
                removeBtn.onclick = () => removeUser(user);
                li.appendChild(removeBtn);
                userList.appendChild(li);
            });
        });
    }

    // Add a user
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

    // Remove a user
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
});
