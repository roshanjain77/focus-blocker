// blocking.js - OOP Refactored DNR (Declarative Net Request) Management
import { RULE_PRIORITY, FOCUS_RULE_ID_START, MAX_BLOCKED_SITES, FOCUS_RULE_ID_END } from './constants.js';
import { defaultGlobalMessageForBG } from './constants.js';

/**
 * Abstract base class for blocking rule generators
 */
export class RuleGenerator {
    constructor(baseRedirectUrl, globalMessage) {
        this.baseRedirectUrl = baseRedirectUrl.split('?')[0];
        this.globalMessage = globalMessage;
    }

    /**
     * Generates DNR rules for the given rule configuration
     * @param {Object} rule - Rule configuration
     * @param {number} index - Rule index for ID generation
     * @returns {Array} Array of DNR rules
     */
    generateRules(rule, index) {
        throw new Error('generateRules must be implemented by subclasses');
    }

    /**
     * Creates the redirect URL with encoded message and optional parameters
     * @param {string} message - Message to encode
     * @param {Object} additionalParams - Additional URL parameters
     * @returns {string} Complete redirect URL
     */
    createRedirectUrl(message, additionalParams = {}) {
        const encodedMessage = encodeURIComponent(message || this.globalMessage || "Site blocked");
        let url = `${this.baseRedirectUrl}?message=${encodedMessage}`;
        
        for (const [key, value] of Object.entries(additionalParams)) {
            if (value !== null && value !== undefined) {
                url += `&${key}=${encodeURIComponent(value)}`;
            }
        }
        
        return url;
    }
}

/**
 * Generator for domain-specific blocking rules
 */
export class DomainRuleGenerator extends RuleGenerator {
    generateRules(rule, index) {
        if (!rule.domain) {
            console.warn(`[DNR Rules] Skipping rule for invalid site entry at index ${index}.`);
            return [];
        }

        if (index >= MAX_BLOCKED_SITES) {
            console.warn(`[DNR Rules] Max rule limit (${MAX_BLOCKED_SITES}) reached, skipping domain: ${rule.domain}`);
            return [];
        }

        const additionalParams = this.getAdditionalParams(rule);
        const targetUrl = this.createRedirectUrl(rule.message, additionalParams);
        const ruleId = FOCUS_RULE_ID_START + index;

        return [{
            id: ruleId,
            priority: RULE_PRIORITY,
            action: { type: 'redirect', redirect: { url: targetUrl } },
            condition: {
                urlFilter: `||${rule.domain}^`,
                excludedInitiatorDomains: [chrome.runtime.id],
                resourceTypes: ['main_frame']
            }
        }];
    }

    /**
     * Gets additional parameters for the redirect URL (e.g., allowed videos)
     * @param {Object} rule - Rule configuration
     * @returns {Object} Additional parameters
     */
    getAdditionalParams(rule) {
        const params = {};

        // Handle YouTube allowed videos
        if (this.isYouTubeDomain(rule.domain) && rule.allowedVideos?.length > 0) {
            try {
                params.allowedVideos = JSON.stringify(rule.allowedVideos);
                console.log(`[DNR Rules] Adding allowed videos JSON to rule for ${rule.domain}`);
            } catch (e) {
                console.error(`Error stringifying allowedVideos for ${rule.domain}:`, e);
            }
        }

        return params;
    }

    /**
     * Checks if domain is a YouTube domain
     * @param {string} domain - Domain to check
     * @returns {boolean} True if YouTube domain
     */
    isYouTubeDomain(domain) {
        return domain === 'youtube.com' || domain === 'youtu.be';
    }
}

/**
 * Generator for block-all rules
 */
export class BlockAllRuleGenerator extends RuleGenerator {
    generateRules(rule, index) {
        console.log(`[DNR Rules] Applying BLOCK ALL rule for this profile.`);
        
        const targetUrl = this.createRedirectUrl(rule.message);
        const ruleId = FOCUS_RULE_ID_START;

        return [{
            id: ruleId,
            priority: RULE_PRIORITY + 1, // Higher priority than domain rules
            action: { type: 'redirect', redirect: { url: targetUrl } },
            condition: {
                urlFilter: "|http*://*/*", // Matches all HTTP/HTTPS URLs
                excludedInitiatorDomains: [chrome.runtime.id],
                resourceTypes: ['main_frame']
            }
        }];
    }
}

/**
 * Factory for creating appropriate rule generators
 */
export class RuleGeneratorFactory {
    static createGenerator(rule, baseRedirectUrl, globalMessage) {
        if (rule.blockAll === true) {
            return new BlockAllRuleGenerator(baseRedirectUrl, globalMessage);
        } else {
            return new DomainRuleGenerator(baseRedirectUrl, globalMessage);
        }
    }
}

/**
 * Service for managing DNR (Declarative Net Request) rules
 */
export class DNRService {
    constructor() {
        this.api = chrome.declarativeNetRequest;
        this.logPrefix = "[DNR Rules]";
    }

    /**
     * Updates DNR rules based on blocking configuration
     * @param {boolean} shouldBlock - Whether blocking should be enabled
     * @param {Array} rulesForActiveProfile - Rules for the active profile
     * @param {string} globalBlockMessage - Fallback message
     * @param {string} redirectUrl - Base blocked page URL
     */
    async updateBlockingRules(shouldBlock, rulesForActiveProfile, globalBlockMessage, redirectUrl) {
        try {
            const existingRuleIds = await this.getExistingFocusRuleIds();
            const rulesToAdd = this.generateRulesToAdd(shouldBlock, rulesForActiveProfile, globalBlockMessage, redirectUrl);

            await this.applyRuleChanges(existingRuleIds, rulesToAdd);

        } catch (error) {
            console.error(`${this.logPrefix} FAILED to update rules:`, error);
            this.handleRuleUpdateError(error);
        }
    }

    /**
     * Gets existing focus rule IDs from the session
     * @returns {Promise<Array<number>>} Array of existing rule IDs
     */
    async getExistingFocusRuleIds() {
        const allSessionRules = await this.api.getSessionRules();
        return allSessionRules
            .filter(rule => rule.id >= FOCUS_RULE_ID_START && rule.id <= FOCUS_RULE_ID_END)
            .map(rule => rule.id);
    }

    /**
     * Generates rules to add based on configuration
     * @param {boolean} shouldBlock - Whether blocking should be enabled
     * @param {Array} rulesForActiveProfile - Rules for the active profile
     * @param {string} globalBlockMessage - Fallback message
     * @param {string} redirectUrl - Base blocked page URL
     * @returns {Array} Array of DNR rules to add
     */
    generateRulesToAdd(shouldBlock, rulesForActiveProfile, globalBlockMessage, redirectUrl) {
        if (!shouldBlock || !rulesForActiveProfile.length || !redirectUrl) {
            this.logWhyRulesNotAdded(shouldBlock, rulesForActiveProfile, redirectUrl);
            return [];
        }

        // Check for block-all rule first
        const blockAllRule = rulesForActiveProfile.find(rule => rule.blockAll === true);
        
        if (blockAllRule) {
            const generator = new BlockAllRuleGenerator(redirectUrl, globalBlockMessage);
            return generator.generateRules(blockAllRule, 0);
        } else {
            return this.generateDomainRules(rulesForActiveProfile, redirectUrl, globalBlockMessage);
        }
    }

    /**
     * Generates domain-specific rules
     * @param {Array} rules - Domain rules to generate
     * @param {string} redirectUrl - Base redirect URL
     * @param {string} globalMessage - Global fallback message
     * @returns {Array} Array of DNR rules
     */
    generateDomainRules(rules, redirectUrl, globalMessage) {
        console.log(`${this.logPrefix} Applying specific domain rules for this profile.`);
        const rulesToAdd = [];
        const generator = new DomainRuleGenerator(redirectUrl, globalMessage);

        rules.forEach((rule, index) => {
            const generatedRules = generator.generateRules(rule, index);
            rulesToAdd.push(...generatedRules);
        });

        return rulesToAdd;
    }

    /**
     * Applies rule changes atomically
     * @param {Array<number>} existingRuleIds - IDs of rules to remove
     * @param {Array} rulesToAdd - Rules to add
     */
    async applyRuleChanges(existingRuleIds, rulesToAdd) {
        console.log(`${this.logPrefix} Rules to Add Count:`, rulesToAdd.length);
        console.log(`${this.logPrefix} Rule IDs to Remove Count:`, existingRuleIds.length);

        if (rulesToAdd.length > 0 || existingRuleIds.length > 0) {
            await this.api.updateSessionRules({
                removeRuleIds: existingRuleIds,
                addRules: rulesToAdd
            });
            console.log(`${this.logPrefix} Rules updated successfully.`);
        } else {
            console.log(`${this.logPrefix} No rule changes needed.`);
        }
    }

    /**
     * Logs why rules are not being added
     * @param {boolean} shouldBlock - Blocking state
     * @param {Array} rules - Rules array
     * @param {string} redirectUrl - Redirect URL
     */
    logWhyRulesNotAdded(shouldBlock, rules, redirectUrl) {
        if (!shouldBlock) {
            console.log(`${this.logPrefix} Focus inactive or extension disabled, removing rules.`);
        } else if (!redirectUrl) {
            console.log(`${this.logPrefix} Redirect URL missing, cannot add rules.`);
        } else {
            console.log(`${this.logPrefix} No sites configured, removing rules.`);
        }
    }

    /**
     * Handles errors that occur during rule updates
     * @param {Error} error - The error that occurred
     */
    handleRuleUpdateError(error) {
        if (error.message.includes('MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES')) {
            console.error(`${this.logPrefix} Exceeded the maximum number of rules allowed by Chrome.`);
            throw new Error('Rule Limit Exceeded');
        }
        throw error;
    }

    /**
     * Clears all focus-related rules
     */
    async clearAllRules() {
        const existingRuleIds = await this.getExistingFocusRuleIds();
        if (existingRuleIds.length > 0) {
            await this.api.updateSessionRules({
                removeRuleIds: existingRuleIds,
                addRules: []
            });
            console.log(`${this.logPrefix} All focus rules cleared.`);
        }
    }

    /**
     * Gets current session rules for debugging
     * @returns {Promise<Array>} Current session rules
     */
    async getCurrentRules() {
        return this.api.getSessionRules();
    }
}

/**
 * High-level blocking service that orchestrates the blocking functionality
 */
export class BlockingService {
    constructor(dnrService = new DNRService()) {
        this.dnrService = dnrService;
    }

    /**
     * Enables blocking for the given profile rules
     * @param {Array} profileRules - Rules for the active profile
     * @param {string} globalMessage - Global fallback message
     * @param {string} redirectUrl - Blocked page URL
     */
    async enableBlocking(profileRules, globalMessage, redirectUrl) {
        await this.dnrService.updateBlockingRules(true, profileRules, globalMessage, redirectUrl);
    }

    /**
     * Disables all blocking
     */
    async disableBlocking() {
        await this.dnrService.updateBlockingRules(false, [], '', '');
    }

    /**
     * Updates blocking rules for a specific profile
     * @param {string} profileName - Name of the profile
     * @param {Array} allRules - All available rules
     * @param {string} globalMessage - Global fallback message
     * @param {string} redirectUrl - Blocked page URL
     */
    async updateProfileBlocking(profileName, allRules, globalMessage, redirectUrl) {
        const profileRules = allRules.filter(rule => 
            rule.profiles && rule.profiles.includes(profileName)
        );
        
        if (profileRules.length > 0) {
            await this.enableBlocking(profileRules, globalMessage, redirectUrl);
        } else {
            await this.disableBlocking();
        }
    }

    /**
     * Gets current blocking status
     * @returns {Promise<Object>} Object containing current rules and status
     */
    async getBlockingStatus() {
        const currentRules = await this.dnrService.getCurrentRules();
        const focusRules = currentRules.filter(rule => 
            rule.id >= FOCUS_RULE_ID_START && rule.id <= FOCUS_RULE_ID_END
        );
        
        return {
            isBlocking: focusRules.length > 0,
            ruleCount: focusRules.length,
            rules: focusRules
        };
    }
}

// Backward compatibility function
export async function updateBlockingRules(shouldBlock, rulesForActiveProfile, globalBlockMessage, redirectUrl) {
    const dnrService = new DNRService();
    return dnrService.updateBlockingRules(shouldBlock, rulesForActiveProfile, globalBlockMessage, redirectUrl);
}