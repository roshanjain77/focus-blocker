// state.js
import { defaultSitesConfigForBG, defaultGlobalMessageForBG, defaultFocusKeyword, MANUAL_FOCUS_END_TIME_KEY } from './constants.js';
import { extractDomain } from './utils.js';

/**
 * Loads settings from chrome.storage.sync, applies defaults, and validates.
 * @returns {Promise<{
 *   isEnabled: boolean,
 *   sitesConfig: Array<{domain: string, message: string|null}>,
 *   blockedDomains: string[],
 *   globalBlockMessage: string,
 *   focusKeyword: string,
 *   redirectUrl: string
 * }>} The processed extension state.
 */
export async function loadStateFromStorage() {
    console.log("loadStateFromStorage: Loading settings...");
    let state = {
        isEnabled: true,
        sitesConfig: [],
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
        state.focusKeyword = data.focusKeyword || defaultFocusKeyword;
        state.globalBlockMessage = data.globalBlockMessage || defaultGlobalMessageForBG;

        const rawSitesConfig = data.sitesConfig || defaultSitesConfigForBG;

        // ** CRITICAL: Re-process and validate domains on load **
        state.sitesConfig = rawSitesConfig.map(item => ({
            domain: extractDomain(item.domain), // Use robust extraction/validation
            message: item.message || null
        })).filter(item => item.domain); // Filter out any entries with invalid domains

        state.blockedDomains = state.sitesConfig.map(item => item.domain);

        console.log("State loaded/updated. Enabled:", state.isEnabled, "Keyword:", state.focusKeyword, "Valid Config Count:", state.sitesConfig.length);

    } catch (error) {
        console.error("Error loading state from storage:", error);
        // Apply defaults on error to prevent broken state
        state.isEnabled = true;
        state.focusKeyword = defaultFocusKeyword;
        state.globalBlockMessage = defaultGlobalMessageForBG;
        state.sitesConfig = defaultSitesConfigForBG.map(item => ({
            domain: extractDomain(item.domain), // Ensure defaults are also processed
            message: item.message
        })).filter(i => i.domain);
        state.blockedDomains = state.sitesConfig.map(item => item.domain);
        console.warn("Applied default state due to loading error.");
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