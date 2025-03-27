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
function createSiteEntryElement(domainString = '', message = '') { // Renamed param for clarity
    const content = siteEntryTemplate.content.cloneNode(true);
    const siteEntryDiv = content.querySelector('.site-entry');
    const domainInput = content.querySelector('.site-domain');
    const messageTextarea = content.querySelector('.site-message');
    const deleteButton = content.querySelector('.delete-button');

    domainInput.value = domainString; // Display the raw string
    messageTextarea.value = message || '';

    deleteButton.addEventListener('click', () => {
        siteEntryDiv.remove();
    });

    return siteEntryDiv;
}

// Renders the list of sites from the config data
function renderSitesList(rawConfig) { // Takes the raw config from storage
    sitesListContainer.innerHTML = '';
    rawConfig.forEach(item => {
        // Pass the raw domain string (potentially comma-separated)
        const element = createSiteEntryElement(item.domain, item.message);
        sitesListContainer.appendChild(element);
    });
}

// --- Load Settings ---
function loadSettings() {
    // Retrieve the raw config as stored
    chrome.storage.sync.get(['sitesConfig', 'globalBlockMessage', 'focusKeyword', 'isEnabled'], (data) => {
        const rawConfig = data.sitesConfig || defaultSitesConfig; // Use raw config
        const globalMessage = data.globalBlockMessage || defaultGlobalMessage;

        renderSitesList(rawConfig); // Render using the raw config

        globalMessageTextarea.value = globalMessage;
        focusKeywordInput.value = data.focusKeyword || defaultFocusKeyword;
        enableToggle.checked = data.isEnabled === undefined ? true : data.isEnabled;
    });
    checkAuthStatus();
}

// --- Save Settings ---
saveButton.addEventListener('click', () => {
    const newRawSitesConfig = []; // Store the raw input data
    const siteEntryElements = sitesListContainer.querySelectorAll('.site-entry');

    siteEntryElements.forEach(element => {
        const domainInput = element.querySelector('.site-domain');
        const messageTextarea = element.querySelector('.site-message');

        // Read the raw domain string, trim overall whitespace
        const domainString = domainInput.value.trim();
        const message = messageTextarea.value.trim() || null;

        // Basic validation: raw domain string shouldn't be empty
        if (domainString) {
            // Store the potentially comma-separated string directly
            newRawSitesConfig.push({ domain: domainString, message: message });
             domainInput.style.borderColor = ''; // Reset border color on success
        } else {
            console.warn("Skipping site entry with empty domain field.");
            domainInput.style.borderColor = 'red'; // Optional: visual feedback
        }
    });

    const newGlobalMessage = globalMessageTextarea.value.trim() || defaultGlobalMessage;
    const keyword = focusKeywordInput.value.trim() || defaultFocusKeyword; // Ensure keyword has default
    const enabled = enableToggle.checked;

    // Save the raw config using the same key
    chrome.storage.sync.set({
        sitesConfig: newRawSitesConfig, // Save the array with potentially comma-separated strings
        globalBlockMessage: newGlobalMessage,
        focusKeyword: keyword,
        isEnabled: enabled
    }, () => {
        // ... (status update, auth check, inform background) ...
        statusDiv.textContent = 'Settings saved!';
        statusDiv.style.color = 'green';
        setTimeout(() => { statusDiv.textContent = ''; }, 3000);
        checkAuthStatus();
        chrome.runtime.sendMessage({ action: "settingsUpdated" }).catch(e => console.log("BG not listening? ", e));
    });
});


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



// --- Initialize ---
document.addEventListener('DOMContentLoaded', loadSettings);

// Add listener for messages from background (optional, but good practice)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateOptionsAuthStatus") {
        checkAuthStatus();
    }
});