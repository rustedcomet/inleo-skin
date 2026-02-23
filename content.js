let currentThemeLink = null;

function applyTheme(themeName) {
    // Remove existing theme
    if (currentThemeLink) {
        currentThemeLink.remove();
        currentThemeLink = null;
    }

    // If none, stop
    if (!themeName || themeName === 'none') {
        document.documentElement.removeAttribute('data-inleo-skin');
        document.documentElement.style.removeProperty('--bg-image');
        return;
    }

    // Set skin attribute
    document.documentElement.setAttribute('data-inleo-skin', themeName);

    // Set background image CSS variable dynamically to bypass chrome-extension:// path issues in injected CSS
    let bgImageUrl = '';
    if (themeName === 'cyberpunk') {
        bgImageUrl = `url('${chrome.runtime.getURL("img/000.png")}')`;
    } else if (themeName === 'godzilla') {
        bgImageUrl = `url('${chrome.runtime.getURL("img/001.jpg")}')`;
    }
    document.documentElement.style.setProperty('--bg-image', bgImageUrl);

    // Inject the theme CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL(`themes/${themeName}.css`);
    link.id = 'inleo-skin-theme-stylesheet';

    document.head.appendChild(link);
    currentThemeLink = link;
    console.log(`[Inleo Skins] Applied theme: ${themeName} with bg ${bgImageUrl}`);
}

// Initial load
chrome.storage.sync.get(['activeTheme'], (result) => {
    if (result.activeTheme) {
        applyTheme(result.activeTheme);
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateTheme") {
        applyTheme(request.theme);
        sendResponse({ status: "ok" });
    }
});
