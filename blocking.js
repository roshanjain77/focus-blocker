// blocking.js
import { RULE_PRIORITY, FOCUS_RULE_ID_START, MAX_BLOCKED_SITES, FOCUS_RULE_ID_END } from './constants.js';
import { defaultGlobalMessageForBG } from './constants.js'; // Import default message

/**
 * Updates Declarative Net Request rules based on whether blocking should be active.
 * Each rule will redirect to blocked.html with the specific message encoded in the URL.
 * @param {boolean} shouldBlock - Whether to enable blocking rules.
 * @param {Array<{domain: string, message: string|null}>} sitesConfig - The current site configuration.
 * @param {string} globalBlockMessage - The global fallback message.
 * @param {string} redirectUrl - The base URL of the blocked page (e.g., chrome-extension://.../blocked.html).
 */
export async function updateBlockingRules(shouldBlock, sitesConfig, globalBlockMessage, redirectUrl) { // <-- Updated params
    const logPrefix = "[DNR Rules]";
    try {
        const allSessionRules = await chrome.declarativeNetRequest.getSessionRules();
        const existingFocusRuleIds = allSessionRules
            .filter(rule => rule.id >= FOCUS_RULE_ID_START && rule.id <= FOCUS_RULE_ID_END)
            .map(rule => rule.id);

        const rulesToAdd = [];
        const currentSitesConfig = sitesConfig || []; // Ensure it's an array

        if (shouldBlock && currentSitesConfig.length > 0 && redirectUrl) {
            console.log(`${logPrefix} Setting up rules for ${currentSitesConfig.length} sites.`);

            const baseRedirectUrl = redirectUrl.split('?')[0]; // Ensure we use the base URL
            const fallbackMessage = globalBlockMessage || defaultGlobalMessageForBG; // Ensure fallback exists

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
                const targetUrl = `${baseRedirectUrl}?message=${encodedMessage}`;
                // **********************************************************

                const ruleId = FOCUS_RULE_ID_START + index;
                rulesToAdd.push({
                    id: ruleId,
                    priority: RULE_PRIORITY,
                    // *** Use the URL with the encoded message ***
                    action: { type: 'redirect', redirect: { url: targetUrl } },
                    // *********************************************
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