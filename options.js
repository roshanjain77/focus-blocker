// options.js

// --- Element References ---
const enableToggle = document.getElementById('enable-toggle');
const globalMessageTextarea = document.getElementById('globalBlockMessageInput');
const saveButton = document.getElementById('save');
const statusDiv = document.getElementById('status');
const authorizeButton = document.getElementById('authorize');
const authStatusSpan = document.getElementById('auth-status');

// Profile Section Elements
const profilesListContainer = document.getElementById('profiles-list');
const profileListItemTemplate = document.getElementById('profile-list-item-template');
const addProfileForm = document.getElementById('add-profile-form');
const profileFormTitle = document.getElementById('profile-form-title');
const profileEditNameInput = document.getElementById('profile-edit-name'); // Hidden input
const profileNameInput = document.getElementById('profile-name');
const profileKeywordInput = document.getElementById('profile-keyword');
const saveProfileButton = document.getElementById('save-profile-button');
const cancelProfileButton = document.getElementById('cancel-profile-button');

// Site Rules Section Elements
const sitesListContainer = document.getElementById('sites-list');
const addSiteButton = document.getElementById('add-site-button');
const siteEntryTemplate = document.getElementById('site-entry-template');

// Import/Export Elements
const exportButton = document.getElementById('export-button');
const importButton = document.getElementById('import-button');
const importFileInput = document.getElementById('import-file-input');
const importStatusDiv = document.getElementById('import-status');

// --- Default / State Variables ---
let currentProfilesConfig = []; // Holds the loaded profiles config
const defaultGlobalMessage = '<h1>Site Blocked</h1><p>This site is blocked during your scheduled focus time.</p>';
const defaultProfiles = [{ name: "Manual", keyword: null }]; // Default profile (Manual cannot be deleted)
const defaultSitesConfig = []; // Start with no default rules now

// --- Helper: Show feedback message ---
function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.style.color = isError ? 'red' : 'green';
    setTimeout(() => { statusDiv.textContent = ''; }, isError ? 5000 : 3000);
}
function showImportStatus(message, isError = false) {
    importStatusDiv.textContent = message;
    importStatusDiv.className = isError ? 'error' : 'success';
    // Don't auto-clear import status, user should see it
}


// --- Authorization Functions --- (Keep as before)
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

// --- Profile Management ---

// Render the list of profiles
function renderProfilesList() {
    profilesListContainer.innerHTML = ''; // Clear existing
    currentProfilesConfig.forEach(profile => {
        const content = profileListItemTemplate.content.cloneNode(true);
        const li = content.querySelector('li');
        const nameStrong = content.querySelector('strong');
        const keywordSpan = content.querySelector('span');
        const editButton = content.querySelector('.edit-button');
        const deleteButton = content.querySelector('.delete-button');

        nameStrong.textContent = profile.name;
        keywordSpan.textContent = profile.keyword ? `(Keyword: ${profile.keyword})` : '(Manual / No Keyword)';

        // Disable delete/edit for "Manual" profile
        if (profile.name.toLowerCase() === "manual") {
            editButton.disabled = true;
            deleteButton.disabled = true;
            editButton.title = "The 'Manual' profile cannot be edited.";
            deleteButton.title = "The 'Manual' profile cannot be deleted.";
            editButton.style.opacity = 0.5;
            deleteButton.style.opacity = 0.5;
            editButton.style.cursor = 'not-allowed';
            deleteButton.style.cursor = 'not-allowed';
        } else {
            editButton.addEventListener('click', () => startEditProfile(profile));
            deleteButton.addEventListener('click', () => deleteProfile(profile.name));
        }

        profilesListContainer.appendChild(li);
    });
    // After rendering profiles, need to re-render site rules checkboxes
    renderSitesList(null); // Pass null to signal re-rendering checkboxes on existing items
}

// Reset the profile add/edit form
function resetProfileForm() {
    profileFormTitle.textContent = "Add New Profile";
    profileEditNameInput.value = ""; // Clear hidden edit name
    profileNameInput.value = "";
    profileKeywordInput.value = "";
    profileNameInput.disabled = false; // Re-enable name input
    cancelProfileButton.style.display = 'none';
}

// Start editing an existing profile
function startEditProfile(profile) {
    profileFormTitle.textContent = `Edit Profile: ${profile.name}`;
    profileEditNameInput.value = profile.name; // Store original name being edited
    profileNameInput.value = profile.name;
    profileKeywordInput.value = profile.keyword || "";
    profileNameInput.disabled = true; // Prevent changing the name while editing
    cancelProfileButton.style.display = 'inline-block';
    profileNameInput.focus(); // Focus keyword input might be better
}

// Save or Add a profile
saveProfileButton.addEventListener('click', () => {
    const newName = profileNameInput.value.trim();
    const newKeyword = profileKeywordInput.value.trim() || null; // Store null if empty
    const originalName = profileEditNameInput.value; // Get name being edited (if any)

    if (!newName) {
        showStatus("Profile name cannot be empty.", true);
        return;
    }

    // Check for duplicate names (case-insensitive), excluding the one being edited
    const isDuplicate = currentProfilesConfig.some(p =>
        p.name.toLowerCase() === newName.toLowerCase() && p.name !== originalName
    );
    if (isDuplicate) {
        showStatus(`Profile name "${newName}" already exists.`, true);
        return;
    }
    // Check for duplicate keywords (optional, but recommended)
     if (newKeyword) {
         const keywordDuplicate = currentProfilesConfig.some(p =>
            p.keyword && p.keyword.toLowerCase() === newKeyword.toLowerCase() && p.name !== originalName
         );
         if (keywordDuplicate) {
            showStatus(`Keyword "${newKeyword}" is already used by another profile.`, true);
            return;
         }
     }


    if (originalName) { // Editing existing profile
        const profileIndex = currentProfilesConfig.findIndex(p => p.name === originalName);
        if (profileIndex > -1) {
            // Only update keyword for existing profile (name is disabled)
            currentProfilesConfig[profileIndex].keyword = newKeyword;
            showStatus(`Profile "${originalName}" updated.`);
        }
    } else { // Adding new profile
        currentProfilesConfig.push({ name: newName, keyword: newKeyword });
        showStatus(`Profile "${newName}" added.`);
    }

    renderProfilesList(); // Re-render the list
    resetProfileForm(); // Clear the form
    // Note: Changes are not saved to storage until "Save All Settings" is clicked
});

// Cancel editing
cancelProfileButton.addEventListener('click', resetProfileForm);

// Delete a profile
function deleteProfile(profileNameToDelete) {
    if (profileNameToDelete.toLowerCase() === "manual") return; // Should be disabled, but double check

    if (confirm(`Are you sure you want to delete the profile "${profileNameToDelete}"? \nRules assigned ONLY to this profile will also be removed.`)) {
        currentProfilesConfig = currentProfilesConfig.filter(p => p.name !== profileNameToDelete);

        // Also potentially clean up site rules that ONLY belong to this profile
        // This happens during the main save function now.

        renderProfilesList(); // Update profile list UI
        resetProfileForm(); // Reset form in case it was editing the deleted one
        showStatus(`Profile "${profileNameToDelete}" deleted. Save all settings to confirm rule removal.`);
    }
}


// --- Site Rule Management ---

// Creates a DOM element for a single site entry
function createSiteEntryElement(siteData = {}) {
    const content = siteEntryTemplate.content.cloneNode(true);
    const siteEntryDiv = content.querySelector('.site-entry');
    const idInput = content.querySelector('.site-entry-id');
    const blockAllCheckbox = content.querySelector('.block-all-checkbox');
    const domainInput = content.querySelector('.site-domain');
    const messageTextarea = content.querySelector('.site-message');
    const allowedVideosSection = content.querySelector('.allowed-videos-section');
    const allowedVideosTextarea = content.querySelector('.allowed-videos');
    const profileCheckboxesContainer = content.querySelector('.profile-checkboxes-container');
    const deleteRuleButton = content.querySelector('.delete-button');

    // Assign unique ID if it's a new entry
    const entryId = siteData.id || crypto.randomUUID();
    idInput.value = entryId;

    // Set initial values
    blockAllCheckbox.checked = siteData.blockAll || false;
    domainInput.value = siteData.domain || '';
    messageTextarea.value = siteData.message || '';
    allowedVideosTextarea.value = (siteData.allowedVideos || [])
        .map(v => `${v.id} | ${v.name}`).join('\n');

    const assignedProfiles = new Set(siteData.profiles || []); // Set for easy lookup

    // Populate profile checkboxes
    profileCheckboxesContainer.innerHTML = ''; // Clear existing
    currentProfilesConfig.forEach(profile => {
        const span = document.createElement('span');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = profile.name;
        checkbox.id = `profile_${entryId}_${profile.name.replace(/\s+/g, '_')}`; // Unique ID for label
        checkbox.checked = assignedProfiles.has(profile.name);

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = profile.name;

        span.appendChild(checkbox);
        span.appendChild(label);
        profileCheckboxesContainer.appendChild(span);
    });

    // --- Event Listener for Block All Checkbox ---
    const toggleRuleType = () => {
        if (blockAllCheckbox.checked) {
            domainInput.disabled = true;
            domainInput.classList.add('disabled');
            allowedVideosTextarea.disabled = true;
            allowedVideosTextarea.classList.add('disabled');
            allowedVideosSection.style.opacity = 0.5; // Visually indicate disabled
        } else {
            domainInput.disabled = false;
            domainInput.classList.remove('disabled');
            allowedVideosTextarea.disabled = false;
            allowedVideosTextarea.classList.remove('disabled');
            allowedVideosSection.style.opacity = 1;
        }
    };

    blockAllCheckbox.addEventListener('change', toggleRuleType);
    toggleRuleType(); // Set initial state

    // --- Delete Button ---
    deleteRuleButton.addEventListener('click', () => {
        if (confirm("Are you sure you want to delete this blocking rule?")) {
            siteEntryDiv.remove();
            // Changes saved on "Save All"
        }
    });

    return siteEntryDiv;
}

// Renders the list of site rules
// If rawConfig is null, it assumes profiles changed and just updates checkboxes in existing rules
function renderSitesList(rawConfig) {
    if (rawConfig !== null) { // Full re-render
        sitesListContainer.innerHTML = '';
         // Ensure default is an empty array if null/undefined
        (rawConfig || []).forEach(item => {
            const element = createSiteEntryElement(item);
            sitesListContainer.appendChild(element);
        });
    } else { // Just update profile checkboxes on existing elements
        const siteEntryElements = sitesListContainer.querySelectorAll('.site-entry');
        siteEntryElements.forEach(element => {
            const idInput = element.querySelector('.site-entry-id');
            const entryId = idInput.value;
            const profileCheckboxesContainer = element.querySelector('.profile-checkboxes-container');
            const previouslyChecked = new Set();
            // Store currently checked profiles before clearing
            profileCheckboxesContainer.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
                previouslyChecked.add(cb.value);
            });

            // Repopulate checkboxes based on currentProfilesConfig
            profileCheckboxesContainer.innerHTML = ''; // Clear existing checkboxes
            currentProfilesConfig.forEach(profile => {
                const span = document.createElement('span');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = profile.name;
                checkbox.id = `profile_${entryId}_${profile.name.replace(/\s+/g, '_')}`;
                // Re-check based on previously checked state for this element
                checkbox.checked = previouslyChecked.has(profile.name);

                const label = document.createElement('label');
                label.htmlFor = checkbox.id;
                label.textContent = profile.name;

                span.appendChild(checkbox);
                span.appendChild(label);
                profileCheckboxesContainer.appendChild(span);
            });
        });
    }
}

// Add New Site Rule Button
addSiteButton.addEventListener('click', () => {
    const newEntryElement = createSiteEntryElement(); // Create empty entry
    sitesListContainer.appendChild(newEntryElement);
});


// --- Load Settings ---
function loadSettings() {
    chrome.storage.sync.get(['sitesConfig', 'profilesConfig', 'globalBlockMessage', 'isEnabled'], (data) => {
        // Load profiles first
        currentProfilesConfig = data.profilesConfig || defaultProfiles;
        // Ensure "Manual" profile exists if loaded data doesn't have it
        if (!currentProfilesConfig.some(p => p.name.toLowerCase() === 'manual')) {
            currentProfilesConfig.unshift({ name: "Manual", keyword: null }); // Add to beginning
        }
        renderProfilesList(); // Render profile UI

        // Load site rules and render them (pass profiles implicitly via currentProfilesConfig)
        const rawSitesConfig = data.sitesConfig || defaultSitesConfig;
        renderSitesList(rawSitesConfig);

        // Load other settings
        globalMessageTextarea.value = data.globalBlockMessage || defaultGlobalMessage;
        enableToggle.checked = data.isEnabled === undefined ? true : data.isEnabled;
    });
    checkAuthStatus();
}

// --- Save Settings ---
saveButton.addEventListener('click', () => {
    // --- Save Profiles --- (Already updated in currentProfilesConfig by UI interactions)
    // Validation happens during add/edit

    // --- Save Site Rules ---
    const newSitesConfig = [];
    const siteEntryElements = sitesListContainer.querySelectorAll('.site-entry');

    siteEntryElements.forEach(element => {
        const idInput = element.querySelector('.site-entry-id');
        const blockAllCheckbox = element.querySelector('.block-all-checkbox');
        const domainInput = element.querySelector('.site-domain');
        const messageTextarea = element.querySelector('.site-message');
        const allowedVideosTextarea = element.querySelector('.allowed-videos');
        const profileCheckboxes = element.querySelectorAll('.profile-checkboxes-container input[type="checkbox"]:checked');

        const id = idInput.value; // Get existing or newly generated ID
        const isBlockAll = blockAllCheckbox.checked;
        const message = messageTextarea.value.trim() || null;
        const assignedProfiles = Array.from(profileCheckboxes).map(cb => cb.value);

        let ruleData = { id: id, message: message, profiles: assignedProfiles };
        let isValid = assignedProfiles.length > 0; // Rule must belong to at least one profile

        if (isBlockAll) {
            ruleData.blockAll = true;
        } else {
            const domainString = domainInput.value.trim();
            if (!domainString) {
                 showStatus(`Rule with empty domain field skipped (ID starting ${id.substring(0,4)}...). Either add domains or check 'Block All'.`, true);
                 isValid = false; // Skip saving this rule
            } else {
                ruleData.domain = domainString;
                 // Process Allowed Videos (only if not block all)
                 const rawVideosInput = allowedVideosTextarea.value.trim();
                 const allowedVideos = [];
                 if (rawVideosInput) {
                     rawVideosInput.split('\n').forEach(line => { /* ... parsing logic as before ... */
                        const parts = line.split('|');
                        const videoId = parts[0]?.trim();
                        const name = parts[1]?.trim() || videoId;
                        if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
                           allowedVideos.push({ id: videoId, name: name });
                        }
                     });
                 }
                 ruleData.allowedVideos = allowedVideos;
            }
        }

         if (!isValid) {
             if(assignedProfiles.length === 0) showStatus(`Rule skipped (ID starting ${id.substring(0,4)}...). Must be assigned to at least one profile.`, true);
             element.style.border = '2px solid red'; // Highlight invalid rule
         } else {
             newSitesConfig.push(ruleData);
             element.style.border = '1px solid #ddd'; // Reset border
         }
    });

    // Filter final profiles: Remove any profiles that are no longer referenced by any site rule
    // (Unless it's the 'Manual' profile)
    const referencedProfileNames = new Set(newSitesConfig.flatMap(rule => rule.profiles));
    referencedProfileNames.add("Manual"); // Always keep Manual profile referenced implicitly
    const finalProfilesConfig = currentProfilesConfig.filter(profile =>
         referencedProfileNames.has(profile.name)
    );
    // If filtering removed profiles, update the state and re-render
     if (finalProfilesConfig.length < currentProfilesConfig.length) {
         const removedNames = currentProfilesConfig.filter(p => !finalProfilesConfig.some(fp => fp.name === p.name)).map(p => p.name);
         console.warn("Removing unreferenced profiles:", removedNames);
         currentProfilesConfig = finalProfilesConfig;
         renderProfilesList(); // Update UI immediately
     }

    const enabled = enableToggle.checked;

    // Combine all settings to save
    const settingsToSave = {
        profilesConfig: finalProfilesConfig,
        sitesConfig: newSitesConfig,
        globalBlockMessage: globalMessageTextarea.value.trim() || defaultGlobalMessage,
        isEnabled: enabled
    };

    // Save all settings
    chrome.storage.sync.set(settingsToSave, () => {
        if (chrome.runtime.lastError) {
            showStatus(`Error saving settings: ${chrome.runtime.lastError.message}`, true);
        } else {
            showStatus('Settings saved successfully!');
            checkAuthStatus(); // Update auth status display
            // Inform background script
            chrome.runtime.sendMessage({ action: "settingsUpdated" }).catch(e => console.log("BG not listening? ", e));
        }
    });
});


// --- Import/Export Functions ---
const CONFIG_KEYS = ['profilesConfig', 'sitesConfig', 'globalBlockMessage', 'isEnabled']; // Update keys

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

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', loadSettings);
// ... (saveButton handled above) ...
exportButton.addEventListener('click', exportSettings);
importButton.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', importSettings);
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateOptionsAuthStatus") {
        checkAuthStatus();
    }
});