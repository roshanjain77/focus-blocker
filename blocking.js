// blocking.js
import { RULE_PRIORITY, FOCUS_RULE_ID_START, MAX_BLOCKED_SITES, FOCUS_RULE_ID_END } from './constants.js';
import { defaultGlobalMessageForBG } from './constants.js'; // Import default message

/**
 * Updates DNR rules. Redirect URL will include encoded message and allowed video IDs if applicable.
 * @param {boolean} shouldBlock - Enable/disable blocking.
 * @param {Array<{domain: string, message: string|null, allowedVideoIds: string[]}>} sitesConfig - Processed config.
 * @param {string} globalBlockMessage - Fallback message.
 * @param {string} redirectUrl - Base blocked page URL.
 */
export async function updateBlockingRules(shouldBlock, sitesConfig, globalBlockMessage, redirectUrl) {
    const logPrefix = "[DNR Rules]";
    try {
        const allSessionRules = await chrome.declarativeNetRequest.getSessionRules();
        const existingFocusRuleIds = allSessionRules
            .filter(rule => rule.id >= FOCUS_RULE_ID_START && rule.id <= FOCUS_RULE_ID_END)
            .map(rule => rule.id);

        const rulesToAdd = [];
        const currentSitesConfig = sitesConfig || [];
        
        if (shouldBlock && currentSitesConfig.length > 0 && redirectUrl) {
            console.log(`${logPrefix} Setting up rules for ${currentSitesConfig.length} processed sites.`);
            const baseRedirectUrl = redirectUrl.split('?')[0];
            const fallbackMessage = globalBlockMessage || defaultGlobalMessageForBG;
        
            currentSitesConfig.forEach((site, index) => {
                if (index >= MAX_BLOCKED_SITES) {
                    console.warn(`${logPrefix} Max rule limit (${MAX_BLOCKED_SITES}) reached, skipping domain: ${site.domain}`);
                    return;
                }
                if (!site.domain) { // Skip invalid entries just in case
                     console.warn(`${logPrefix} Skipping rule for invalid site entry at index ${index}.`);
                     return;
                }

                // *** Determine the message and encode it for THIS rule ***
                const messageToEncode = site.message || fallbackMessage;
                const encodedMessage = encodeURIComponent(messageToEncode);
                let targetUrl = `${baseRedirectUrl}?message=${encodedMessage}`;
                // **********************************************************

                // Check if it's YouTube and has allowed videos
                if ((site.domain === 'youtube.com' || site.domain === 'youtu.be') && site.allowedVideoIds.length > 0) {
                    const encodedVideos = encodeURIComponent(site.allowedVideoIds.join(',')); // Join IDs with comma for URL param
                    targetUrl += `&videos=${encodedVideos}`; // Append video IDs parameter
                    console.log(`${logPrefix} Adding allowed videos to rule for ${site.domain}: ${site.allowedVideoIds.length} videos`);
                }


                const ruleId = FOCUS_RULE_ID_START + index;
                rulesToAdd.push({
                    id: ruleId,
                    priority: RULE_PRIORITY,
                    action: { type: 'redirect', redirect: { url: targetUrl } }, // Use potentially modified targetUrl
                    condition: {
                        urlFilter: `||${site.domain}^`, // Match domain and subdomains
                        excludedInitiatorDomains: [chrome.runtime.id],
                        resourceTypes: ['main_frame']
                    }
                });
            });
        } else {
            // Logging for why rules might be removed
            if (!shouldBlock) console.log(`${logPrefix} Focus inactive or extension disabled, removing rules.`);
            else if (!redirectUrl) console.log(`${logPrefix} Redirect URL missing, cannot add rules.`);
            else console.log(`${logPrefix} No sites configured, removing rules.`);
        }

        // Apply changes atomically
        console.log(`${logPrefix} Rules to Add Count:`, rulesToAdd.length);
        console.log(`${logPrefix} Rule IDs to Remove Count:`, existingFocusRuleIds.length);

        if (rulesToAdd.length > 0 || existingFocusRuleIds.length > 0) {
             await chrome.declarativeNetRequest.updateSessionRules({
                 removeRuleIds: existingFocusRuleIds,
                 addRules: rulesToAdd
             });
            console.log(`${logPrefix} Rules updated successfully.`);
        } else {
             console.log(`${logPrefix} No rule changes needed.`);
        }

    } catch (error) {
        console.error(`${logPrefix} FAILED to update rules:`, error);
        if (error.message.includes('MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES')) {
            console.error(`${logPrefix} Exceeded the maximum number of rules allowed by Chrome.`);
            throw new Error('Rule Limit Exceeded'); // Propagate for handling
        }
        // Propagate other errors too
        throw error;
    }
}