// utils.js - OOP Refactored Domain and URL utilities

/**
 * Domain utility class for parsing and validating domains
 */
export class DomainParser {
    static KNOWN_DOUBLE_TLDS = ['co.uk', 'com.au', 'com.br', 'co.jp', 'gov.uk', 'ac.uk'];
    
    /**
     * Extracts base domain (e.g., "google.com" from "sub.google.com" or "google.co.uk" from "www.google.co.uk")
     * @param {string} urlInput - The URL or domain string to parse.
     * @returns {string|null} The extracted base domain or null if invalid.
     */
    static extractDomain(urlInput) {
        let domain = urlInput ? urlInput.trim() : '';
        if (!domain) return null;

        // Add protocol if missing for URL parser
        if (!/^(?:f|ht)tps?\:\/\//.test(domain)) {
            domain = 'http://' + domain;
        }

        try {
            const url = new URL(domain);
            let hostname = url.hostname; // e.g., "www.google.com"

            // Basic validation
            if (!this.isValidHostname(hostname)) {
                return null;
            }

            // Remove 'www.' prefix if it exists and isn't the only part
            hostname = this.removeWwwPrefix(hostname);

            // Extract registrable domain
            return this.extractRegistrableDomain(hostname);

        } catch (e) {
            console.error(`Error parsing domain input: ${urlInput}`, e);
            return null; // Invalid URL input
        }
    }

    /**
     * Validates if hostname is a valid domain (not IP address, contains dots)
     * @param {string} hostname - The hostname to validate
     * @returns {boolean} True if valid hostname
     */
    static isValidHostname(hostname) {
        return hostname.includes('.') && !/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
    }

    /**
     * Removes www prefix if present and not the only subdomain
     * @param {string} hostname - The hostname to process
     * @returns {string} Hostname without www prefix
     */
    static removeWwwPrefix(hostname) {
        if (hostname.startsWith('www.') && hostname.split('.').length > 2) {
            return hostname.substring(4);
        }
        return hostname;
    }

    /**
     * Extracts the registrable domain using TLD heuristics
     * @param {string} hostname - The hostname to process
     * @returns {string|null} The registrable domain or null if invalid
     */
    static extractRegistrableDomain(hostname) {
        const parts = hostname.split('.');
        if (parts.length < 2) {
            return null;
        }

        const maybeDoubleTld = parts.slice(-2).join('.');
        if (parts.length >= 3 && this.KNOWN_DOUBLE_TLDS.includes(maybeDoubleTld)) {
            return parts.slice(-3).join('.').toLowerCase();
        } else {
            return parts.slice(-2).join('.').toLowerCase();
        }
    }
}

/**
 * URL blocking matcher class with configurable rules
 */
export class UrlBlockingMatcher {
    constructor(sitesConfig = []) {
        this.sitesConfig = sitesConfig;
    }

    /**
     * Updates the sites configuration
     * @param {Array} sitesConfig - Array of site blocking configurations
     */
    updateConfig(sitesConfig) {
        this.sitesConfig = sitesConfig || [];
    }

    /**
     * Checks if a given URL matches the blocked site config.
     * @param {string} url - The URL to check.
     * @returns {BlockingResult} Result object with blocking status and message
     */
    checkUrl(url) {
        if (!this.isValidUrl(url)) {
            return new BlockingResult(false);
        }

        try {
            const currentUrl = new URL(url);
            const currentHostname = currentUrl.hostname.toLowerCase();

            for (const item of this.sitesConfig) {
                const match = this.checkDomainMatch(currentHostname, item.domain);
                if (match) {
                    const message = (item.message && item.message.trim() !== '') ? item.message : null;
                    return new BlockingResult(true, message, item);
                }
            }
        } catch (e) {
            console.warn("Could not parse URL in checkUrl:", url, e);
            return new BlockingResult(false);
        }

        return new BlockingResult(false);
    }

    /**
     * Validates if URL is a valid HTTP(S) URL
     * @param {string} url - The URL to validate
     * @returns {boolean} True if valid HTTP(S) URL
     */
    isValidUrl(url) {
        return url && (url.startsWith('http:') || url.startsWith('https://'));
    }

    /**
     * Checks if hostname matches blocked domain
     * @param {string} hostname - The hostname to check
     * @param {string} blockedDomain - The blocked domain pattern
     * @returns {boolean} True if hostname matches blocked domain
     */
    checkDomainMatch(hostname, blockedDomain) {
        return hostname === blockedDomain || hostname.endsWith('.' + blockedDomain);
    }
}

/**
 * Result object for URL blocking checks
 */
export class BlockingResult {
    constructor(isBlocked, customMessage = null, rule = null) {
        this.isBlocked = isBlocked;
        this.customMessage = customMessage;
        this.rule = rule;
        this.useGlobalMessage = isBlocked && !customMessage;
    }

    /**
     * Gets the message to display (custom or indicates global should be used)
     * @returns {string|boolean|null} Custom message, true for global, or null/false for not blocked
     */
    getMessage() {
        if (!this.isBlocked) return false;
        return this.customMessage || true;
    }
}

// Backward compatibility functions for existing code
export function extractDomain(urlInput) {
    return DomainParser.extractDomain(urlInput);
}

export function isUrlBlocked(url, sitesConfigToCheck) {
    const matcher = new UrlBlockingMatcher(sitesConfigToCheck);
    const result = matcher.checkUrl(url);
    return result.getMessage();
}