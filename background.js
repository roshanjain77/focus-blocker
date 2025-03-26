// background.js

// Constants
const CALENDAR_CHECK_ALARM = 'calendarCheckAlarm';
const RULE_PRIORITY = 1;
const FOCUS_RULE_ID_START = 1000; // Start ID for DNR rules
const MAX_BLOCKED_SITES = 100; // Max DNR rules to create (Chrome has a higher limit, but keep this reasonable)
const FOCUS_RULE_ID_END = FOCUS_RULE_ID_START + MAX_BLOCKED_SITES - 1;

// --- Global State (for quick access in listeners) ---
let currentFocusState = false; // Is the extension currently in focus mode?
let currentSitesConfig = [];   // Array of {domain: string, message: string|null}
let currentBlockedDomains = []; // Derived list of domain strings for DNR rules
let currentGlobalBlockMessage = ''; // Cached global fallback message
let redirectUrl = '';             // Cached URL for blocked.html
let extensionIsEnabled = true;    // Cached enabled status

// --- Default values used if storage is corrupt/empty ---
const defaultSitesConfigForBG = [
    { domain: "youtube.com", message: "Maybe watch this later?" },
    { domain: "facebook.com", message: null },
    { domain: "twitter.com", message: null },
    { domain: "reddit.com", message: "Focus time! No endless scrolling." }
];
const defaultGlobalMessageForBG = 'This site is blocked during your scheduled focus time.';
const defaultFocusKeyword = '[Focus]';

// --- Helper Functions ---

// Extracts base domain (e.g., "google.com" from "sub.google.com" or "google.co.uk" from "www.google.co.uk")
function extractDomain(urlInput) {
    let domain = urlInput ? urlInput.trim() : '';
    if (!domain) return null;

    // Add protocol if missing for URL parser, default to http for robustness
    if (!/^(?:f|ht)tps?\:\/\//.test(domain)) {
        domain = 'http://' + domain;
    }

    try {
        const url = new URL(domain);
        let hostname = url.hostname; // e.g., "www.google.com" or "mail.google.com" or "google.co.uk"

        // Basic validation: must contain at least one dot and not be an IP address
        if (!hostname.includes('.') || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
            return null;
        }

        // Remove 'www.' prefix if it exists and isn't the only part
        if (hostname.startsWith('www.') && hostname.split('.').length > 2) {
            hostname = hostname.substring(4);
        }

        // Attempt to get the registrable domain part (e.g., google.com, google.co.uk)
        // This is a simple heuristic and might not cover all edge cases perfectly
        const parts = hostname.split('.');
        if (parts.length >= 2) {
             // Handle common TLDs like .co.uk, .com.au etc.
             const maybeDoubleTld = parts.slice(-2).join('.');
             if (parts.length >= 3 && ['co.uk', 'com.au', 'com.br', 'co.jp', 'gov.uk', 'ac.uk', /* add more as needed */].includes(maybeDoubleTld)) {
                 return parts.slice(-3).join('.');
             } else {
                 // Standard case: return last two parts
                 return parts.slice(-2).join('.');
             }
        } else {
             // If only one part (like 'localhost'), it's not a typical block target? Return null or hostname?
             // Let's return null as we expect public domains.
             return null;
        }

    } catch (e) {
        console.error(`Error parsing domain input: ${urlInput}`, e);
        return null; // Invalid URL input
    }
}


async function loadAndUpdateState() {
    console.log("loadAndUpdateState: Loading settings...");
    try {
        const data = await chrome.storage.sync.get([
            'sitesConfig', 'globalBlockMessage', 'isEnabled'
        ]);
        extensionIsEnabled = data.isEnabled === undefined ? true : data.isEnabled;

        const rawSitesConfig = data.sitesConfig || defaultSitesConfigForBG;
        // ** CRITICAL: Re-process and validate domains on load **
        currentSitesConfig = rawSitesConfig.map(item => ({
            domain: extractDomain(item.domain), // Use robust extraction/validation
            message: item.message || null
        })).filter(item => item.domain); // Filter out any entries with invalid domains

        currentBlockedDomains = currentSitesConfig.map(item => item.domain);
        currentGlobalBlockMessage = data.globalBlockMessage || defaultGlobalMessageForBG;
        redirectUrl = chrome.runtime.getURL('blocked.html');
        console.log("State loaded/updated. Enabled:", extensionIsEnabled, "Valid Config Count:", currentSitesConfig.length);
    } catch (error) {
        console.error("Error loading state from storage:", error);
        // Apply defaults on error to prevent broken state
        extensionIsEnabled = true;
        currentSitesConfig = defaultSitesConfigForBG.map(item => ({ domain: extractDomain(item.domain), message: item.message })).filter(i => i.domain);
        currentBlockedDomains = currentSitesConfig.map(item => item.domain);
        currentGlobalBlockMessage = defaultGlobalMessageForBG;
        redirectUrl = chrome.runtime.getURL('blocked.html');
        console.log("Applied default state due to loading error.");
    }
}

// Gets OAuth token, prompting user if necessary (interactive=true)
async function getAuthToken(interactive) {
    return new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: interactive }, (token) => {
            if (chrome.runtime.lastError) {
                // Log specific common errors but resolve null for flow control
                if (chrome.runtime.lastError.message.includes("OAuth2 not granted")) {
                    console.warn('getAuthToken: OAuth2 not granted or revoked.');
                } else if (chrome.runtime.lastError.message.includes("User interaction required")) {
                     console.warn('getAuthToken: User interaction required for authorization.');
                } else {
                    console.error('getAuthToken Error:', chrome.runtime.lastError.message);
                }
                resolve(null); // Indicate token acquisition failed
            } else {
                resolve(token); // Success
            }
        });
    });
}

// Fetches calendar events around 'now' and checks if a focus event is active
async function isCurrentlyInFocusEvent(token, focusKeyword) {
    const now = new Date();
    // Look slightly back and forward to catch events starting/ending around now
    const timeMin = new Date(now.getTime() - 2 * 60 * 1000).toISOString(); // 2 minutes ago
    const timeMax = new Date(now.getTime() + 2 * 60 * 1000).toISOString(); // 2 minutes ahead
    const safeFocusKeyword = focusKeyword || defaultFocusKeyword;
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=10&q=${encodeURIComponent(safeFocusKeyword)}`;

    console.log(`Checking calendar with keyword: "${safeFocusKeyword}"`);

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            // Handle specific errors
            if (response.status === 401) { // Unauthorized
                console.warn('Received 401 Unauthorized. Token might be expired/revoked. Removing cached token.');
                // Remove the potentially invalid token
                chrome.identity.removeCachedAuthToken({ token: token }, () => {
                     console.log("Cached auth token removed due to 401.");
                     // Optional: Try to inform options page to update status?
                     chrome.runtime.sendMessage({ action: "updateOptionsAuthStatus" }).catch(e => {});
                });
            } else if (response.status === 403) { // Forbidden
                console.error(`Received 403 Forbidden. Ensure Google Calendar API is enabled: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com`);
            } else {
                console.error(`Google Calendar API Error: ${response.status} ${response.statusText}`);
            }
             // Don't throw here, just return false (assume not in focus on error)
            return false;
        }

        const data = await response.json();
        console.log("Fetched events:", data.items ? data.items.length : 0);

        if (data.items && data.items.length > 0) {
            const currentTime = now.getTime();
            for (const event of data.items) {
                 // Double-check keyword presence as 'q' param can be fuzzy
                if (event.summary && event.summary.toLowerCase().includes(safeFocusKeyword.toLowerCase())) {
                    // Handle both dateTime (specific time) and date (all-day) events
                    const start = new Date(event.start.dateTime || event.start.date).getTime();
                    // For all-day events, the end date is exclusive (start of next day)
                    let end;
                    if (event.end.dateTime) {
                        end = new Date(event.end.dateTime).getTime();
                    } else {
                         // All-day event ends at midnight *at the start* of the given end date
                         const endDate = new Date(event.end.date);
                         end = endDate.getTime(); // Time is 00:00:00 on the end date
                    }

                    console.log(`Event: "${event.summary}", Start: ${new Date(start)}, End: ${new Date(end)}, Now: ${now}`);

                    // Check if 'now' is within the event's time range (inclusive start, exclusive end)
                    if (currentTime >= start && currentTime < end) {
                        console.log(`---> Focus event found and ACTIVE: "${event.summary}"`);
                        return true; // Currently in a matching focus event
                    }
                }
            }
        }
        console.log('No active focus event found matching the keyword and time.');
        return false; // No active matching event found
    } catch (error) {
        // Catch fetch errors or other exceptions
        console.error('Error fetching/processing calendar events:', error);
        return false; // Assume not in focus on error
    }
}

// Updates Declarative Net Request rules
async function updateBlockingRules(shouldBlock) {
    const logPrefix = "[DNR Rules]";
    try {
        const allSessionRules = await chrome.declarativeNetRequest.getSessionRules();
        const existingFocusRuleIds = allSessionRules
            .filter(rule => rule.id >= FOCUS_RULE_ID_START && rule.id <= FOCUS_RULE_ID_END)
            .map(rule => rule.id);

        const rulesToAdd = [];
        const domainsToBlock = currentBlockedDomains; // Use the cached, processed list

        if (shouldBlock && extensionIsEnabled && domainsToBlock.length > 0) {
            console.log(`${logPrefix} Setting up rules for ${domainsToBlock.length} domains:`, domainsToBlock);
            if (!redirectUrl) redirectUrl = chrome.runtime.getURL('blocked.html'); // Ensure redirect URL is set

            const baseRedirectUrl = redirectUrl.split('?')[0]; // Ensure we use the base URL for DNR

            domainsToBlock.forEach((domain, index) => {
                if (index >= MAX_BLOCKED_SITES) {
                    console.warn(`${logPrefix} Max rule limit (${MAX_BLOCKED_SITES}) reached, skipping domain: ${domain}`);
                    return;
                }
                const ruleId = FOCUS_RULE_ID_START + index;
                rulesToAdd.push({
                    id: ruleId,
                    priority: RULE_PRIORITY,
                    action: { type: 'redirect', redirect: { url: baseRedirectUrl } }, // Redirect to base blocked.html
                    condition: {
                        // Apply to the domain and all subdomains for main frame requests
                        // Exclude the blocked page itself to prevent loops
                        urlFilter: `*://${domain}/*`, // Match domain without www
                        excludedInitiatorDomains: [chrome.runtime.id], // Don't block if initiated by the extension
                        resourceTypes: ['main_frame']
                    }
                });
                // Also block www explicitly if needed, though urlFilter *should* cover it.
                // Consider adding `*://www.${domain}/*` if simple filter isn't catching www reliably.
            });
        } else {
            if (!extensionIsEnabled) console.log(`${logPrefix} Extension disabled, removing rules.`);
            else if (!shouldBlock) console.log(`${logPrefix} Focus inactive, removing rules.`);
            else console.log(`${logPrefix} No domains to block, removing rules.`);
        }

        // Apply changes atomically
        console.log(`${logPrefix} Rules to Add:`, rulesToAdd.map(r => r.id));
        console.log(`${logPrefix} Rule IDs to Remove:`, existingFocusRuleIds);

        await chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: existingFocusRuleIds,
            addRules: rulesToAdd
        });
        console.log(`${logPrefix} Rules updated successfully.`);

    } catch (error) {
        console.error(`${logPrefix} FAILED to update rules:`, error);
        // Check for specific errors like rule limits
        if (error.message.includes('MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES')) {
            console.error(`${logPrefix} Exceeded the maximum number of rules allowed by Chrome.`);
            // Consider notifying the user via popup or options page state
            updatePopupState('Error: Rule Limit');
        }
    }
}

// Checks if a given URL matches the blocked site config
// Returns: false (not blocked), true (blocked, use global msg), string (blocked, use custom msg)
function isUrlBlocked(url, sitesConfigToCheck) {
    if (!url || (!url.startsWith('http:') && !url.startsWith('https://'))) {
         return false; // Ignore non-http(s) URLs
    }
    try {
        const currentUrl = new URL(url);
        // Normalize hostname (lowercase)
        const currentHostname = currentUrl.hostname.toLowerCase();

        for (const item of sitesConfigToCheck) {
            const blockedDomain = item.domain.toLowerCase(); // Domain stored should already be processed/lowercase
            // Check if the current hostname IS the blocked domain OR ends with ".<blockeddomain>"
            if (currentHostname === blockedDomain || currentHostname.endsWith('.' + blockedDomain)) {
                // Match found! Return the message if it's a non-empty string, otherwise true.
                return (item.message && item.message.trim() !== '') ? item.message : true;
            }
        }
    } catch (e) {
        // console.warn("Could not parse URL in isUrlBlocked:", url, e); // Can be noisy
        return false; // Invalid URL parsing
    }
    return false; // No match found
}

// Redirects a tab if it matches a blocked site during focus mode
async function checkAndBlockTabIfNeeded(tabId, url) {
    if (!extensionIsEnabled || !currentFocusState) return; // Only check if enabled and in focus

    const baseRedirectUrl = redirectUrl ? redirectUrl.split('?')[0] : '';
    if (!url || !baseRedirectUrl || url.startsWith(baseRedirectUrl)) {
        // Ignore empty URLs, cases before redirect URL is set, or already blocked tabs
        return;
    }

    const blockResult = isUrlBlocked(url, currentSitesConfig); // Check against current config

    if (blockResult !== false) { // If it IS blocked (true or message string)
        let finalMessage;
        if (typeof blockResult === 'string') {
            finalMessage = blockResult; // Use specific message
        } else {
            finalMessage = currentGlobalBlockMessage || defaultGlobalMessageForBG; // Use global fallback
        }

        // Encode the message and create the target URL
        const encodedMessage = encodeURIComponent(finalMessage);
        const targetUrl = `${baseRedirectUrl}?message=${encodedMessage}`; // Add message as query param

        console.log(`[Tab Blocker] BLOCKING Tab: ${tabId}, URL: ${url}. Redirecting...`);
        try {
            await chrome.tabs.update(tabId, { url: targetUrl });
        } catch (error) {
            // Ignore common errors when tab is closed or inaccessible
            if (!error.message.includes("No tab with id") && !error.message.includes("Cannot access") && !error.message.includes("Invalid tab ID")) {
                console.error(`[Tab Blocker] Error updating tab ${tabId} to ${targetUrl}:`, error);
            } else {
                 console.log(`[Tab Blocker] Ignored error updating tab ${tabId} (likely closed): ${error.message}`);
            }
        }
    }
}

// Checks all currently open tabs when focus mode starts
async function checkExistingTabs() {
    if (!extensionIsEnabled || !currentFocusState) return; // Safety check

    console.log("[Tab Blocker] Focus mode started. Checking all existing tabs...");
    try {
        const tabs = await chrome.tabs.query({}); // Query all tabs
        console.log(`[Tab Blocker] Found ${tabs.length} tabs to check.`);
        for (const tab of tabs) {
            if (tab.id && tab.url) { // Ensure tab has ID and URL
                // Check and block, don't wait for each one to finish updating
                 checkAndBlockTabIfNeeded(tab.id, tab.url);
                 // Add a tiny delay to prevent overwhelming the browser/API if many tabs
                 await new Promise(resolve => setTimeout(resolve, 15));
            }
        }
        console.log("[Tab Blocker] Finished checking existing tabs.");
    } catch (error) {
        console.error("[Tab Blocker] Error querying or checking existing tabs:", error);
    }
}


// Schedules the next calendar check using chrome.alarms
function scheduleNextCheck() {
    if (!extensionIsEnabled) {
         console.log("Scheduling skipped: Extension is disabled.");
         chrome.alarms.clear(CALENDAR_CHECK_ALARM); // Ensure alarm is cleared if disabled
         return;
    }
    // Use 'periodInMinutes' for repeating alarm
    const period = 5; // Check every 5 minutes
    chrome.alarms.create(CALENDAR_CHECK_ALARM, {
        delayInMinutes: period, // Delay before the *first* run after this call
        periodInMinutes: period // Repeat interval
    });
    console.log(`Scheduled next calendar check alarm (runs in ${period} mins, repeats every ${period} mins).`);
}

// Updates the status text displayed in the browser action popup
function updatePopupState(statusText) {
    // Use local storage as it's faster for popup state
    chrome.storage.local.set({ extensionStatus: statusText }).catch(error => {
        console.warn("Error setting popup state:", error);
    });
    // Optionally: Update icon based on state (requires 'action' API)
    // Example: Change icon based on focus state
    // chrome.action.setIcon({ path: currentFocusState ? "icons/icon48_active.png" : "icons/icon48.png" });
}


// --- Main Calendar Checking and State Logic ---
async function checkCalendarAndSetBlocking() {
    console.log("--- Running CheckCalendarAndSetBlocking ---");

    // Ensure current enabled state is loaded
    await loadAndUpdateState(); // Reloads state including extensionIsEnabled

    if (!extensionIsEnabled) {
        console.log("Check skipped: Extension is disabled.");
        if (currentFocusState) { // If it *was* in focus, ensure cleanup
             console.log("Transitioning OUT OF focus due to disabling.");
             currentFocusState = false;
             await updateBlockingRules(false); // Remove DNR rules
             updatePopupState('Disabled');
        }
         // Ensure alarm is cleared if disabled here too
         chrome.alarms.clear(CALENDAR_CHECK_ALARM);
        return; // Stop processing if disabled
    }

     if (!redirectUrl) {
        console.warn("Redirect URL not set yet, cannot proceed with check.");
        return; // Cannot block tabs or set rules without it
    }

    let isInFocus = false; // Assume not in focus by default for this check cycle
    try {
        console.log('Checking authorization token...');
        const token = await getAuthToken(false); // false = don't prompt interactively

        if (!token) {
            console.warn('Auth token not available. Needs authorization.');
            if (currentFocusState) { // If it *was* in focus, transition out
                console.log("Transitioning OUT OF focus due to missing auth.");
                currentFocusState = false;
                await updateBlockingRules(false); // Remove DNR rules
            }
            updatePopupState('Auth Required');
            return; // Stop calendar check if not authorized
        }

        // Get focus keyword from storage for this check
        const { focusKeyword } = await chrome.storage.sync.get('focusKeyword');
        const keywordToCheck = focusKeyword || defaultFocusKeyword;

        // Check calendar API
        console.log('Checking Google Calendar...');
        isInFocus = await isCurrentlyInFocusEvent(token, keywordToCheck);

        // --- State Transition Logic ---
        if (isInFocus && !currentFocusState) {
            // === Transitioning INTO Focus ===
            console.log(">>> Transitioning INTO focus mode.");
            currentFocusState = true;
            updatePopupState('Focus Active');
            await updateBlockingRules(true); // Apply DNR rules FIRST
            await checkExistingTabs();       // THEN check/block currently open tabs
        } else if (!isInFocus && currentFocusState) {
            // === Transitioning OUT OF Focus ===
            console.log("<<< Transitioning OUT OF focus mode.");
            currentFocusState = false;
            updatePopupState('Focus Inactive');
            await updateBlockingRules(false); // Remove DNR rules
        } else if (isInFocus /* && currentFocusState */) {
            // === Still IN Focus ===
             console.log("--- Still IN focus mode.");
             updatePopupState('Focus Active'); // Keep popup state updated
             // Ensure rules are still applied (safety net)
             await updateBlockingRules(true);
             // Optional: Re-check active tab? Usually handled by listeners.
             // try {
             //    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
             //    if (activeTab?.id && activeTab?.url) {
             //       checkAndBlockTabIfNeeded(activeTab.id, activeTab.url);
             //    }
             // } catch(e) { console.warn("Error checking active tab:", e); }
        } else /* (!isInFocus && !currentFocusState) */ {
            // === Still OUT of Focus ===
             console.log("--- Still OUT of focus mode.");
             updatePopupState('Focus Inactive'); // Keep popup state updated
             // Ensure rules remain removed (safety net)
             await updateBlockingRules(false);
        }

    } catch (error) {
        console.error('!!! Error during main check cycle:', error);
        // On unexpected error, assume not in focus and try to clear rules
        if (currentFocusState) {
            currentFocusState = false;
            await updateBlockingRules(false); // Attempt cleanup
        }
        updatePopupState('Error');
    }
    // Note: scheduleNextCheck() is handled by the alarm's 'periodInMinutes' setting
    console.log("--- Finished CheckCalendarAndSetBlocking ---");
}


// --- Event Listeners ---

// Extension Installation/Update
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log(`Extension ${details.reason}.`);
    if (details.reason === 'install') {
        await chrome.storage.sync.set({
             // Save defaults (validation happens on load anyway)
            sitesConfig: defaultSitesConfigForBG,
            globalBlockMessage: defaultGlobalMessageForBG,
            focusKeyword: defaultFocusKeyword,
            isEnabled: true
        });
         console.log("Default settings applied.");
    }
    await loadAndUpdateState();
    setTimeout(checkCalendarAndSetBlocking, 2000);
    scheduleNextCheck();
});



// Alarm Listener (Triggers periodic checks)
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === CALENDAR_CHECK_ALARM) {
        console.log(`Alarm "${alarm.name}" triggered.`);
        checkCalendarAndSetBlocking();
    }
});

// Storage Change Listener (Reacts to settings changes)
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'sync') {
        console.log('Sync storage changed:', Object.keys(changes));
        let needsFullCheck = false;
        let configOrEnableChanged = false;

        // Check which settings changed
        if (changes.sitesConfig || changes.globalBlockMessage) {
            console.log('Site config or global message changed in storage.');
            configOrEnableChanged = true;
        }
        if (changes.focusKeyword) {
            console.log('Focus keyword changed in storage.');
            needsFullCheck = true; // Need to check calendar again with new keyword
        }
        if (changes.isEnabled !== undefined) {
             console.log('isEnabled changed in storage to:', changes.isEnabled.newValue);
             configOrEnableChanged = true; // Treat enable/disable like a config change for checks
        }

        // Reload state from storage to update global variables
        await loadAndUpdateState();

        // If disabled, ensure cleanup happens immediately
        if (!extensionIsEnabled) {
             console.log("Extension is now disabled. Cleaning up state.");
             if (currentFocusState) { // If was focused, transition out
                 currentFocusState = false;
                 await updateBlockingRules(false);
             }
             updatePopupState('Disabled');
             chrome.alarms.clear(CALENDAR_CHECK_ALARM); // Stop alarms
             return; // Don't proceed further if disabled
        } else if (changes.isEnabled?.newValue === true && changes.isEnabled?.oldValue === false) {
            // If just re-enabled, trigger a full check and reschedule alarm
            console.log("Extension re-enabled. Triggering check and rescheduling alarm.");
            needsFullCheck = true;
            scheduleNextCheck();
        }


        // If site config changed, or extension was enabled/disabled, update rules and check tabs
        if (configOrEnableChanged) {
             console.log("Config/Enable changed, updating DNR rules based on current focus state:", currentFocusState);
             await updateBlockingRules(currentFocusState); // Update DNR rules based on *current* focus state
             if (currentFocusState) {
                 console.log("Checking existing tabs due to config change while focus active.");
                 await checkExistingTabs(); // Re-check tabs if config changed while focus active
             }
        }

        // If keyword changed or just re-enabled, trigger a full calendar check
        if (needsFullCheck) {
            console.log('Triggering full re-check due to keyword change or re-enabling.');
            // Don't need to clear/reschedule alarm here, the check runs immediately,
            // and the periodic alarm continues unless the extension was disabled.
            checkCalendarAndSetBlocking();
        }
    }
});


// Tab Update Listener (URL change)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Check only when URL changes and focus mode is active and extension enabled
    // Use changeInfo.url as it's the most reliable indicator of the *new* URL
    if (extensionIsEnabled && currentFocusState && changeInfo.url) {
         // Avoid acting on sub-frame navigations if possible, though main_frame in DNR helps
         if (changeInfo.status === 'loading' || changeInfo.url !== tab.url) { // Check on loading or definite URL change
             console.log(`[Tab Listener] Tab updated: ${tabId}, New URL detected: ${changeInfo.url}`);
             checkAndBlockTabIfNeeded(tabId, changeInfo.url);
         }
    }
});

// Tab Activation Listener (Switching Tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (extensionIsEnabled && currentFocusState) {
        console.log(`[Tab Listener] Tab activated: ${activeInfo.tabId}`);
        try {
            // Get the details of the activated tab
            const tab = await chrome.tabs.get(activeInfo.tabId);
            if (tab && tab.url) {
                 // Check if the activated tab needs blocking
                checkAndBlockTabIfNeeded(tab.id, tab.url);
            }
        } catch (error) {
            // Handle cases where the tab might be closed before we get it, or permission errors
            if (!error.message.includes("No tab with id") && !error.message.includes("Cannot access") && !error.message.includes("Invalid tab ID")) {
                 console.warn(`[Tab Listener] Error getting activated tab ${activeInfo.tabId}:`, error);
            }
        }
    }
});

// Message Listener (e.g., from Options Page)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`Message received from ${sender.tab ? 'tab ' + sender.tab.id : 'extension'}:`, request);
    if (request.action === "settingsUpdated") {
        console.log("Received 'settingsUpdated' message. Triggering state reload and check.");
        // Reload state immediately and trigger a check
        loadAndUpdateState().then(() => {
            checkCalendarAndSetBlocking();
        });
        // Indicate async response possible, though we don't send one here
        return true;
    }
     // Respond to request for auth status from options page
     if (request.action === "getAuthStatus") {
         getAuthToken(false).then(token => {
             sendResponse({ isAuthorized: !!token });
         });
         return true; // Indicate async response
     }
     // Respond to request from options page to trigger manual check
     if (request.action === "triggerManualCheck") {
          console.log("Manual check triggered via message.");
          checkCalendarAndSetBlocking().then(() => {
                sendResponse({ status: "Check initiated." });
          }).catch(e => {
                 sendResponse({ status: "Check failed.", error: e.message });
          });
          return true; // Indicate async response
     }

     // Default: Ignore unknown messages
     console.log("Unknown message action:", request.action);
     // Return false or undefined if not handling the message or not responding async
});


// --- Initial Load ---
console.log("Background script executing/restarting.");
// Load state when the script starts (essential for service workers)
loadAndUpdateState().then(() => {
     // After loading state, set up the initial check and alarm if not already handled by onInstalled
     // Check if an alarm already exists
     chrome.alarms.get(CALENDAR_CHECK_ALARM, (existingAlarm) => {
         if (!existingAlarm) {
             console.log("No existing alarm found on startup. Scheduling initial check and alarm.");
             setTimeout(checkCalendarAndSetBlocking, 3000); // Initial check after startup
             scheduleNextCheck(); // Setup repeating alarm
         } else {
              console.log("Alarm already exists on startup. Performing immediate check.");
              // Alarm exists, perhaps run an immediate check anyway to ensure state is correct
              setTimeout(checkCalendarAndSetBlocking, 1000);
         }
     });

});