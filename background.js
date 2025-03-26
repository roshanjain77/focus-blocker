// Constants
const CALENDAR_CHECK_ALARM = 'calendarCheckAlarm';
const FOCUS_RULE_ID_PREFIX = 'focusBlockRule_';
const RULE_PRIORITY = 1;

// --- Initialization ---
chrome.runtime.onInstalled.addListener(() => {
  console.log('Calendar Focus Blocker installed.');
  // Set default settings
  chrome.storage.sync.get(['blockedSites', 'customMessage', 'focusKeyword', 'isEnabled'], (data) => {
    chrome.storage.sync.set({
      blockedSites: data.blockedSites || ['youtube.com', 'facebook.com', 'twitter.com', 'reddit.com'],
      customMessage: data.customMessage || 'This site is blocked during your scheduled focus time.',
      focusKeyword: data.focusKeyword || '[Focus]',
      isEnabled: data.isEnabled === undefined ? true : data.isEnabled // Default to enabled
    });
  });

  // Create alarm for periodic checks
  scheduleNextCheck();

  // Perform initial check
  checkCalendarAndSetBlocking();
});

// --- Alarms ---
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === CALENDAR_CHECK_ALARM) {
    console.log('Alarm triggered: Checking calendar...');
    checkCalendarAndSetBlocking();
    scheduleNextCheck(); // Schedule the *next* check after this one runs
  }
});

function scheduleNextCheck() {
    // Check every 5 minutes (adjust as needed)
    chrome.alarms.create(CALENDAR_CHECK_ALARM, { delayInMinutes: 5 });
    console.log('Scheduled next calendar check.');
}


// --- Storage Changes ---
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    console.log('Settings changed, re-evaluating blocking rules.');
    // If relevant settings change, immediately re-check and update rules
    if (changes.blockedSites || changes.focusKeyword || changes.isEnabled) {
       // Clear any pending alarm and schedule an immediate check
       chrome.alarms.clear(CALENDAR_CHECK_ALARM, (wasCleared) => {
            checkCalendarAndSetBlocking();
            scheduleNextCheck(); // Reschedule future checks
       });
    }
  }
});

// --- Core Logic ---
async function checkCalendarAndSetBlocking() {
  const { isEnabled } = await chrome.storage.sync.get('isEnabled');
  if (!isEnabled) {
      console.log('Extension is disabled. Removing blocking rules.');
      await updateBlockingRules(false); // Ensure rules are removed if disabled
      return;
  }

  console.log('Checking calendar for focus events...');
  try {
    const token = await getAuthToken(false); // false = don't prompt user interactively
    if (!token) {
      console.warn('Authentication token not available. User might need to authorize.');
      await updateBlockingRules(false); // Ensure no blocking if not authenticated
      updatePopupState('Auth Required');
      return;
    }
    updatePopupState('Checking...');

    const { focusKeyword } = await chrome.storage.sync.get('focusKeyword');
    const isInFocus = await isCurrentlyInFocusEvent(token, focusKeyword || '[Focus]');

    await updateBlockingRules(isInFocus);
    updatePopupState(isInFocus ? 'Focus Active' : 'Focus Inactive');

  } catch (error) {
    console.error('Error checking calendar or setting rules:', error);
    // Potentially clear rules in case of error? Or leave existing ones? Let's clear.
    await updateBlockingRules(false);
    updatePopupState('Error');
  }
}

async function getAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: interactive }, (token) => {
      if (chrome.runtime.lastError) {
        console.error('getAuthToken Error:', chrome.runtime.lastError.message);
        resolve(null); // Resolve with null if error (e.g., user declined)
      } else {
        resolve(token);
      }
    });
  });
}

async function isCurrentlyInFocusEvent(token, focusKeyword) {
  const now = new Date();
  const timeMin = now.toISOString();
  // Check events starting within the next minute to catch events starting 'now'
  const timeMax = new Date(now.getTime() + 60 * 1000).toISOString();

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=10&q=${encodeURIComponent(focusKeyword)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
        if (response.status === 401) {
            // Token might be invalid/expired, try to remove it and prompt next time
            chrome.identity.removeCachedAuthToken({ token: token }, () => {});
            console.warn('Received 401 Unauthorized. Token might be expired.');
            throw new Error(`Google Calendar API Error: ${response.status} ${response.statusText}`);
        }
        throw new Error(`Google Calendar API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Fetched events:", data.items);

    if (data.items && data.items.length > 0) {
      const currentTime = now.getTime();
      for (const event of data.items) {
        // Check if the event summary explicitly contains the keyword (API 'q' param can be fuzzy)
        if (event.summary && event.summary.toLowerCase().includes(focusKeyword.toLowerCase())) {
           const start = new Date(event.start.dateTime || event.start.date).getTime(); // Handle all-day events slightly
           const end = new Date(event.end.dateTime || event.end.date).getTime();

           // Check if 'now' is within the event's time range
           if (currentTime >= start && currentTime < end) {
             console.log(`Focus event found and active: "${event.summary}"`);
             return true; // Currently in a focus event
           }
        }
      }
    }
    console.log('No active focus event found containing the keyword.');
    return false; // Not in a focus event
  } catch (error) {
    console.error('Error fetching or processing calendar events:', error);
    return false; // Assume not in focus mode on error
  }
}

// --- Blocking Rules Management ---

const FOCUS_RULE_ID_START = 1000;
const MAX_BLOCKED_SITES = 100; // Set a reasonable max for the range size
const FOCUS_RULE_ID_END = FOCUS_RULE_ID_START + MAX_BLOCKED_SITES - 1;

async function updateBlockingRules(shouldBlock) {
  // --- Get existing rules managed by this extension ---
  const allSessionRules = await chrome.declarativeNetRequest.getSessionRules();
  const existingFocusRuleIds = allSessionRules
    .filter(rule => rule.id >= FOCUS_RULE_ID_START && rule.id <= FOCUS_RULE_ID_END)
    .map(rule => rule.id);

  console.log("Existing Focus Rule IDs to remove:", existingFocusRuleIds);

  // --- Prepare rules to add (only if blocking is active) ---
  const rulesToAdd = [];
  if (shouldBlock) {
    const { blockedSites } = await chrome.storage.sync.get('blockedSites');

    if (blockedSites && blockedSites.length > 0) {
      console.log('Preparing blocking rules for:', blockedSites);
      const redirectUrl = chrome.runtime.getURL('blocked.html');

      blockedSites.forEach((site, index) => {
        if (index >= MAX_BLOCKED_SITES) {
            console.warn(`Maximum number of blocked sites (${MAX_BLOCKED_SITES}) exceeded. Skipping site: ${site}`);
            return;
        }

        const domain = extractDomain(site);
        if (domain) {
          const ruleId = FOCUS_RULE_ID_START + index; // Integer ID
          rulesToAdd.push({
            id: ruleId,
            priority: RULE_PRIORITY,
            action: { type: 'redirect', redirect: { url: redirectUrl } },
            condition: { urlFilter: `*://*.${domain}/*`, resourceTypes: ['main_frame'] }
          });
        } else {
          console.warn(`Could not parse domain from: ${site}`);
        }
      });
    } else {
        console.log('Focus mode active, but no sites listed to block.');
    }
  } else {
      console.log('Focus mode inactive. No rules will be added.');
  }

  // --- Apply the changes: Always remove all old ones, then add current ones ---
  console.log("Rules to Add:", rulesToAdd.map(r => r.id));
  console.log("Rule IDs to Remove:", existingFocusRuleIds);

  try {
     // *** CRITICAL CHANGE: Ensure removals happen before adds effectively ***
     // By passing both in one call, Chrome handles the atomicity.
     await chrome.declarativeNetRequest.updateSessionRules({
       removeRuleIds: existingFocusRuleIds, // Always list ALL existing rule IDs to be removed
       addRules: rulesToAdd               // Add the set of rules needed for the *current* state
     });
     console.log('Blocking rules updated successfully.');
   } catch (error) {
     // Catch potential errors, like exceeding rule limits
     console.error('Failed to update blocking rules:', error);
     // Consider adding fallback logic here if needed (e.g., logging, user notification)
     // Example: Check if error is related to rule count limit
     if (error.message.includes('MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES')) {
         console.error("Exceeded the maximum number of rules allowed by Chrome.");
         // Potentially notify the user or disable further rule additions
     }
   }
}

// (Keep your existing extractDomain function here)
function extractDomain(urlInput) {
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
        if (!hostname.includes('.')) return null;
        return hostname;
    } catch (e) {
        console.error(`Error parsing domain: ${urlInput}`, e);
        return null;
    }
}

// --- Popup State ---
function updatePopupState(statusText) {
  chrome.storage.local.set({ extensionStatus: statusText });
  // Optional: Update icon based on state (requires more complex icon handling)
}

// --- Initial Run ---
// Perform an initial check shortly after the background script starts
setTimeout(checkCalendarAndSetBlocking, 2000); // Delay slightly to allow setup