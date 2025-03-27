// tabs.js
import { isUrlBlocked } from './utils.js';
import { defaultGlobalMessageForBG } from './constants.js';

/**
 * Redirects a specific tab if its URL matches a blocked site during focus mode.
 * @param {number} tabId - The ID of the tab to check/update.
 * @param {string} url - The URL of the tab.
 * @param {Array<{domain: string, message: string|null}>} sitesConfig - Current site configuration.
 * @param {string} globalBlockMessage - Fallback blocking message.
 * @param {string} redirectUrl - Base URL of the blocked page.
 */
export async function checkAndBlockTabIfNeeded(tabId, url, sitesConfig, globalBlockMessage, redirectUrl) {
    // Skip if critical info is missing or URL is already the block page
    const baseRedirectUrl = redirectUrl ? redirectUrl.split('?')[0] : '';
    if (!url || !baseRedirectUrl || url.startsWith(baseRedirectUrl)) {
        return;
    }

    const blockResult = isUrlBlocked(url, sitesConfig); // Check against current config

    if (blockResult !== false) { // If it IS blocked (true or message string)
        let finalMessage;
        if (typeof blockResult === 'string') {
            finalMessage = blockResult; // Use specific message
        } else {
            finalMessage = globalBlockMessage || defaultGlobalMessageForBG; // Use global fallback
        }

        // Encode the message and create the target URL
        const encodedMessage = encodeURIComponent(finalMessage);
        const targetUrl = `${baseRedirectUrl}?message=${encodedMessage}`;

        console.log(`[Tab Blocker] BLOCKING Tab: ${tabId}, URL: ${url}. Redirecting...`);
        try {
            await chrome.tabs.update(tabId, { url: targetUrl });
        } catch (error) {
            // Ignore common errors when tab is closed or inaccessible
            if (!error.message.includes("No tab with id") && !error.message.includes("Cannot access") && !error.message.includes("Invalid tab ID")) {
                console.error(`[Tab Blocker] Error updating tab ${tabId} to ${targetUrl}:`, error);
            } else {
                 // console.log(`[Tab Blocker] Ignored error updating tab ${tabId} (likely closed): ${error.message}`);
            }
        }
    }
}

/**
 * Checks all currently open tabs when focus mode starts.
 * @param {Array<{domain: string, message: string|null}>} sitesConfig - Current site configuration.
 * @param {string} globalBlockMessage - Fallback blocking message.
 * @param {string} redirectUrl - Base URL of the blocked page.
 */
export async function checkExistingTabs(sitesConfig, globalBlockMessage, redirectUrl) {
    console.log("[Tab Blocker] Focus mode started. Checking all existing tabs...");
    try {
        const tabs = await chrome.tabs.query({}); // Query all tabs
        console.log(`[Tab Blocker] Found ${tabs.length} tabs to check.`);
        for (const tab of tabs) {
            if (tab.id && tab.url) { // Ensure tab has ID and URL
                // Check and block, don't wait for each one to finish updating
                 checkAndBlockTabIfNeeded(tab.id, tab.url, sitesConfig, globalBlockMessage, redirectUrl);
                 // Add a tiny delay to prevent overwhelming the browser/API if many tabs
                 await new Promise(resolve => setTimeout(resolve, 15));
            }
        }
        console.log("[Tab Blocker] Finished checking existing tabs.");
    } catch (error) {
        console.error("[Tab Blocker] Error querying or checking existing tabs:", error);
    }
}