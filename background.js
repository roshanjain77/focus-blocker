// Constants
const CALENDAR_CHECK_ALARM = 'calendarCheckAlarm';
const RULE_PRIORITY = 1;
const FOCUS_RULE_ID_START = 1000;
const MAX_BLOCKED_SITES = 100; // Max rules allowed by DNR is higher, but keep this reasonable
const FOCUS_RULE_ID_END = FOCUS_RULE_ID_START + MAX_BLOCKED_SITES - 1;

// --- Global State (for quick access in listeners) ---
let currentFocusState = false;
let currentBlockedSites = []; // Store processed domains here
let redirectUrl = ''; // Cache the redirect URL

// Function to load initial state (sites and enabled status)
async function loadInitialState() {
    const data = await chrome.storage.sync.get(['blockedSites', 'isEnabled']);
    currentBlockedSites = (data.blockedSites || []).map(extractDomain).filter(Boolean); // Store processed domains
    const isEnabled = data.isEnabled === undefined ? true : data.isEnabled;
    // Initial focus state will be determined by the first checkCalendarAndSetBlocking call
    console.log("Initial state loaded. Enabled:", isEnabled, "Blocked domains:", currentBlockedSites);
    redirectUrl = chrome.runtime.getURL('blocked.html'); // Cache redirect URL
}

// --- Initialization ---
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('Calendar Focus Blocker installed/updated.', details.reason);
    // Set default settings on first install
    if (details.reason === 'install') {
        await chrome.storage.sync.set({
            blockedSites: ['youtube.com', 'facebook.com', 'twitter.com', 'reddit.com'],
            customMessage: 'This site is blocked during your scheduled focus time.',
            focusKeyword: '[Focus]',
            isEnabled: true // Default to enabled
        });
         console.log("Default settings applied.");
    }

    await loadInitialState(); // Load sites into memory
    scheduleNextCheck();
    // Perform initial check slightly delayed to ensure setup completes
    setTimeout(checkCalendarAndSetBlocking, 2000);
});

// --- Service Worker Startup Logic ---
// Load state whenever the service worker starts (might happen after inactivity)
loadInitialState();
// The initial check is also scheduled via onInstalled or the timeout below,
// but ensuring state is loaded early is good.
setTimeout(checkCalendarAndSetBlocking, 3000); // Also run check shortly after any SW restart

// --- Alarms ---
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === CALENDAR_CHECK_ALARM) {
        console.log('Alarm triggered: Checking calendar...');
        checkCalendarAndSetBlocking(); // This will also schedule the next check now
    }
});

function scheduleNextCheck() {
    // Clear previous alarm just in case
    chrome.alarms.clear(CALENDAR_CHECK_ALARM, (wasCleared) => {
         // Check every 5 minutes (adjust as needed) - Use periodsInMinutes for reliability
        chrome.alarms.create(CALENDAR_CHECK_ALARM, { periodInMinutes: 5 });
        console.log('Scheduled next calendar check (every 5 mins).');
    });
}

// --- Storage Changes ---
chrome.storage.onChanged.addListener((changes, namespace) => {
    let needsRecheck = false;
    if (namespace === 'sync') {
        console.log('Sync storage changed:', changes);
        if (changes.blockedSites) {
            currentBlockedSites = (changes.blockedSites.newValue || []).map(extractDomain).filter(Boolean);
            console.log("Updated global blocked sites:", currentBlockedSites);
            needsRecheck = true;
        }
        if (changes.focusKeyword) {
            needsRecheck = true;
        }
        if (changes.isEnabled !== undefined) {
             // If disabling, immediately clear focus state and rules
             if (!changes.isEnabled.newValue) {
                 currentFocusState = false;
                 updateBlockingRules(false); // Remove DNR rules
                 // No need to re-check calendar if disabled
             } else {
                 // If enabling, trigger a re-check
                 needsRecheck = true;
             }
        }
    }

    if (needsRecheck) {
        console.log('Relevant settings changed, re-evaluating blocking rules and tabs.');
        // Immediately re-check and update rules/tabs
        checkCalendarAndSetBlocking();
    }
});

// --- Tab Event Listeners ---

// On Tab Update (URL change)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Check only when URL changes and focus mode is active
    if (currentFocusState && changeInfo.url) {
         console.log(`Tab updated: ${tabId}, New URL: ${changeInfo.url}`);
         // Use the URL from changeInfo as it's the most recent
        checkAndBlockTabIfNeeded(tabId, changeInfo.url);
    }
});

// On Tab Activation (Switching Tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (currentFocusState) {
        console.log(`Tab activated: ${activeInfo.tabId}`);
        try {
            const tab = await chrome.tabs.get(activeInfo.tabId);
            if (tab && tab.url) {
                checkAndBlockTabIfNeeded(tab.id, tab.url);
            }
        } catch (error) {
            // Handle cases where the tab might be closed before we get it
            if (!error.message.includes("No tab with id")) {
                 console.warn(`Error getting activated tab ${activeInfo.tabId}:`, error);
            }
        }
    }
});

// --- Core Logic ---

// Helper to check a specific tab and block if needed
function checkAndBlockTabIfNeeded(tabId, url) {
    if (!url || !redirectUrl || url.startsWith(redirectUrl)) {
        return; // Ignore empty URLs, cases before redirect URL is set, or already blocked tabs
    }

    if (isUrlBlocked(url, currentBlockedSites)) {
        console.log(`BLOCKING Tab: ${tabId}, URL: ${url}`);
        chrome.tabs.update(tabId, { url: redirectUrl }).catch(error => {
             // Ignore errors trying to update already closed tabs etc.
            if (!error.message.includes("No tab with id") && !error.message.includes("Cannot access")) {
                console.error(`Error updating tab ${tabId} to ${redirectUrl}:`, error);
            }
        });
    }
}

// Helper to check existing tabs when focus starts
async function checkExistingTabs() {
    console.log("Focus mode started. Checking all existing tabs...");
    try {
        const tabs = await chrome.tabs.query({}); // Query all tabs
        for (const tab of tabs) {
            if (tab.id && tab.url) { // Ensure tab has ID and URL
                // Small delay to prevent overwhelming the browser/API? Maybe not needed.
                // await new Promise(resolve => setTimeout(resolve, 10));
                checkAndBlockTabIfNeeded(tab.id, tab.url);
            }
        }
        console.log("Finished checking existing tabs.");
    } catch (error) {
        console.error("Error querying or checking existing tabs:", error);
    }
}


async function checkCalendarAndSetBlocking() {
    const { isEnabled, focusKeyword } = await chrome.storage.sync.get(['isEnabled', 'focusKeyword']);

    if (isEnabled === undefined) {
        console.log("isEnabled status not yet determined, waiting for load/defaults.");
        return; // Should be loaded by initialState, but safety check
    }
     if (!redirectUrl) {
        console.log("Redirect URL not yet cached, waiting.");
        redirectUrl = chrome.runtime.getURL('blocked.html'); // Try caching again
        if (!redirectUrl) return;
    }

    // Always reschedule the next check *after* this one completes
    // Use a finally block to ensure it happens even on error
    let isInFocus = false; // Assume not in focus by default
    try {
        if (!isEnabled) {
            console.log('Extension is disabled.');
            if (currentFocusState) { // If it *was* in focus
                currentFocusState = false;
                await updateBlockingRules(false); // Ensure DNR rules are removed
                updatePopupState('Disabled');
            }
            return; // Stop here if disabled
        }

        console.log('Checking calendar for focus events...');
        const token = await getAuthToken(false); // false = don't prompt
        if (!token) {
            console.warn('Auth token not available. Needs authorization.');
            if (currentFocusState) { // If it *was* in focus
                currentFocusState = false;
                await updateBlockingRules(false);
            }
            updatePopupState('Auth Required');
            return;
        }

        // Get current focus status from Calendar
        isInFocus = await isCurrentlyInFocusEvent(token, focusKeyword || '[Focus]');

        // --- State Transition Logic ---
        if (isInFocus && !currentFocusState) {
            // === Transitioning INTO Focus ===
            currentFocusState = true;
            updatePopupState('Focus Active');
            console.log("Transitioning INTO focus mode.");
            await updateBlockingRules(true); // Apply DNR rules
            await checkExistingTabs();       // Check currently open tabs
        } else if (!isInFocus && currentFocusState) {
            // === Transitioning OUT OF Focus ===
            currentFocusState = false;
            updatePopupState('Focus Inactive');
            console.log("Transitioning OUT OF focus mode.");
            await updateBlockingRules(false); // Remove DNR rules
        } else if (isInFocus && currentFocusState) {
            // === Still IN Focus ===
            // Optional: Periodically check active tab as a fallback?
            // The onActivated listener is generally better for this.
            // If needed:
            // const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
            // if (activeTabs[0] && activeTabs[0].id && activeTabs[0].url) {
            //     checkAndBlockTabIfNeeded(activeTabs[0].id, activeTabs[0].url);
            // }
             console.log("Still in focus mode.");
             // Re-apply DNR rules just in case they were somehow cleared externally
             // (might be overkill, could be removed if performance is an issue)
             await updateBlockingRules(true);
        } else {
            // === Still OUT of Focus ===
             console.log("Still out of focus mode.");
             // Ensure DNR rules are removed (safety check)
             await updateBlockingRules(false);
        }

    } catch (error) {
        console.error('Error during calendar/blocking check:', error);
        // On error, assume not in focus and try to clear rules
        if (currentFocusState) {
            currentFocusState = false;
            await updateBlockingRules(false);
        }
        updatePopupState('Error');
    } finally {
        // Ensure next check is scheduled regardless of outcome (unless disabled)
        const currentIsEnabled = await chrome.storage.sync.get('isEnabled'); // Re-fetch in case it changed during async ops
        if (currentIsEnabled.isEnabled !== false) {
             scheduleNextCheck(); // Schedule the *next* check after this one finishes
        } else {
            console.log("Extension disabled, not scheduling next check.");
            chrome.alarms.clear(CALENDAR_CHECK_ALARM); // Explicitly clear alarm if disabled
        }
    }
}


async function getAuthToken(interactive) {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: interactive }, (token) => {
            if (chrome.runtime.lastError) {
                // Log specific errors but resolve null for flow control
                if (chrome.runtime.lastError.message.includes("OAuth2 not granted")) {
                   console.warn('getAuthToken: OAuth2 not granted or revoked.');
                } else {
                   console.error('getAuthToken Error:', chrome.runtime.lastError.message);
                }
                resolve(null);
            } else {
                resolve(token);
            }
        });
    });
}

async function isCurrentlyInFocusEvent(token, focusKeyword) {
    // (Keep this function as before - fetches events around 'now')
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 60 * 1000).toISOString(); // Check events starting very soon
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=10&q=${encodeURIComponent(focusKeyword)}`;

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
             if (response.status === 401) {
                chrome.identity.removeCachedAuthToken({ token: token }, () => {});
                console.warn('Received 401 Unauthorized. Token potentially expired/revoked.');
             } else if (response.status === 403) {
                 console.error(`Received 403 Forbidden. Ensure Google Calendar API is enabled in Cloud Console: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com`);
             }
             throw new Error(`Google Calendar API Error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            const currentTime = now.getTime();
            for (const event of data.items) {
                if (event.summary && event.summary.toLowerCase().includes(focusKeyword.toLowerCase())) {
                    const start = new Date(event.start.dateTime || event.start.date).getTime();
                    const end = new Date(event.end.dateTime || event.end.date).getTime();
                    if (currentTime >= start && currentTime < end) {
                        console.log(`Focus event found and active: "${event.summary}"`);
                        return true;
                    }
                }
            }
        }
        return false; // No active matching event found
    } catch (error) {
        console.error('Error fetching/processing calendar events:', error);
        return false; // Assume not in focus on error
    }
}

// --- Blocking Rules Management (DeclarativeNetRequest) ---
// (Keep the updateBlockingRules function using integer IDs as finalized before)
async function updateBlockingRules(shouldBlock) {
  const allSessionRules = await chrome.declarativeNetRequest.getSessionRules();
  const existingFocusRuleIds = allSessionRules
    .filter(rule => rule.id >= FOCUS_RULE_ID_START && rule.id <= FOCUS_RULE_ID_END)
    .map(rule => rule.id);

  const rulesToAdd = [];
  if (shouldBlock && currentBlockedSites.length > 0) { // Use cached/processed domains
    console.log('Setting up DNR rules for:', currentBlockedSites);

    currentBlockedSites.forEach((domain, index) => { // Iterate processed domains
      if (index >= MAX_BLOCKED_SITES) return; // Skip if exceeding limit
      const ruleId = FOCUS_RULE_ID_START + index;
      rulesToAdd.push({
        id: ruleId,
        priority: RULE_PRIORITY,
        action: { type: 'redirect', redirect: { url: redirectUrl } },
        condition: { urlFilter: `*://*.${domain}/*`, resourceTypes: ['main_frame'] }
      });
    });
  }

  // Apply changes
  console.log("DNR Rules to Add:", rulesToAdd.map(r => r.id));
  console.log("DNR Rule IDs to Remove:", existingFocusRuleIds);

  try {
     await chrome.declarativeNetRequest.updateSessionRules({
       removeRuleIds: existingFocusRuleIds,
       addRules: rulesToAdd
     });
     console.log('DNR blocking rules updated successfully.');
   } catch (error) {
     console.error('Failed to update DNR blocking rules:', error);
     if (error.message.includes('MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES')) {
         console.error("Exceeded the maximum number of DNR rules allowed by Chrome.");
     }
   }
}

// Helper to check if a URL matches the blocked list
function isUrlBlocked(url, blockedSiteDomains) {
    if (!url || !url.startsWith('http')) return false;
    try {
        const currentUrl = new URL(url);
        const currentHostname = currentUrl.hostname; // e.g., www.youtube.com or music.youtube.com
        for (const blockedDomain of blockedSiteDomains) {
            if (currentHostname === blockedDomain || currentHostname.endsWith('.' + blockedDomain)) {
                return true; // Matches domain or subdomain
            }
        }
    } catch (e) {
        // console.warn("Could not parse URL in isUrlBlocked:", url, e); // Can be noisy
        return false;
    }
    return false;
}


// Helper to extract main domain part for DNR rules and storage
function extractDomain(urlInput) {
    // (Keep this function as before)
    let domain = urlInput.trim();
    if (!domain) return null;
    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
        domain = 'http://' + domain;
    }
    try {
        const url = new URL(domain);
        let hostname = url.hostname;
        if (hostname.startsWith('www.')) {
            hostname = hostname.substring(4);
        }
        // We now store just the base domain (e.g., youtube.com)
        // Let's refine this slightly to handle cases like 'google.co.uk' correctly
        const parts = hostname.split('.');
        // Keep the last two parts generally, unless it's a known TLD structure like co.uk
        if (parts.length > 2 && ['co', 'com', 'org', 'net', 'gov', 'ac'].includes(parts[parts.length - 2])) {
             // Handle cases like 'co.uk', 'com.au' - keep 3 parts
             hostname = parts.slice(-3).join('.');
        } else if (parts.length > 1) {
             // Standard case like 'google.com', 'youtube.com' - keep 2 parts
             hostname = parts.slice(-2).join('.');
        } // If only one part or invalid, hostname remains as is or URL parse fails

        if (!hostname.includes('.')) return null; // Basic validation
        return hostname;
    } catch (e) {
        console.error(`Error parsing domain: ${urlInput}`, e);
        return null;
    }
}

// --- Popup State ---
function updatePopupState(statusText) {
    chrome.storage.local.set({ extensionStatus: statusText });
}