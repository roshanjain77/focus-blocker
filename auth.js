// auth.js

/**
 * Gets OAuth token, prompting user if necessary (interactive=true).
 * Resolves with the token string or null if failed/denied.
 * @param {boolean} interactive - Whether to prompt the user for authorization.
 * @returns {Promise<string|null>} The auth token or null.
 */
export async function getAuthToken(interactive) {
    return new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: interactive }, (token) => {
            if (chrome.runtime.lastError) {
                // Log specific common errors but resolve null for flow control
                if (chrome.runtime.lastError.message.includes("OAuth2 not granted") ||
                    chrome.runtime.lastError.message.includes("User interaction required") ||
                    chrome.runtime.lastError.message.includes("User did not approve")) {
                     console.warn(`getAuthToken (${interactive}): OAuth2 not granted or interaction required/declined.`);
                } else {
                    console.error(`getAuthToken (${interactive}) Error:`, chrome.runtime.lastError.message);
                }
                resolve(null); // Indicate token acquisition failed
            } else {
                console.log(`getAuthToken (${interactive}): Token acquired successfully.`);
                resolve(token); // Success
            }
        });
    });
}

/**
 * Removes a cached OAuth token, typically after a 401 error.
 * @param {string} expiredToken - The token that caused the error.
 */
export async function removeCachedAuthToken(expiredToken) {
    if (!expiredToken) return;
    try {
        console.warn('Attempting to remove cached auth token.');
        await chrome.identity.removeCachedAuthToken({ token: expiredToken });
        console.log("Cached auth token removed.");
        // Optional: Inform options page to update its status display
        chrome.runtime.sendMessage({ action: "updateOptionsAuthStatus" }).catch(e => {});
    } catch (error) {
        console.error("Error removing cached auth token:", error);
    }
}