// utils.js

/**
 * Extracts base domain (e.g., "google.com" from "sub.google.com" or "google.co.uk" from "www.google.co.uk")
 * @param {string} urlInput - The URL or domain string to parse.
 * @returns {string|null} The extracted base domain or null if invalid.
 */
export function extractDomain(urlInput) {
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
        if (!hostname.includes('.') || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
            return null;
        }

        // Remove 'www.' prefix if it exists and isn't the only part
        if (hostname.startsWith('www.') && hostname.split('.').length > 2) {
            hostname = hostname.substring(4);
        }

        // Simple heuristic for registrable domain (e.g., google.com, google.co.uk)
        const parts = hostname.split('.');
        if (parts.length >= 2) {
             const maybeDoubleTld = parts.slice(-2).join('.');
             if (parts.length >= 3 && ['co.uk', 'com.au', 'com.br', 'co.jp', 'gov.uk', 'ac.uk' /* add more */].includes(maybeDoubleTld)) {
                 return parts.slice(-3).join('.').toLowerCase(); // Return lowercased
             } else {
                 return parts.slice(-2).join('.').toLowerCase(); // Return lowercased
             }
        } else {
             return null; // Should not happen if it includes '.' but handle anyway
        }

    } catch (e) {
        console.error(`Error parsing domain input: ${urlInput}`, e);
        return null; // Invalid URL input
    }
}

/**
 * Checks if a given URL matches the blocked site config.
 * @param {string} url - The URL to check.
 * @param {Array<{domain: string, message: string|null}>} sitesConfigToCheck - The current site configuration.
 * @returns {false | string | true} - false (not blocked), string (blocked, use custom msg), true (blocked, use global msg).
 */
export function isUrlBlocked(url, sitesConfigToCheck) {
    if (!url || (!url.startsWith('http:') && !url.startsWith('https://'))) {
         return false; // Ignore non-http(s) URLs
    }
    try {
        const currentUrl = new URL(url);
        const currentHostname = currentUrl.hostname.toLowerCase(); // Normalize hostname

        for (const item of sitesConfigToCheck) {
            // Domain in config should already be processed/lowercase via loadStateFromStorage
            const blockedDomain = item.domain;
            // Check if the current hostname IS the blocked domain OR ends with ".<blockeddomain>"
            if (currentHostname === blockedDomain || currentHostname.endsWith('.' + blockedDomain)) {
                // Match found! Return message if non-empty, otherwise true.
                return (item.message && item.message.trim() !== '') ? item.message : true;
            }
        }
    } catch (e) {
        // console.warn("Could not parse URL in isUrlBlocked:", url, e);
        return false; // Invalid URL parsing
    }
    return false; // No match found
}