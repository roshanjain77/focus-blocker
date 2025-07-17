// tabs.js - OOP Refactored Tab Management with Strategy Pattern
import { UrlBlockingMatcher } from './utils.js';
import { defaultGlobalMessageForBG } from './constants.js';
import { TabRepository } from './state.js';

/**
 * Represents a browser tab with blocking logic
 */
export class BrowserTab {
    constructor(id, url) {
        this.id = id;
        this.url = url;
        this.hostname = this.extractHostname(url);
    }

    /**
     * Extracts hostname from URL safely
     * @param {string} url - URL to extract hostname from
     * @returns {string|null} Hostname or null if invalid
     */
    extractHostname(url) {
        try {
            return new URL(url).hostname.toLowerCase();
        } catch (e) {
            return null;
        }
    }

    /**
     * Checks if this tab should be blocked based on rules
     * @param {Array} rules - Array of blocking rules
     * @returns {Object|null} Matching rule or null if not blocked
     */
    findMatchingRule(rules) {
        // Check for block-all rule first
        const blockAllRule = rules.find(rule => rule.blockAll === true);
        if (blockAllRule) {
            return blockAllRule;
        }

        // Check specific domain rules
        if (!this.hostname) return null;

        for (const rule of rules) {
            if (!rule.domain) continue;
            
            const blockedDomain = rule.domain.toLowerCase();
            if (this.hostname === blockedDomain || this.hostname.endsWith('.' + blockedDomain)) {
                return rule;
            }
        }

        return null;
    }

    /**
     * Checks if URL is valid for blocking
     * @returns {boolean} True if URL can be blocked
     */
    isBlockable() {
        return !!(this.url && this.id && !this.url.startsWith('chrome://') && !this.url.startsWith('moz-extension://'));
    }
}

/**
 * Abstract base class for redirect URL generation strategies
 */
export class RedirectUrlStrategy {
    constructor(baseRedirectUrl, globalMessage) {
        this.baseRedirectUrl = baseRedirectUrl ? baseRedirectUrl.split('?')[0] : '';
        this.globalMessage = globalMessage;
    }

    /**
     * Generates redirect URL for a given rule
     * @param {Object} rule - Blocking rule
     * @returns {string} Complete redirect URL
     */
    generateUrl(rule) {
        throw new Error('generateUrl must be implemented by subclasses');
    }

    /**
     * Creates base URL with encoded message
     * @param {string} message - Message to encode
     * @returns {string} Base URL with message parameter
     */
    createBaseUrl(message) {
        const finalMessage = message || this.globalMessage || "Site blocked";
        return `${this.baseRedirectUrl}?message=${encodeURIComponent(finalMessage)}`;
    }
}

/**
 * Strategy for generating redirect URLs for block-all rules
 */
export class BlockAllRedirectStrategy extends RedirectUrlStrategy {
    generateUrl(rule) {
        return this.createBaseUrl(rule.message);
    }
}

/**
 * Strategy for generating redirect URLs for domain-specific rules
 */
export class DomainRedirectStrategy extends RedirectUrlStrategy {
    generateUrl(rule) {
        let targetUrl = this.createBaseUrl(rule.message);
        
        // Add allowed videos for YouTube domains
        if (this.isYouTubeDomain(rule.domain) && rule.allowedVideos?.length > 0) {
            try {
                const encodedVideos = encodeURIComponent(JSON.stringify(rule.allowedVideos));
                targetUrl += `&allowedVideos=${encodedVideos}`;
            } catch (e) {
                console.error(`[Tab Blocker] Error encoding allowed videos for ${rule.domain}:`, e);
            }
        }
        
        return targetUrl;
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
 * Factory for creating redirect URL strategies
 */
export class RedirectStrategyFactory {
    static createStrategy(rule, baseRedirectUrl, globalMessage) {
        if (rule.blockAll) {
            return new BlockAllRedirectStrategy(baseRedirectUrl, globalMessage);
        } else {
            return new DomainRedirectStrategy(baseRedirectUrl, globalMessage);
        }
    }
}

/**
 * Service for blocking individual tabs
 */
export class TabBlockingService {
    constructor(tabRepository = new TabRepository()) {
        this.tabRepository = tabRepository;
        this.chromeTabsApi = chrome.tabs;
    }

    /**
     * Checks and blocks a tab if needed based on rules
     * @param {number} tabId - Tab ID
     * @param {string} url - Tab URL
     * @param {Array} rules - Blocking rules for active profile
     * @param {string} globalMessage - Global fallback message
     * @param {string} redirectUrl - Base redirect URL
     */
    async checkAndBlockTabIfNeeded(tabId, url, rules, globalMessage, redirectUrl) {
        const baseRedirectUrl = redirectUrl ? redirectUrl.split('?')[0] : '';
        
        // Skip if no URL, no redirect URL, or already on blocked page
        if (!url || !baseRedirectUrl || url.startsWith(baseRedirectUrl)) {
            return;
        }

        const tab = new BrowserTab(tabId, url);
        
        if (!tab.isBlockable()) {
            return;
        }

        const matchingRule = tab.findMatchingRule(rules);
        
        if (matchingRule) {
            await this.blockTab(tab, matchingRule, globalMessage, redirectUrl);
        }
    }

    /**
     * Blocks a tab by redirecting it to the blocked page
     * @param {BrowserTab} tab - Tab to block
     * @param {Object} rule - Matching blocking rule
     * @param {string} globalMessage - Global fallback message
     * @param {string} redirectUrl - Base redirect URL
     */
    async blockTab(tab, rule, globalMessage, redirectUrl) {
        try {
            // Track original URL before blocking
            await this.tabRepository.addBlockedTab(tab.id, tab.url);

            // Generate redirect URL based on rule type
            const strategy = RedirectStrategyFactory.createStrategy(rule, redirectUrl, globalMessage);
            const targetUrl = strategy.generateUrl(rule);

            console.log(`[Tab Blocker] BLOCKING Tab: ${tab.id} (Rule: ${rule.blockAll ? 'BLOCK ALL' : rule.domain}). Redirecting...`);
            
            await this.chromeTabsApi.update(tab.id, { url: targetUrl });
            
        } catch (error) {
            this.handleBlockingError(error, tab.id, rule);
        }
    }

    /**
     * Handles errors that occur during tab blocking
     * @param {Error} error - The error that occurred
     * @param {number} tabId - ID of the tab being blocked
     * @param {Object} rule - The blocking rule
     */
    handleBlockingError(error, tabId, rule) {
        // Ignore common errors when tab is closed or inaccessible
        const ignorableErrors = ["No tab with id", "Cannot access", "Invalid tab ID"];
        const isIgnorable = ignorableErrors.some(msg => error.message.includes(msg));
        
        if (!isIgnorable) {
            console.error(`[Tab Blocker] Error blocking tab ${tabId} with rule ${rule.domain || 'BLOCK ALL'}:`, error);
        }
    }
}

/**
 * Service for managing multiple tabs during focus sessions
 */
export class TabManagerService {
    constructor(tabBlockingService = new TabBlockingService()) {
        this.tabBlockingService = tabBlockingService;
        this.chromeTabsApi = chrome.tabs;
    }

    /**
     * Checks all existing tabs when focus mode starts
     * @param {Array} rules - Blocking rules for active profile
     * @param {string} globalMessage - Global fallback message
     * @param {string} redirectUrl - Base redirect URL
     */
    async checkExistingTabs(rules, globalMessage, redirectUrl) {
        console.log("[Tab Blocker] Focus mode started. Checking all existing tabs...");
        
        try {
            const tabs = await this.chromeTabsApi.query({});
            console.log(`[Tab Blocker] Found ${tabs.length} tabs to check.`);
            
            await this.processTabsBatch(tabs, rules, globalMessage, redirectUrl);
            
            console.log("[Tab Blocker] Finished checking existing tabs.");
        } catch (error) {
            console.error("[Tab Blocker] Error querying or checking existing tabs:", error);
        }
    }

    /**
     * Processes tabs in batches to avoid overwhelming the browser
     * @param {Array} tabs - Array of tab objects
     * @param {Array} rules - Blocking rules
     * @param {string} globalMessage - Global message
     * @param {string} redirectUrl - Redirect URL
     */
    async processTabsBatch(tabs, rules, globalMessage, redirectUrl) {
        const batchSize = 10;
        const delayBetweenTabs = 15; // milliseconds

        for (let i = 0; i < tabs.length; i += batchSize) {
            const batch = tabs.slice(i, i + batchSize);
            
            // Process batch in parallel
            const promises = batch.map(async (tab) => {
                if (tab.id && tab.url) {
                    await this.tabBlockingService.checkAndBlockTabIfNeeded(
                        tab.id, tab.url, rules, globalMessage, redirectUrl
                    );
                    
                    // Small delay to prevent overwhelming the API
                    await this.delay(delayBetweenTabs);
                }
            });

            await Promise.allSettled(promises);
        }
    }

    /**
     * Gets statistics about currently blocked tabs
     * @returns {Promise<Object>} Statistics object
     */
    async getBlockedTabsStats() {
        const tabRepository = new TabRepository();
        const blockedTabs = await tabRepository.getBlockedTabs();
        
        return {
            count: Object.keys(blockedTabs).length,
            tabs: blockedTabs
        };
    }

    /**
     * Restores all blocked tabs to their original URLs
     * @returns {Promise<number>} Number of tabs restored
     */
    async restoreAllBlockedTabs() {
        const tabRepository = new TabRepository();
        const blockedTabs = await tabRepository.getBlockedTabs();
        let restoredCount = 0;

        for (const [tabId, originalUrl] of Object.entries(blockedTabs)) {
            try {
                await this.chromeTabsApi.update(parseInt(tabId), { url: originalUrl });
                await tabRepository.removeBlockedTab(parseInt(tabId));
                restoredCount++;
                console.log(`[Tab Manager] Restored tab ${tabId} to ${originalUrl}`);
            } catch (error) {
                // Tab might be closed or inaccessible
                await tabRepository.removeBlockedTab(parseInt(tabId));
                console.log(`[Tab Manager] Removed stale blocked tab ${tabId}: ${error.message}`);
            }
        }

        console.log(`[Tab Manager] Restored ${restoredCount} tabs`);
        return restoredCount;
    }

    /**
     * Utility method for creating delays
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Promise that resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * High-level tab service that orchestrates all tab-related functionality
 */
export class TabService {
    constructor(
        tabManagerService = new TabManagerService(),
        tabBlockingService = new TabBlockingService()
    ) {
        this.tabManager = tabManagerService;
        this.tabBlocker = tabBlockingService;
    }

    /**
     * Starts focus mode by checking all existing tabs
     * @param {Array} rules - Blocking rules for active profile
     * @param {string} globalMessage - Global fallback message
     * @param {string} redirectUrl - Base redirect URL
     */
    async startFocusMode(rules, globalMessage, redirectUrl) {
        await this.tabManager.checkExistingTabs(rules, globalMessage, redirectUrl);
    }

    /**
     * Stops focus mode by restoring all blocked tabs
     * @returns {Promise<number>} Number of tabs restored
     */
    async stopFocusMode() {
        return this.tabManager.restoreAllBlockedTabs();
    }

    /**
     * Blocks a specific tab if it matches rules
     * @param {number} tabId - Tab ID
     * @param {string} url - Tab URL
     * @param {Array} rules - Blocking rules
     * @param {string} globalMessage - Global message
     * @param {string} redirectUrl - Redirect URL
     */
    async blockTabIfNeeded(tabId, url, rules, globalMessage, redirectUrl) {
        await this.tabBlocker.checkAndBlockTabIfNeeded(tabId, url, rules, globalMessage, redirectUrl);
    }

    /**
     * Gets current blocking statistics
     * @returns {Promise<Object>} Blocking statistics
     */
    async getStats() {
        return this.tabManager.getBlockedTabsStats();
    }
}

// Backward compatibility functions
export async function checkAndBlockTabIfNeeded(tabId, url, rulesForActiveProfile, globalBlockMessage, redirectUrl) {
    const tabService = new TabService();
    return tabService.blockTabIfNeeded(tabId, url, rulesForActiveProfile, globalBlockMessage, redirectUrl);
}

export async function checkExistingTabs(sitesConfig, globalBlockMessage, redirectUrl) {
    const tabService = new TabService();
    return tabService.startFocusMode(sitesConfig, globalBlockMessage, redirectUrl);
}