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
const exportButton = document.getElementById('export-button');
const importButton = document.getElementById('import-button');
const importFileInput = document.getElementById('import-file-input');
const importStatusDiv = document.getElementById('import-status');



// --- Config Keys to Export/Import ---
const CONFIG_KEYS = ['focusKeyword', 'sitesConfig', 'globalBlockMessage', 'isEnabled']; // Include isEnabled

// --- Export Function ---
async function exportSettings() {
    try {
        const settings = await chrome.storage.sync.get(CONFIG_KEYS);
        // Use the raw sitesConfig as stored for export
        const settingsJson = JSON.stringify(settings, null, 2); // Pretty print JSON
        const blob = new Blob([settingsJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'focus-blocker-settings.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        importStatusDiv.textContent = 'Settings exported successfully.';
        importStatusDiv.className = 'success';
    } catch (error) {
        console.error("Error exporting settings:", error);
        importStatusDiv.textContent = `Error exporting settings: ${error.message}`;
        importStatusDiv.className = 'error';
    }
}

// --- Import Function ---
function importSettings(event) {
    const file = event.target.files[0];
    if (!file) {
        importStatusDiv.textContent = 'No file selected.';
        importStatusDiv.className = 'error';
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const text = e.target.result;
            const importedSettings = JSON.parse(text);

            // ** Basic Validation **
            if (typeof importedSettings !== 'object' || importedSettings === null) {
                throw new Error("Invalid file format. Not a JSON object.");
            }

            const settingsToSave = {};
            let validationOk = true;

            // Validate and prepare each key
            if (CONFIG_KEYS.includes('focusKeyword')) {
                if (typeof importedSettings.focusKeyword === 'string') {
                    settingsToSave.focusKeyword = importedSettings.focusKeyword;
                } else if (importedSettings.focusKeyword !== undefined) {
                    console.warn("Import Warning: Invalid 'focusKeyword' type, using default.");
                    // settingsToSave.focusKeyword = defaultFocusKeyword; // Or just omit
                }
            }
            if (CONFIG_KEYS.includes('globalBlockMessage')) {
                 if (typeof importedSettings.globalBlockMessage === 'string') {
                    settingsToSave.globalBlockMessage = importedSettings.globalBlockMessage;
                } else if (importedSettings.globalBlockMessage !== undefined) {
                    console.warn("Import Warning: Invalid 'globalBlockMessage' type, using default.");
                    // settingsToSave.globalBlockMessage = defaultGlobalMessage; // Or just omit
                }
            }
             if (CONFIG_KEYS.includes('isEnabled')) {
                if (typeof importedSettings.isEnabled === 'boolean') {
                    settingsToSave.isEnabled = importedSettings.isEnabled;
                } else if (importedSettings.isEnabled !== undefined) {
                     console.warn("Import Warning: Invalid 'isEnabled' type, using default (true).");
                     settingsToSave.isEnabled = true; // Default to true on bad import type
                }
             }
            if (CONFIG_KEYS.includes('sitesConfig')) {
                 if (Array.isArray(importedSettings.sitesConfig)) {
                    // Optional: Deeper validation of sitesConfig structure here if needed
                    // e.g., check if items have 'domain' string, 'allowedVideos' array etc.
                    // For now, we trust the structure and let loadStateFromStorage handle processing.
                    settingsToSave.sitesConfig = importedSettings.sitesConfig;
                } else if (importedSettings.sitesConfig !== undefined) {
                    validationOk = false;
                    throw new Error("Invalid 'sitesConfig' format. Must be an array.");
                }
             }

            if (!validationOk) {
                // Error already thrown by validation logic above
                return;
            }

            // Save validated settings
            await chrome.storage.sync.set(settingsToSave);

            importStatusDiv.textContent = 'Settings imported successfully! Reloading UI...';
            importStatusDiv.className = 'success';

            // Reload the options UI to reflect imported settings
            loadSettings();

            // Inform background script that settings might have changed drastically
            chrome.runtime.sendMessage({ action: "settingsUpdated" }).catch(e => console.log("BG not listening? ", e));

        } catch (error) {
            console.error("Error importing settings:", error);
            importStatusDiv.textContent = `Error importing settings: ${error.message}`;
            importStatusDiv.className = 'error';
        } finally {
            // Reset file input so the same file can be selected again if needed
            importFileInput.value = '';
        }
    };

    reader.onerror = (e) => {
        console.error("File reading error:", e);
        importStatusDiv.textContent = 'Error reading the selected file.';
        importStatusDiv.className = 'error';
        importFileInput.value = ''; // Reset input
    };

    reader.readAsText(file);
}

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

exportButton.addEventListener('click', exportSettings);
importButton.addEventListener('click', () => importFileInput.click()); // Trigger hidden input
importFileInput.addEventListener('change', importSettings);

// --- Site List UI Management ---

// Creates a DOM element for a single site entry
function createSiteEntryElement(domainString = '', message = '', allowedVideos = []) { // Added allowedVideoIds
    const content = siteEntryTemplate.content.cloneNode(true);
    const siteEntryDiv = content.querySelector('.site-entry');
    const domainInput = content.querySelector('.site-domain');
    const messageTextarea = content.querySelector('.site-message');
    const deleteButton = content.querySelector('.delete-button');
    const allowedVideosSection = content.querySelector('.allowed-videos-section');
    const allowedVideosTextarea = content.querySelector('.allowed-videos');

    domainInput.value = domainString;
    messageTextarea.value = message || '';
    const allowedVideosString = allowedVideos
        .map(video => `${video.id} | ${video.name}`)
        .join('\n');
    allowedVideosTextarea.value = allowedVideosString;

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
        const element = createSiteEntryElement(item.domain, item.message, item.allowedVideos || []);
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
        const rawVideosInput = allowedVideosTextarea.value.trim();
        const allowedVideos = []; // Array of {id, name} objects
        if (rawVideosInput) {
            rawVideosInput.split('\n').forEach(line => {
                const parts = line.split('|');
                const id = parts[0]?.trim();
                const name = parts[1]?.trim() || id; // Use ID as name if name part is missing

                // Validate ID format
                if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
                    allowedVideos.push({ id: id, name: name });
                } else if (id) { // Log if ID was present but invalid
                    console.warn(`Invalid YouTube ID format skipped: "${id}"`);
                }
            });
        }

        if (domainString) {
            // Store the potentially comma-separated string and the processed video IDs
            newRawSitesConfig.push({
                domain: domainString,
                message: message,
                allowedVideos: allowedVideos // Store the cleaned array
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