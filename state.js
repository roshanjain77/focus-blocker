// state.js
import { defaultSitesConfigForBG, defaultGlobalMessageForBG, defaultFocusKeyword, MANUAL_FOCUS_END_TIME_KEY, BLOCKED_TABS_MAP_KEY } from './constants.js';
import { extractDomain } from './utils.js';

/**
 * Loads settings from chrome.storage.sync, applies defaults, processes domains, and validates.
 * @returns {Promise<{
 *   isEnabled: boolean,
 *   sitesConfig: [], // Array<{domain: string, message: string|null, allowedVideos: Array<{id: string, name: string}>}>
 *   blockedDomains: string[], // Derived from processed list
 *   globalBlockMessage: string,
 *   focusKeyword: string,
 *   redirectUrl: string
 * }>} The processed extension state.
 */
export async function loadStateFromStorage() {
    console.log("loadStateFromStorage: Loading settings...");
    let state = {
        isEnabled: true,
        profilesConfig: [], // Array<{ name: string, keyword: string | null }>
        // Processed list, domains expanded
        processedSitesConfig: [], // Array<{id: string, domain?: string, blockAll?: boolean, message: string|null, allowedVideos?: Array<{id:string, name:string}>, profiles: string[]}>
        globalBlockMessage: defaultGlobalMessageForBG,
        focusKeyword: '', // Might become less relevant or represent a default
        redirectUrl: chrome.runtime.getURL('blocked.html')
    };

    try {
        const data = await chrome.storage.sync.get([
            'sitesConfig', 'profilesConfig', 'globalBlockMessage', 'isEnabled' // Removed focusKeyword for now
        ]);

        state.isEnabled = data.isEnabled === undefined ? true : data.isEnabled;
        state.globalBlockMessage = data.globalBlockMessage || defaultGlobalMessageForBG;

        // --- Load and Validate Profiles ---
        const rawProfilesConfig = data.profilesConfig || [{ name: "Manual", keyword: null }]; // Default with Manual
        // Add validation here if needed (e.g., ensure 'Manual' exists, unique names)
        state.profilesConfig = rawProfilesConfig;
        console.log("Loaded Profiles Config:", state.profilesConfig);

        // --- Load and Process Site Rules ---
        const rawSitesConfig = data.sitesConfig || []; // Default to empty array
        state.processedSitesConfig = rawSitesConfig.flatMap(item => {
            const message = item.message || null;
            const profiles = Array.isArray(item.profiles) ? item.profiles : [];
            const id = item.id || crypto.randomUUID(); // Assign ID if missing

            if (item.blockAll === true) {
                // Block All Entry
                return [{ id: id, blockAll: true, message: message, profiles: profiles }];
            } else {
                // Standard Entry - Expand domains
                const domainString = item.domain || '';
                const allowedVideos = Array.isArray(item.allowedVideos) ? item.allowedVideos : [];
                const expandedEntries = [];
                domainString.split(',')
                    .map(part => part.trim()).filter(p => p)
                    .forEach(potentialDomain => {
                        const validDomain = extractDomain(potentialDomain);
                        if (validDomain) {
                            expandedEntries.push({
                                id: id, // Share same original ID
                                domain: validDomain,
                                message: message,
                                allowedVideos: allowedVideos,
                                profiles: profiles // Share same profile assignment
                            });
                        } else { /* warning */ }
                    });
                return expandedEntries;
            }
        });
        // *********************************

        console.log("Processed Sites Config Count:", state.processedSitesConfig.length);

    } catch (error) {
        console.error("Error loading state:", error);
        // Apply safe defaults
        state.profilesConfig = [{ name: "Manual", keyword: null }];
        state.processedSitesConfig = [];
        state.globalBlockMessage = defaultGlobalMessageForBG;
        state.isEnabled = true;
    }
    return state; // Return object containing both configs
}


/**
 * Retrieves the manual focus end time from local storage.
 * @returns {Promise<number|null>} Timestamp of end time, or null if not set/expired.
 */
export async function getManualFocusEndTime() {
    try {
        const data = await chrome.storage.local.get(MANUAL_FOCUS_END_TIME_KEY);
        const endTime = data[MANUAL_FOCUS_END_TIME_KEY];
        // Return null if not set or already passed
        return (endTime && endTime > Date.now()) ? endTime : null;
    } catch (error) {
        console.error("Error getting manual focus end time:", error);
        return null;
    }
}

/**
 * Sets the manual focus end time in local storage.
 * @param {number} endTime - The timestamp when manual focus should end.
 */
export async function setManualFocusEndTime(endTime) {
    try {
        await chrome.storage.local.set({ [MANUAL_FOCUS_END_TIME_KEY]: endTime });
        console.log("Manual focus end time set:", new Date(endTime));
    } catch (error) {
        console.error("Error setting manual focus end time:", error);
    }
}

/**
 * Clears the manual focus end time from local storage.
 */
export async function clearManualFocusEndTime() {
    try {
        await chrome.storage.local.remove(MANUAL_FOCUS_END_TIME_KEY);
        console.log("Manual focus end time cleared.");
    } catch (error) {
        console.error("Error clearing manual focus end time:", error);
    }
}

/**
 * Updates the status text and manual focus end time in local storage for the popup.
 * @param {string} statusText - The text to display.
 * @param {number|null} manualEndTime - Timestamp or null.
 */
export function updatePopupState(statusText, manualEndTime = null) {
    const stateToSet = { extensionStatus: statusText };
    // Always include manualFocusEndTime, even if null, so popup can react
    stateToSet[MANUAL_FOCUS_END_TIME_KEY] = manualEndTime;

    chrome.storage.local.set(stateToSet).catch(error => {
        console.warn("Error setting popup state:", error);
    });
    // ... (optional icon logic) ...
}


/**
 * Initializes default settings on extension installation.
 */
export async function initializeSettings() {
    try {
         await chrome.storage.sync.set({
            sitesConfig: defaultSitesConfigForBG, // Raw defaults are fine here, load validates
            globalBlockMessage: defaultGlobalMessageForBG,
            focusKeyword: defaultFocusKeyword,
            isEnabled: true
        });
         console.log("Default settings applied on install.");
    } catch (error) {
        console.error("Error initializing settings:", error);
    }
}

/** Gets the map of blocked tabs from local storage. */
export async function getBlockedTabs() {
    try {
        const data = await chrome.storage.local.get(BLOCKED_TABS_MAP_KEY);
        return data[BLOCKED_TABS_MAP_KEY] || {}; // Return empty object if not found
    } catch (error) {
        console.error("Error getting blocked tabs map:", error);
        return {};
    }
}

/** Adds or updates a tab in the blocked tabs map. */
export async function addBlockedTab(tabId, originalUrl) {
    if (!tabId || !originalUrl) return;
    try {
        const map = await getBlockedTabs();
        map[tabId] = originalUrl;
        await chrome.storage.local.set({ [BLOCKED_TABS_MAP_KEY]: map });
        console.log(`Blocked tab added/updated: ${tabId} -> ${originalUrl}`);
    } catch (error) {
        console.error(`Error adding blocked tab ${tabId}:`, error);
    }
}

/** Removes a tab from the blocked tabs map. */
export async function removeBlockedTab(tabId) {
     if (!tabId) return;
    try {
        const map = await getBlockedTabs();
        if (map[tabId]) {
            delete map[tabId];
            await chrome.storage.local.set({ [BLOCKED_TABS_MAP_KEY]: map });
            console.log(`Blocked tab removed: ${tabId}`);
        }
    } catch (error) {
        console.error(`Error removing blocked tab ${tabId}:`, error);
    }
}

/** Clears the entire blocked tabs map. */
export async function clearBlockedTabs() {
    try {
        await chrome.storage.local.remove(BLOCKED_TABS_MAP_KEY);
        console.log("Blocked tabs map cleared.");
    } catch (error) {
        console.error("Error clearing blocked tabs map:", error);
    }
}
