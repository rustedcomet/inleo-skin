chrome.runtime.onInstalled.addListener(() => {
    console.log("Inleo Skins Extension installed.");
    // Set default theme to none if not set
    chrome.storage.sync.get(['activeTheme'], (result) => {
        if (!result.activeTheme) {
            chrome.storage.sync.set({ activeTheme: 'none' });
        }
    });
});
