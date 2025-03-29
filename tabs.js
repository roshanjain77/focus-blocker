// tabs.js
import { isUrlBlocked } from './utils.js';
import { defaultGlobalMessageForBG } from './constants.js';
import { addBlockedTab } from './state.js';


/**
 * Redirects a specific tab if its URL matches a blocked site during focus mode.
 * @param {number} tabId - The ID of the tab to check/update.
 * @param {string} url - The URL of the tab.
 * @param {Array<{domain: string, message: string|null}>} sitesConfig - Current site configuration.
 * @param {string} globalBlockMessage - Fallback blocking message.
 * @param {string} redirectUrl - Base URL of the blocked page.
 */
export async function checkAndBlockTabIfNeeded(tabId, url, sitesConfig, globalBlockMessage, redirectUrl) {
    const baseRedirectUrl = redirectUrl ? redirectUrl.split('?')[0] : '';
    if (!url || !baseRedirectUrl || url.startsWith(baseRedirectUrl)) {
        return; // No need to block or track
    }

    const blockResult = isUrlBlocked(url, sitesConfig);

    if (blockResult !== false) {
        // *** Track the tab BEFORE redirecting ***
        await addBlockedTab(tabId, url); // Pass the original URL
        // ***************************************

        let finalMessage;
        // ... (determine message based on blockResult) ...
        if (typeof blockResult === 'string') { finalMessage = blockResult; }
        else { finalMessage = globalBlockMessage || defaultGlobalMessageForBG; }

        // Find the specific site config entry for allowed videos (needed if using grouped domains)
        const siteEntry = sitesConfig.find(item => {
             const blockedDomain = item.domain.toLowerCase();
             const currentHostname = new URL(url).hostname.toLowerCase();
             return currentHostname === blockedDomain || currentHostname.endsWith('.' + blockedDomain);
        });
        const allowedVideos = siteEntry?.allowedVideos || [];

        const encodedMessage = encodeURIComponent(finalMessage);
        let targetUrl = `${baseRedirectUrl}?message=${encodedMessage}`;

        // Add allowed videos if applicable (using the found site entry)
        if (allowedVideos.length > 0 && (siteEntry.domain === 'youtube.com' || siteEntry.domain === 'youtu.be')) {
             try {
                 const allowedVideosJson = JSON.stringify(allowedVideos);
                 const encodedAllowedVideos = encodeURIComponent(allowedVideosJson);
                 targetUrl += `&allowedVideos=${encodedAllowedVideos}`;
             } catch (e) { /* handle error */ }
        }

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