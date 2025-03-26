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
function createSiteEntryElement(domain = '', message = '') {
    const content = siteEntryTemplate.content.cloneNode(true);
    const siteEntryDiv = content.querySelector('.site-entry');
    const domainInput = content.querySelector('.site-domain');
    const messageTextarea = content.querySelector('.site-message');
    const deleteButton = content.querySelector('.delete-button');

    domainInput.value = domain;
    messageTextarea.value = message || ''; // Ensure empty string if null/undefined

    deleteButton.addEventListener('click', () => {
        siteEntryDiv.remove(); // Remove the element from the DOM
    });

    return siteEntryDiv;
}

// Renders the list of sites from the config data
function renderSitesList(config) {
    // Clear existing entries
    sitesListContainer.innerHTML = '';
    // Add entries from config
    config.forEach(item => {
        const element = createSiteEntryElement(item.domain, item.message);
        sitesListContainer.appendChild(element);
    });
}

// Event listener for the "Add Site" button
addSiteButton.addEventListener('click', () => {
    const newEntry = createSiteEntryElement(); // Create empty entry
    sitesListContainer.appendChild(newEntry);
});


// --- Load Settings ---
function loadSettings() {
    chrome.storage.sync.get(['sitesConfig', 'globalBlockMessage', 'focusKeyword', 'isEnabled'], (data) => {
        const config = data.sitesConfig || defaultSitesConfig;
        const globalMessage = data.globalBlockMessage || defaultGlobalMessage;

        // ** NEW: Render the dynamic list **
        renderSitesList(config);

        globalMessageTextarea.value = globalMessage;
        focusKeywordInput.value = data.focusKeyword || defaultFocusKeyword;
        enableToggle.checked = data.isEnabled === undefined ? true : data.isEnabled;
    });
    checkAuthStatus();
}

// --- Save Settings ---
saveButton.addEventListener('click', () => {
    const newSitesConfig = [];
    const siteEntryElements = sitesListContainer.querySelectorAll('.site-entry');

    // ** NEW: Read data from the dynamic UI elements **
    siteEntryElements.forEach(element => {
        const domainInput = element.querySelector('.site-domain');
        const messageTextarea = element.querySelector('.site-message');

        const domain = domainInput.value.trim();
        const message = messageTextarea.value.trim() || null; // Store null if empty

        // Basic validation: domain shouldn't be empty
        if (domain) {
             // Further validation (like using extractDomain) could be added here,
             // but the background script *must* re-validate anyway.
            newSitesConfig.push({ domain: domain, message: message });
        } else {
            console.warn("Skipping site entry with empty domain.");
            // Optional: Add visual feedback to the user
            domainInput.style.borderColor = 'red';
        }
    });

    const newGlobalMessage = globalMessageTextarea.value.trim() || defaultGlobalMessage;
    const keyword = focusKeywordInput.value.trim();
    const enabled = enableToggle.checked;

    // Save using the same keys as before
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

        // Inform background script
        chrome.runtime.sendMessage({ action: "settingsUpdated" }).catch(e => console.log("BG not listening? ", e));
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