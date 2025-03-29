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
        // Processed list will now include allowedVideoIds
        sitesConfig: [], // Array<{domain: string, message: string|null, allowedVideoIds: string[]}>
        blockedDomains: [],
        globalBlockMessage: defaultGlobalMessageForBG,
        focusKeyword: defaultFocusKeyword,
        redirectUrl: chrome.runtime.getURL('blocked.html')
    };

    try {
        const data = await chrome.storage.sync.get([
            'sitesConfig', 'globalBlockMessage', 'focusKeyword', 'isEnabled'
        ]);

        state.isEnabled = data.isEnabled === undefined ? true : data.isEnabled;
        state.focusKeyword = (data.focusKeyword || defaultFocusKeyword).trim(); // Ensure keyword is trimmed
        state.globalBlockMessage = data.globalBlockMessage || defaultGlobalMessageForBG;

        const rawSitesConfig = data.sitesConfig || defaultSitesConfigForBG;

        // PROCESS RAW CONFIG: Split domains, validate, and associate shared message/video IDs
        state.sitesConfig = rawSitesConfig.flatMap(item => {
            const domainString = item.domain || '';
            const message = item.message || null;
            // Get allowedVideoIds from raw item, default to empty array
            const allowedVideos = Array.isArray(item.allowedVideos) ? item.allowedVideos : [];
            const processedEntries = [];

            domainString.split(',')
                .map(part => part.trim()).filter(p => p)
                .forEach(potentialDomain => {
                    const validDomain = extractDomain(potentialDomain);
                    if (validDomain) {
                        processedEntries.push({
                             domain: validDomain,
                             message: message,
                             allowedVideos: allowedVideos // Pass along the object array
                        });
                    } else {
                        console.warn(`Invalid domain found and skipped: "${potentialDomain}" from input "${domainString}"`);
                    }
                });
            return processedEntries; // Return array of processed entries for this raw item
        });
        // ********************************************************************

        // Derive blockedDomains from the *processed* sitesConfig
        state.blockedDomains = state.sitesConfig.map(item => item.domain);

        console.log("State loaded/updated. Enabled:", state.isEnabled, "Keyword:", state.focusKeyword);
        console.log("Processed Blocked Domains Count:", state.sitesConfig.length, "Domains:", state.blockedDomains);
        console.log("Processed Sites Config:", state.sitesConfig); // Log the full processed config


    } catch (error) {
        console.error("Error loading state from storage:", error);
        // Apply defaults on error - ensure defaults are also processed
        state.isEnabled = true;
        state.focusKeyword = defaultFocusKeyword;
        state.globalBlockMessage = defaultGlobalMessageForBG;
        // Process defaults similar to loaded data
        state.sitesConfig = defaultSitesConfigForBG.flatMap(item => {
            const domainString = item.domain || '';
            const message = item.message || null;
            const allowedVideos = Array.isArray(item.allowedVideos) ? item.allowedVideos : []; // Handle defaults structure
            return domainString.split(',')
                .map(part => part.trim()).filter(p => p)
                .map(potentialDomain => extractDomain(potentialDomain))
                .filter(validDomain => validDomain)
                .map(validDomain => ({ domain: validDomain, message: message, allowedVideos: allowedVideos })); // Include allowedVideos
        });
        state.blockedDomains = state.sitesConfig.map(item => item.domain);
       console.warn("Applied default state due to loading error. Processed default domains:", state.blockedDomains);
    }
    return state;
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
