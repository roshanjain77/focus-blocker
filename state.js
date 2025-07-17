// state.js - OOP Refactored State Management with Repository Pattern
import { defaultSitesConfigForBG, defaultGlobalMessageForBG, defaultFocusKeyword, MANUAL_FOCUS_END_TIME_KEY, BLOCKED_TABS_MAP_KEY } from './constants.js';
import { DomainParser } from './utils.js';

/**
 * Profile domain model
 */
export class Profile {
    constructor(name, keyword = null) {
        this.name = name;
        this.keyword = keyword;
    }

    static fromObject(obj) {
        return new Profile(obj.name, obj.keyword);
    }

    toObject() {
        return {
            name: this.name,
            keyword: this.keyword
        };
    }
}

/**
 * Blocking rule domain model
 */
export class BlockingRule {
    constructor(id, profiles = [], message = null) {
        this.id = id || crypto.randomUUID();
        this.profiles = Array.isArray(profiles) ? profiles : [];
        this.message = message;
    }

    static fromObject(obj) {
        const id = obj.id || crypto.randomUUID();
        const profiles = Array.isArray(obj.profiles) ? obj.profiles : [];
        const message = obj.message || null;

        if (obj.blockAll === true) {
            return new BlockAllRule(id, profiles, message);
        } else {
            const domain = obj.domain || '';
            const allowedVideos = Array.isArray(obj.allowedVideos) ? obj.allowedVideos : [];
            return new DomainRule(id, profiles, domain, message, allowedVideos);
        }
    }

    toObject() {
        return {
            id: this.id,
            profiles: this.profiles,
            message: this.message
        };
    }
}

/**
 * Domain-specific blocking rule
 */
export class DomainRule extends BlockingRule {
    constructor(id, profiles, domain, message = null, allowedVideos = []) {
        super(id, profiles, message);
        this.domain = domain;
        this.allowedVideos = Array.isArray(allowedVideos) ? allowedVideos : [];
    }

    toObject() {
        return {
            ...super.toObject(),
            domain: this.domain,
            allowedVideos: this.allowedVideos
        };
    }

    /**
     * Expands comma-separated domains into individual rules
     * @returns {Array<DomainRule>} Array of individual domain rules
     */
    expandDomains() {
        if (!this.domain) return [];

        const domains = this.domain.split(',')
            .map(part => part.trim())
            .filter(p => p)
            .map(potentialDomain => DomainParser.extractDomain(potentialDomain))
            .filter(validDomain => validDomain);

        return domains.map(domain => 
            new DomainRule(this.id, this.profiles, domain, this.message, this.allowedVideos)
        );
    }
}

/**
 * Block-all rule
 */
export class BlockAllRule extends BlockingRule {
    constructor(id, profiles, message = null) {
        super(id, profiles, message);
        this.blockAll = true;
    }

    toObject() {
        return {
            ...super.toObject(),
            blockAll: true
        };
    }
}

/**
 * Application state domain model
 */
export class ApplicationState {
    constructor() {
        this.isEnabled = true;
        this.profilesConfig = [new Profile("Manual", null)];
        this.processedSitesConfig = [];
        this.globalBlockMessage = defaultGlobalMessageForBG;
        this.focusKeyword = '';
        this.redirectUrl = chrome.runtime.getURL('blocked.html');
    }

    /**
     * Sets processed rules and ensures they're all expanded domain rules
     * @param {Array<BlockingRule>} rules - Array of blocking rules
     */
    setProcessedRules(rules) {
        this.processedSitesConfig = rules.flatMap(rule => {
            if (rule instanceof DomainRule) {
                return rule.expandDomains();
            } else if (rule instanceof BlockAllRule) {
                return [rule];
            }
            return [];
        });
    }

    /**
     * Gets rules for a specific profile
     * @param {string} profileName - Name of the profile
     * @returns {Array<BlockingRule>} Rules assigned to the profile
     */
    getRulesForProfile(profileName) {
        return this.processedSitesConfig.filter(rule => 
            rule.profiles.includes(profileName)
        );
    }
}

/**
 * Repository for application state persistence
 */
export class StateRepository {
    constructor() {
        this.syncStorage = chrome.storage.sync;
        this.localStorage = chrome.storage.local;
    }

    /**
     * Loads complete application state from storage
     * @returns {Promise<ApplicationState>} The loaded application state
     */
    async loadState() {
        console.log("StateRepository: Loading settings...");
        const state = new ApplicationState();

        try {
            const data = await this.syncStorage.get([
                'sitesConfig', 'profilesConfig', 'globalBlockMessage', 'isEnabled'
            ]);

            state.isEnabled = data.isEnabled === undefined ? true : data.isEnabled;
            state.globalBlockMessage = data.globalBlockMessage || defaultGlobalMessageForBG;

            // Load profiles
            const rawProfilesConfig = data.profilesConfig || [{ name: "Manual", keyword: null }];
            state.profilesConfig = rawProfilesConfig.map(Profile.fromObject);
            console.log("Loaded Profiles Config:", state.profilesConfig);

            // Load and process rules
            const rawSitesConfig = data.sitesConfig || [];
            const rules = rawSitesConfig.map(BlockingRule.fromObject);
            state.setProcessedRules(rules);

            console.log("Processed Sites Config Count:", state.processedSitesConfig.length);

        } catch (error) {
            console.error("Error loading state:", error);
            this.applyDefaults(state);
        }

        return state;
    }

    /**
     * Saves application state to storage
     * @param {ApplicationState} state - State to save
     */
    async saveState(state) {
        try {
            const dataToSave = {
                isEnabled: state.isEnabled,
                globalBlockMessage: state.globalBlockMessage,
                profilesConfig: state.profilesConfig.map(p => p.toObject())
            };

            await this.syncStorage.set(dataToSave);
            console.log("State saved successfully");
        } catch (error) {
            console.error("Error saving state:", error);
        }
    }

    /**
     * Saves blocking rules to storage
     * @param {Array<BlockingRule>} rules - Rules to save
     */
    async saveRules(rules) {
        try {
            const sitesConfig = rules.map(rule => rule.toObject());
            await this.syncStorage.set({ sitesConfig });
            console.log("Rules saved successfully");
        } catch (error) {
            console.error("Error saving rules:", error);
        }
    }

    /**
     * Saves profiles to storage
     * @param {Array<Profile>} profiles - Profiles to save
     */
    async saveProfiles(profiles) {
        try {
            const profilesConfig = profiles.map(p => p.toObject());
            await this.syncStorage.set({ profilesConfig });
            console.log("Profiles saved successfully");
        } catch (error) {
            console.error("Error saving profiles:", error);
        }
    }

    /**
     * Applies default values to state
     * @param {ApplicationState} state - State to apply defaults to
     */
    applyDefaults(state) {
        state.profilesConfig = [new Profile("Manual", null)];
        state.processedSitesConfig = [];
        state.globalBlockMessage = defaultGlobalMessageForBG;
        state.isEnabled = true;
    }

    /**
     * Initializes default settings on extension installation
     */
    async initializeSettings() {
        try {
            await this.syncStorage.set({
                sitesConfig: defaultSitesConfigForBG,
                globalBlockMessage: defaultGlobalMessageForBG,
                focusKeyword: defaultFocusKeyword,
                isEnabled: true
            });
            console.log("Default settings applied on install.");
        } catch (error) {
            console.error("Error initializing settings:", error);
        }
    }
}

/**
 * Repository for manual focus session management
 */
export class FocusSessionRepository {
    constructor() {
        this.localStorage = chrome.storage.local;
    }

    /**
     * Gets the manual focus end time
     * @returns {Promise<number|null>} Timestamp of end time, or null if not set/expired
     */
    async getManualFocusEndTime() {
        try {
            const data = await this.localStorage.get(MANUAL_FOCUS_END_TIME_KEY);
            const endTime = data[MANUAL_FOCUS_END_TIME_KEY];
            return (endTime && endTime > Date.now()) ? endTime : null;
        } catch (error) {
            console.error("Error getting manual focus end time:", error);
            return null;
        }
    }

    /**
     * Sets the manual focus end time
     * @param {number} endTime - Timestamp when manual focus should end
     */
    async setManualFocusEndTime(endTime) {
        try {
            await this.localStorage.set({ [MANUAL_FOCUS_END_TIME_KEY]: endTime });
            console.log("Manual focus end time set:", new Date(endTime));
        } catch (error) {
            console.error("Error setting manual focus end time:", error);
        }
    }

    /**
     * Clears the manual focus end time
     */
    async clearManualFocusEndTime() {
        try {
            await this.localStorage.remove(MANUAL_FOCUS_END_TIME_KEY);
            console.log("Manual focus end time cleared.");
        } catch (error) {
            console.error("Error clearing manual focus end time:", error);
        }
    }

    /**
     * Updates popup state
     * @param {string} statusText - Status text to display
     * @param {number|null} manualEndTime - Manual focus end time or null
     */
    updatePopupState(statusText, manualEndTime = null) {
        const stateToSet = { 
            extensionStatus: statusText,
            [MANUAL_FOCUS_END_TIME_KEY]: manualEndTime
        };

        this.localStorage.set(stateToSet).catch(error => {
            console.warn("Error setting popup state:", error);
        });
    }
}

/**
 * Repository for blocked tabs management
 */
export class TabRepository {
    constructor() {
        this.localStorage = chrome.storage.local;
    }

    /**
     * Gets the map of blocked tabs
     * @returns {Promise<Object>} Map of tabId -> originalUrl
     */
    async getBlockedTabs() {
        try {
            const data = await this.localStorage.get(BLOCKED_TABS_MAP_KEY);
            return data[BLOCKED_TABS_MAP_KEY] || {};
        } catch (error) {
            console.error("Error getting blocked tabs map:", error);
            return {};
        }
    }

    /**
     * Adds or updates a tab in the blocked tabs map
     * @param {number} tabId - Tab ID
     * @param {string} originalUrl - Original URL of the tab
     */
    async addBlockedTab(tabId, originalUrl) {
        if (!tabId || !originalUrl) return;
        try {
            const map = await this.getBlockedTabs();
            map[tabId] = originalUrl;
            await this.localStorage.set({ [BLOCKED_TABS_MAP_KEY]: map });
            console.log(`Blocked tab added/updated: ${tabId} -> ${originalUrl}`);
        } catch (error) {
            console.error(`Error adding blocked tab ${tabId}:`, error);
        }
    }

    /**
     * Removes a tab from the blocked tabs map
     * @param {number} tabId - Tab ID to remove
     */
    async removeBlockedTab(tabId) {
        if (!tabId) return;
        try {
            const map = await this.getBlockedTabs();
            if (map[tabId]) {
                delete map[tabId];
                await this.localStorage.set({ [BLOCKED_TABS_MAP_KEY]: map });
                console.log(`Blocked tab removed: ${tabId}`);
            }
        } catch (error) {
            console.error(`Error removing blocked tab ${tabId}:`, error);
        }
    }

    /**
     * Clears the entire blocked tabs map
     */
    async clearBlockedTabs() {
        try {
            await this.localStorage.remove(BLOCKED_TABS_MAP_KEY);
            console.log("Blocked tabs map cleared.");
        } catch (error) {
            console.error("Error clearing blocked tabs map:", error);
        }
    }
}

// Backward compatibility functions
export async function loadStateFromStorage() {
    const repository = new StateRepository();
    const state = await repository.loadState();
    
    // Convert to old format for backward compatibility
    return {
        isEnabled: state.isEnabled,
        sitesConfig: state.processedSitesConfig.map(rule => rule.toObject()),
        blockedDomains: state.processedSitesConfig
            .filter(rule => rule.domain)
            .map(rule => rule.domain),
        globalBlockMessage: state.globalBlockMessage,
        focusKeyword: state.focusKeyword,
        redirectUrl: state.redirectUrl,
        profilesConfig: state.profilesConfig.map(p => p.toObject()),
        processedSitesConfig: state.processedSitesConfig.map(rule => rule.toObject())
    };
}

export async function getManualFocusEndTime() {
    const repository = new FocusSessionRepository();
    return repository.getManualFocusEndTime();
}

export async function setManualFocusEndTime(endTime) {
    const repository = new FocusSessionRepository();
    return repository.setManualFocusEndTime(endTime);
}

export async function clearManualFocusEndTime() {
    const repository = new FocusSessionRepository();
    return repository.clearManualFocusEndTime();
}

export function updatePopupState(statusText, manualEndTime = null) {
    const repository = new FocusSessionRepository();
    return repository.updatePopupState(statusText, manualEndTime);
}

export async function initializeSettings() {
    const repository = new StateRepository();
    return repository.initializeSettings();
}

export async function getBlockedTabs() {
    const repository = new TabRepository();
    return repository.getBlockedTabs();
}

export async function addBlockedTab(tabId, originalUrl) {
    const repository = new TabRepository();
    return repository.addBlockedTab(tabId, originalUrl);
}

export async function removeBlockedTab(tabId) {
    const repository = new TabRepository();
    return repository.removeBlockedTab(tabId);
}

export async function clearBlockedTabs() {
    const repository = new TabRepository();
    return repository.clearBlockedTabs();
}