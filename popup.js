document.addEventListener('DOMContentLoaded', () => {
    const themeSelect = document.getElementById('theme-select');
    const applyBtn = document.getElementById('apply-btn');

    // Load saved theme state
    chrome.storage.sync.get(['activeTheme'], (result) => {
        if (result.activeTheme) {
            themeSelect.value = result.activeTheme;
        }
    });

    // Save and apply theme
    applyBtn.addEventListener('click', () => {
        const selectedTheme = themeSelect.value;
        chrome.storage.sync.set({ activeTheme: selectedTheme }, () => {
            // Notify the active tab to reload or update the theme
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && tabs[0].url.includes("inleo.io")) {
                    // Send a message to the content script of the active tab
                    chrome.tabs.sendMessage(tabs[0].id, { action: "updateTheme", theme: selectedTheme }, (response) => {
                        // Optional: close popup or show a success checkmark
                        if (chrome.runtime.lastError) {
                            // content script might not be injected yet
                            chrome.tabs.reload(tabs[0].id);
                        }
                        window.close();
                    });
                }
            });
        });
    });
});
