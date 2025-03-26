// --- Element References ---
const enableToggle = document.getElementById('enable-toggle');
const focusKeywordInput = document.getElementById('focusKeyword');
// ** NEW/RENAMED **
const sitesConfigTextarea = document.getElementById('sitesConfigInput');
const globalMessageTextarea = document.getElementById('globalBlockMessageInput');
const saveButton = document.getElementById('save');
const statusDiv = document.getElementById('status');
const authorizeButton = document.getElementById('authorize');
const authStatusSpan = document.getElementById('auth-status');

// --- Defaults ---
const defaultSitesConfig = [
    { domain: "youtube.com", message: "Maybe watch this later?" },
    { domain: "facebook.com", message: null },
    { domain: "twitter.com", message: null },
    { domain: "reddit.com", message: "Focus time! No endless scrolling." }
];
const defaultGlobalMessage = 'This site is blocked during your scheduled focus time.';
const defaultFocusKeyword = '[Focus]';

// --- Authorization (Keep as before) ---
function checkAuthStatus() { /* ... no changes needed ... */
    authStatusSpan.textContent = 'Checking...';
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError || !token) {
            authStatusSpan.textContent = 'Not Authorized';
            authStatusSpan.style.color = 'red';
        } else {
            authStatusSpan.textContent = 'Authorized';
            authStatusSpan.style.color = 'green';
        }
    });
}
authorizeButton.addEventListener('click', () => { /* ... no changes needed ... */
    authStatusSpan.textContent = 'Authorizing...';
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
            authStatusSpan.textContent = 'Authorization Failed/Declined';
            authStatusSpan.style.color = 'red';
            statusDiv.textContent = `Authorization error: ${chrome.runtime.lastError?.message}`;
        } else {
            authStatusSpan.textContent = 'Authorized Successfully!';
            authStatusSpan.style.color = 'green';
            statusDiv.textContent = 'Authorization successful.';
        }
    });
});


// --- Load Settings ---
function loadSettings() {
    // ** MODIFIED: Use new keys 'sitesConfig', 'globalBlockMessage' **
    chrome.storage.sync.get(['sitesConfig', 'globalBlockMessage', 'focusKeyword', 'isEnabled'], (data) => {
        const config = data.sitesConfig || defaultSitesConfig;
        const globalMessage = data.globalBlockMessage || defaultGlobalMessage;

        // Format config object array back into textarea string
        sitesConfigTextarea.value = config.map(item => {
            return item.domain + (item.message ? ` || ${item.message}` : '');
        }).join('\n');

        globalMessageTextarea.value = globalMessage;
        focusKeywordInput.value = data.focusKeyword || defaultFocusKeyword;
        enableToggle.checked = data.isEnabled === undefined ? true : data.isEnabled;
    });
    checkAuthStatus();
}

// --- Save Settings ---
saveButton.addEventListener('click', () => {
    const lines = sitesConfigTextarea.value.split('\n');
    const newSitesConfig = [];

    // ** MODIFIED: Parse the textarea format **
    for (const line of lines) {
        if (!line.trim()) continue; // Skip empty lines

        const parts = line.split('||');
        const domainInput = parts[0].trim();
        const customMessage = parts.length > 1 ? parts[1].trim() : null;

        // **Use the extractDomain helper (assuming it exists globally or import it)**
        // If background.js handles extractDomain, we might need to simplify here
        // or duplicate the logic if necessary. For now, let's assume basic trim.
        // A robust solution would involve messaging the background script or duplicating.
        // Simple version for options page: just use the trimmed input. Background validates.
        const domain = domainInput; // Basic validation happens in background

        if (domain) {
            newSitesConfig.push({
                domain: domain, // Store the raw input domain for now
                message: customMessage || null // Store null if message is empty/missing
            });
        } else {
            console.warn("Skipping invalid line in config:", line);
        }
    }

    const newGlobalMessage = globalMessageTextarea.value.trim() || defaultGlobalMessage; // Ensure not empty
    const keyword = focusKeywordInput.value.trim();
    const enabled = enableToggle.checked;

    // ** MODIFIED: Save using new keys **
    chrome.storage.sync.set({
        sitesConfig: newSitesConfig,
        globalBlockMessage: newGlobalMessage,
        focusKeyword: keyword,
        isEnabled: enabled
    }, () => {
        statusDiv.textContent = 'Settings saved!';
        statusDiv.style.color = 'green';
        setTimeout(() => { statusDiv.textContent = ''; }, 3000);
        checkAuthStatus();

        // Optionally trigger immediate background check (keep existing logic if desired)
        chrome.runtime.sendMessage({ action: "settingsUpdated" }).catch(e => console.log("BG not listening? ", e)); // Inform background script

    });
});

// --- Initialize ---
document.addEventListener('DOMContentLoaded', loadSettings);

// Add listener for messages from background (optional, but good practice)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateOptionsAuthStatus") {
        checkAuthStatus();
    }
});