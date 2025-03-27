// --- Element References ---
const enableToggle = document.getElementById('enable-toggle');
const focusKeywordInput = document.getElementById('focusKeyword');
const globalMessageTextarea = document.getElementById('globalBlockMessageInput');
const saveButton = document.getElementById('save');
const statusDiv = document.getElementById('status');
const authorizeButton = document.getElementById('authorize');
const authStatusSpan = document.getElementById('auth-status');

// ** NEW UI Elements **
const sitesListContainer = document.getElementById('sites-list');
const addSiteButton = document.getElementById('add-site-button');
const siteEntryTemplate = document.getElementById('site-entry-template');

const defaultSitesConfig = [
    { domain: "youtube.com", message: "Maybe watch this <b>later</b>?" },
    { domain: "facebook.com", message: null },
    { domain: "reddit.com", message: "<h1>Focus time!</h1><p>No endless scrolling.</p>" }
];
const defaultGlobalMessage = '<h1>Site Blocked</h1><p>This site is blocked during your scheduled focus time.</p>';
const defaultFocusKeyword = '[Focus]';


// --- Helper to check if string contains youtube ---
function containsYouTube(domainString) {
    if (!domainString) return false;
    return domainString.split(',').some(part => {
        const trimmed = part.trim().toLowerCase();
        return trimmed === 'youtube.com' || trimmed === 'youtu.be';
    });
}

function checkAuthStatus() {
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

authorizeButton.addEventListener('click', () => {
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

// --- Site List UI Management ---

// Creates a DOM element for a single site entry
function createSiteEntryElement(domainString = '', message = '', allowedVideoIds = []) { // Added allowedVideoIds
    const content = siteEntryTemplate.content.cloneNode(true);
    const siteEntryDiv = content.querySelector('.site-entry');
    const domainInput = content.querySelector('.site-domain');
    const messageTextarea = content.querySelector('.site-message');
    const deleteButton = content.querySelector('.delete-button');
    const allowedVideosSection = content.querySelector('.allowed-videos-section');
    const allowedVideosTextarea = content.querySelector('.allowed-videos');

    domainInput.value = domainString;
    messageTextarea.value = message || '';
    allowedVideosTextarea.value = allowedVideoIds.join('\n'); // Join IDs with newlines for textarea

    // --- Logic to show/hide Allowed Videos section ---
    const toggleAllowedVideosVisibility = () => {
        if (containsYouTube(domainInput.value)) {
            allowedVideosSection.style.display = 'block';
        } else {
            allowedVideosSection.style.display = 'none';
        }
    };

    // Check visibility on creation and when domain input changes
    toggleAllowedVideosVisibility();
    domainInput.addEventListener('input', toggleAllowedVideosVisibility);
    // --- End Visibility Logic ---


    deleteButton.addEventListener('click', () => {
        siteEntryDiv.remove();
    });

    return siteEntryDiv;
}

// Renders the list of sites from the raw config data
function renderSitesList(rawConfig) {
    sitesListContainer.innerHTML = '';
    rawConfig.forEach(item => {
        // Pass raw domain string and allowed IDs (ensure it's an array)
        const element = createSiteEntryElement(item.domain, item.message, item.allowedVideoIds || []);
        sitesListContainer.appendChild(element);
    });
}

// --- Load Settings ---
function loadSettings() {
    chrome.storage.sync.get(['sitesConfig', 'globalBlockMessage', 'focusKeyword', 'isEnabled'], (data) => {
        const rawConfig = data.sitesConfig || defaultSitesConfig;
        renderSitesList(rawConfig); // Render using the raw config including allowedVideoIds

        // ... (load other settings as before) ...
        globalMessageTextarea.value = data.globalBlockMessage || defaultGlobalMessage;
        focusKeywordInput.value = data.focusKeyword || defaultFocusKeyword;
        enableToggle.checked = data.isEnabled === undefined ? true : data.isEnabled;
    });
    checkAuthStatus();
}

// --- Save Settings ---
saveButton.addEventListener('click', () => {
    const newRawSitesConfig = [];
    const siteEntryElements = sitesListContainer.querySelectorAll('.site-entry');

    siteEntryElements.forEach(element => {
        const domainInput = element.querySelector('.site-domain');
        const messageTextarea = element.querySelector('.site-message');
        const allowedVideosTextarea = element.querySelector('.allowed-videos'); // Get the new textarea

        const domainString = domainInput.value.trim();
        const message = messageTextarea.value.trim() || null;

        // Process Allowed Video IDs
        const rawVideoIds = allowedVideosTextarea.value.trim();
        const allowedVideoIds = rawVideoIds
            ? rawVideoIds.split(/[\n,]+/) // Split by newline OR comma
                  .map(id => id.trim())
                  .filter(id => /^[a-zA-Z0-9_-]{11}$/.test(id)) // Basic validation: 11 chars, YT charset
            : []; // Empty array if textarea is empty

        if (domainString) {
            // Store the potentially comma-separated string and the processed video IDs
            newRawSitesConfig.push({
                domain: domainString,
                message: message,
                allowedVideoIds: allowedVideoIds // Store the cleaned array
            });
            domainInput.style.borderColor = '';
        } else {
            console.warn("Skipping site entry with empty domain field.");
            domainInput.style.borderColor = 'red';
        }
    });

    const newGlobalMessage = globalMessageTextarea.value.trim() || defaultGlobalMessage;
    const keyword = focusKeywordInput.value.trim() || defaultFocusKeyword;
    const enabled = enableToggle.checked;

    // Save the raw config including allowedVideoIds
    chrome.storage.sync.set({
        sitesConfig: newRawSitesConfig,
        globalBlockMessage: newGlobalMessage,
        focusKeyword: keyword,
        isEnabled: enabled
    }, () => {
        statusDiv.textContent = 'Settings saved!';
        statusDiv.style.color = 'green';
        setTimeout(() => { statusDiv.textContent = ''; }, 3000);
        checkAuthStatus();
        chrome.runtime.sendMessage({ action: "settingsUpdated" }).catch(e => console.log("BG not listening? ", e));
    });
});

// Event listener for the "Add Site" button
addSiteButton.addEventListener('click', () => {
    const newEntry = createSiteEntryElement(); // Create empty entry
    sitesListContainer.appendChild(newEntry);
});



// --- Initialize ---
document.addEventListener('DOMContentLoaded', loadSettings);

// Add listener for messages from background (optional, but good practice)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateOptionsAuthStatus") {
        checkAuthStatus();
    }
});