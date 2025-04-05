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
export async function checkAndBlockTabIfNeeded(tabId, url, rulesForActiveProfile, globalBlockMessage, redirectUrl) {
    const baseRedirectUrl = redirectUrl ? redirectUrl.split('?')[0] : '';
    if (!url || !baseRedirectUrl || url.startsWith(baseRedirectUrl)) return;

    let blockResult = false; // Becomes true, message string, or 'blockAll' object
    let blockAllRule = rulesForActiveProfile.find(rule => rule.blockAll === true);

    // 1. Check Block All Rule
    if (blockAllRule) {
        // Check if the URL is an exception (e.g., extension pages - should be handled by excludedInitiatorDomains in DNR, but double check?)
        // For simplicity, assume if blockAllRule exists, we block (DNR handles exclusions)
        blockResult = blockAllRule; // Store the rule object itself
    } else {
    // 2. Check Specific Domain Rules (if no block all)
        try {
            const currentUrl = new URL(url);
            const currentHostname = currentUrl.hostname.toLowerCase();

            for (const rule of rulesForActiveProfile) {
                 if (!rule.domain) continue; // Skip non-domain rules
                 const blockedDomain = rule.domain.toLowerCase();
                 if (currentHostname === blockedDomain || currentHostname.endsWith('.' + blockedDomain)) {
                     blockResult = rule; // Store the matching rule object
                     break; // Found the specific rule
                 }
            }
        } catch (e) { /* ignore url parse errors */ }
    }

    // 3. Perform Redirect if Blocked
    if (blockResult !== false) {
        await addBlockedTab(tabId, url); // Track original URL

        let finalMessage;
        let allowedVideos = [];
        let targetUrl;

        if (blockResult.blockAll) {
            finalMessage = blockResult.message || globalBlockMessage || "All sites blocked";
            targetUrl = `${baseRedirectUrl}?message=${encodeURIComponent(finalMessage)}`;
        } else { // Specific domain rule matched (blockResult is the rule object)
            finalMessage = blockResult.message || globalBlockMessage || "Site blocked";
            allowedVideos = blockResult.allowedVideos || [];
            targetUrl = `${baseRedirectUrl}?message=${encodeURIComponent(finalMessage)}`;
            if (allowedVideos.length > 0 && (blockResult.domain === 'youtube.com' || blockResult.domain === 'youtu.be')) {
                try {
                    targetUrl += `&allowedVideos=${encodeURIComponent(JSON.stringify(allowedVideos))}`;
                } catch (e) {
                    console.error(`[Tab Blocker] Error encoding allowed videos for ${blockResult.domain}:`, e);
                }
            }
        }

        console.log(`[Tab Blocker] BLOCKING Tab: ${tabId} (Rule: ${blockResult.blockAll ? 'BLOCK ALL' : blockResult.domain}). Redirecting...`);
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