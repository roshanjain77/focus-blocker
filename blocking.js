// blocking.js
import { RULE_PRIORITY, FOCUS_RULE_ID_START, MAX_BLOCKED_SITES, FOCUS_RULE_ID_END } from './constants.js';
import { defaultGlobalMessageForBG } from './constants.js'; // Import default message

/**
 * Updates DNR rules. Redirect URL will include encoded message and allowed video IDs if applicable.
 * @param {boolean} shouldBlock - Enable/disable blocking.
 * @param {Array<{domain: string, message: string|null, allowedVideos: Array<{id: string, name: string}>}>} sitesConfig - Processed config.
 * @param {string} globalBlockMessage - Fallback message.
 * @param {string} redirectUrl - Base blocked page URL.
 */
export async function updateBlockingRules(shouldBlock, rulesForActiveProfile, globalBlockMessage, redirectUrl) {
    const logPrefix = "[DNR Rules]";
    try {
        const allSessionRules = await chrome.declarativeNetRequest.getSessionRules();
        const existingFocusRuleIds = allSessionRules
            .filter(rule => rule.id >= FOCUS_RULE_ID_START && rule.id <= FOCUS_RULE_ID_END)
            .map(rule => rule.id);

        const rulesToAdd = [];
        
        if (shouldBlock && rulesForActiveProfile.length > 0 && redirectUrl) {
            const baseRedirectUrl = redirectUrl.split('?')[0];
    
            // --- Check for Block All Rule FIRST ---
            const blockAllRule = rulesForActiveProfile.find(rule => rule.blockAll === true);
    
            if (blockAllRule) {
                 console.log(`${logPrefix} Applying BLOCK ALL rule for this profile.`);
                 const messageToEncode = blockAllRule.message || globalBlockMessage || "All sites blocked";
                 const encodedMessage = encodeURIComponent(messageToEncode);
                 const targetUrl = `${baseRedirectUrl}?message=${encodedMessage}`; // No videos for block all
                 const ruleId = FOCUS_RULE_ID_START; // Use a predictable ID for block all
    
                 rulesToAdd.push({
                     id: ruleId,
                     priority: RULE_PRIORITY - 1, // Lower priority than specific allows maybe? Or same? Let's try same first.
                     action: { type: 'redirect', redirect: { url: targetUrl } },
                     condition: {
                         // Target HTTP and HTTPS schemes, exclude extension origin
                         // Using requestDomains might be simpler if blocking specific domains,
                         // but for block *all*, urlFilter with schemes is more appropriate.
                         // **NOTE:** This might block browser internal pages or other extensions. Test carefully!
                         // Consider using "excludedRequestDomains" for essential services if needed.
                         urlFilter: "|http*://*/*", // Matches http:// or https:// followed by anything
                         excludedInitiatorDomains: [chrome.runtime.id],
                         resourceTypes: ['main_frame']
                     }
                 });
                 console.log(`${logPrefix} Added BLOCK ALL rule (ID ${ruleId})`);
    
            } else {
                // --- Generate Rules for Specific Domains (if no block all) ---
                console.log(`${logPrefix} Applying specific domain rules for this profile.`);
                rulesForActiveProfile.forEach((site, index) => {

                    if (index >= MAX_BLOCKED_SITES) {
                        console.warn(`${logPrefix} Max rule limit (${MAX_BLOCKED_SITES}) reached, skipping domain: ${site.domain}`);
                        return;
                    }
                    if (!site.domain) { // Skip invalid entries just in case
                        console.warn(`${logPrefix} Skipping rule for invalid site entry at index ${index}.`);
                        return;
                    }

                    const messageToEncode = site.message || globalBlockMessage || "Site blocked";
                    const encodedMessage = encodeURIComponent(messageToEncode);
                    let targetUrl = `${baseRedirectUrl}?message=${encodedMessage}`;
   
                    // Handle allowed videos (as before)
                    if ((site.domain === 'youtube.com' || site.domain === 'youtu.be') && site.allowedVideos?.length > 0) {
                        try {
                            const allowedVideosJson = JSON.stringify(site.allowedVideos);
                            const encodedAllowedVideos = encodeURIComponent(allowedVideosJson);
                            targetUrl += `&allowedVideos=${encodedAllowedVideos}`; // Use new param name
                            console.log(`${logPrefix} Adding allowed videos JSON to rule for ${site.domain}`);
                        } catch (e) {
                            console.error(`Error stringifying allowedVideos for ${site.domain}:`, e);
                            // Proceed without the allowedVideos parameter if encoding fails
                        }
                    }
    
                    // Assign unique IDs based on index within the profile's rules
                    const ruleId = FOCUS_RULE_ID_START + index;
                    rulesToAdd.push({
                        id: ruleId,
                        priority: RULE_PRIORITY,
                        action: { type: 'redirect', redirect: { url: targetUrl } },
                        condition: {
                            urlFilter: `||${site.domain}^`,
                            excludedInitiatorDomains: [chrome.runtime.id],
                            resourceTypes: ['main_frame']
                        }
                    });
                });
            }

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