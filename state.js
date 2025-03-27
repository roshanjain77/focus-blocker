// state.js
import { defaultSitesConfigForBG, defaultGlobalMessageForBG, defaultFocusKeyword } from './constants.js';
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
 * Updates the status text displayed in the browser action popup.
 * @param {string} statusText - The text to display.
 */
export function updatePopupState(statusText) {
    // Use local storage as it's faster for popup state
    chrome.storage.local.set({ extensionStatus: statusText }).catch(error => {
        console.warn("Error setting popup state:", error);
    });
    // Example: Update icon based on state (add icons first)
    // let iconPath = "icons/icon48_disabled.png"; // Assuming you have icons
    // if (statusText === 'Focus Active') iconPath = "icons/icon48_active.png";
    // else if (statusText === 'Focus Inactive') iconPath = "icons/icon48_inactive.png";
    // else if (statusText === 'Auth Required') iconPath = "icons/icon48_auth.png";
    // else if (statusText === 'Error') iconPath = "icons/icon48_error.png";
    // chrome.action.setIcon({ path: iconPath }).catch(e => console.warn("Error setting icon:", e));
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