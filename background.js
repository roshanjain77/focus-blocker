// background.js
import * as constants from './constants.js';
import { loadStateFromStorage, updatePopupState, initializeSettings } from './state.js';
import { getAuthToken, removeCachedAuthToken } from './auth.js';
import { isCurrentlyInFocusEvent } from './calendar.js';
import { updateBlockingRules } from './blocking.js';
import { checkAndBlockTabIfNeeded, checkExistingTabs } from './tabs.js';

// --- Global State (Minimal, for tracking transitions) ---
let currentFocusState = false; // Is the extension currently believed to be in focus mode?

// --- Helper Functions ---

/** Schedules the next calendar check using chrome.alarms */
function scheduleNextCheck() {
    // Check enabled status directly from storage before scheduling
    chrome.storage.sync.get('isEnabled', ({ isEnabled }) => {
        const enabled = isEnabled === undefined ? true : isEnabled;
        if (!enabled) {
            console.log("Scheduling skipped: Extension is disabled.");
            chrome.alarms.clear(constants.CALENDAR_CHECK_ALARM); // Ensure alarm is cleared
            return;
        }
        // Use 'periodInMinutes' for repeating alarm
        chrome.alarms.create(constants.CALENDAR_CHECK_ALARM, {
            delayInMinutes: constants.CHECK_INTERVAL_MINUTES,
            periodInMinutes: constants.CHECK_INTERVAL_MINUTES
        });
        console.log(`Scheduled next calendar check alarm (runs/repeats every ${constants.CHECK_INTERVAL_MINUTES} mins).`);
    });
}

/** Clears the calendar check alarm */
function clearAlarm() {
    chrome.alarms.clear(constants.CALENDAR_CHECK_ALARM);
    console.log("Cleared calendar check alarm.");
}


// --- Main Calendar Checking and State Logic ---
async function checkCalendarAndSetBlocking() {
    console.log("--- Running CheckCalendarAndSetBlocking ---");

    let state;
    let token = null; // Declare token variable outside try block

    try {
        state = await loadStateFromStorage(); // Load current settings and state

        if (!state.isEnabled) {
            console.log("Check skipped: Extension is disabled.");
            if (currentFocusState) {
                console.log("Transitioning OUT OF focus due to disabling.");
                // Pass empty/null for cleanup - message/config not needed for removal
                await updateBlockingRules(false, [], '', null); // <-- Pass correct args for removal
                currentFocusState = false;
            }
            updatePopupState('Disabled');
            clearAlarm();
            return;
        }

        if (!state.redirectUrl) {
            console.error("Redirect URL is not set. Cannot perform check.");
            updatePopupState('Error: Setup');
            return; // Cannot proceed
        }

        console.log('Checking authorization token...');
        token = await getAuthToken(false); // false = don't prompt interactively

        if (!token) {
            console.warn('Auth token not available. Needs authorization.');
            if (currentFocusState) {
                await updateBlockingRules(false, [], '', null); // <-- Pass correct args for removal
                currentFocusState = false;
           }
           updatePopupState('Auth Required');
            // Don't clear alarm, maybe user will authorize soon
            return; // Stop calendar check
        }

        // Check calendar API
        console.log('Checking Google Calendar...');
        const isInFocus = await isCurrentlyInFocusEvent(token, state.focusKeyword);

        // --- State Transition Logic ---
        if (isInFocus && !currentFocusState) {
            console.log(">>> Transitioning INTO focus mode.");
            // *** Pass full state info for rule creation ***
            await updateBlockingRules(true, state.sitesConfig, state.globalBlockMessage, state.redirectUrl); // <-- UPDATED CALL
            currentFocusState = true;
            updatePopupState('Focus Active');
            await checkExistingTabs(state.sitesConfig, state.globalBlockMessage, state.redirectUrl);
        } else if (!isInFocus && currentFocusState) {
            console.log("<<< Transitioning OUT OF focus mode.");
             // Pass empty/null for cleanup
            await updateBlockingRules(false, [], '', null); // <-- Pass correct args for removal
            currentFocusState = false;
            updatePopupState('Focus Inactive');
        } else if (isInFocus /* && currentFocusState */) {
             console.log("--- Still IN focus mode.");
             updatePopupState('Focus Active');
             // Re-apply rules with full state info
             await updateBlockingRules(true, state.sitesConfig, state.globalBlockMessage, state.redirectUrl); // <-- UPDATED CALL
        } else /* (!isInFocus && !currentFocusState) */ {
             console.log("--- Still OUT of focus mode.");
             updatePopupState('Focus Inactive');
             // Ensure rules remain removed
             await updateBlockingRules(false, [], '', null); // <-- Pass correct args for removal
        }

    } catch (error) {
        console.error('!!! Error during main check cycle:', error);
        // Handle specific errors
        if (error.message.includes('Unauthorized') && token) {
            // Auth error from calendar check
            console.warn("Removing cached token due to 401 error during calendar check.");
            await removeCachedAuthToken(token); // Remove the bad token
            if (currentFocusState) { // Transition out of focus if needed
                await updateBlockingRules(false, [], '', null);
                currentFocusState = false;
            }
            updatePopupState('Auth Required');
        } else if (error.message.includes('Rule Limit Exceeded')) {
             updatePopupState('Error: Rule Limit');
             // Maybe disable extension or just stop blocking? For now, just log.
             console.error("Cannot enforce blocking due to rule limit.");
             if (currentFocusState) { // Ensure we transition *out* of a state we can't enforce
                 await updateBlockingRules(false, [], '', null);
                 currentFocusState = false;
             }
        } else {
            // General error
            updatePopupState('Error');
            // Assume not in focus on unexpected error and try to clear rules
            if (currentFocusState) {
                try { await updateBlockingRules(false, [], '', null); } catch (cleanupError) {/* ignore */}
                currentFocusState = false;
            }
        }
    }
    // Note: The repeating alarm handles rescheduling
    console.log("--- Finished CheckCalendarAndSetBlocking ---");
}


// --- Event Listeners ---

// Extension Installation/Update
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log(`Extension ${details.reason}.`);
    if (details.reason === 'install') {
        await initializeSettings(); // Set defaults
    }
    // Always run check on install/update after a short delay
    setTimeout(checkCalendarAndSetBlocking, 2000);
    scheduleNextCheck(); // Ensure alarm is set up
});

// Alarm Listener (Triggers periodic checks)
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === constants.CALENDAR_CHECK_ALARM) {
        console.log(`Alarm "${alarm.name}" triggered.`);
        checkCalendarAndSetBlocking();
    }
});

// Storage Change Listener (Reacts to settings changes from Options page)
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace !== 'sync') return;

    console.log('Sync storage changed:', Object.keys(changes));
    let needsFullCheck = false;
    let configOrEnableChanged = false;

    // Check if settings affecting blocking rules or checks were changed
    if (changes.sitesConfig || changes.globalBlockMessage || changes.focusKeyword || changes.isEnabled !== undefined) {
         // Reload state to get the *latest* values, including validation
         const newState = await loadStateFromStorage();

         if (changes.isEnabled !== undefined) {
             configOrEnableChanged = true;
             if (!newState.isEnabled) {
                 console.log("Extension is now disabled via settings. Cleaning up.");
                 if (currentFocusState) { // If was focused, transition out
                     await updateBlockingRules(false, [], null);
                     currentFocusState = false;
                 }
                 updatePopupState('Disabled');
                 clearAlarm(); // Stop alarms
                 return; // Don't proceed further
             } else {
                 // Just re-enabled
                 console.log("Extension re-enabled via settings.");
                 needsFullCheck = true; // Trigger full check
                 scheduleNextCheck(); // Ensure alarm is running
             }
         } else if (!newState.isEnabled) {
             // If other settings changed but extension is currently disabled, do nothing active
             console.log("Settings changed, but extension remains disabled.");
             return;
         }

         if (changes.sitesConfig || changes.globalBlockMessage) {
            console.log('Site config or global message changed.');
            configOrEnableChanged = true;
         }
         if (changes.focusKeyword) {
             console.log('Focus keyword changed.');
             needsFullCheck = true; // Need to check calendar again
         }


         if (configOrEnableChanged && newState.isEnabled) { // Check newState.isEnabled
            console.log("Config/Enable changed, updating rules for current focus state:", currentFocusState);
            try {
                 // *** Pass full state info for rule update ***
                 await updateBlockingRules(currentFocusState, newState.sitesConfig, newState.globalBlockMessage, newState.redirectUrl); // <-- UPDATED CALL
                 if (currentFocusState) {
                     console.log("Checking existing tabs due to config change while focus active.");
                     await checkExistingTabs(newState.sitesConfig, newState.globalBlockMessage, newState.redirectUrl);
                 }
            } catch (error) {
                 console.error("Error applying config changes:", error);
                 // Ensure cleanup call uses correct args
                 if (error.message.includes('Rule Limit Exceeded')) {
                     updatePopupState('Error: Rule Limit');
                     if(currentFocusState) {
                        await updateBlockingRules(false, [], '', null); // <-- Pass correct args for removal
                        currentFocusState = false;
                     }
                 } else {
                     updatePopupState('Error');
                 }
            }
        }


        // If keyword changed or just re-enabled, trigger a full calendar check immediately
        if (needsFullCheck) {
            console.log('Triggering full re-check due to keyword change or re-enabling.');
            checkCalendarAndSetBlocking();
        }
    }
});


// Tab Update Listener (URL change)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Check only when URL changes and focus mode is active
    // Use changeInfo.url as it's often the most reliable indicator of the *new* URL
    if (currentFocusState && changeInfo.url) {
        // Need current state for blocking check
        const state = await loadStateFromStorage();
        if (state.isEnabled) { // Double check enabled status
             // Avoid acting on sub-frame navigations if possible? DNR handles main_frame.
             // Check on loading or definite URL change
             // if (changeInfo.status === 'loading' || changeInfo.url !== tab.url) {
                 console.log(`[Tab Listener] Tab updated: ${tabId}, URL change detected: ${changeInfo.url}`);
                 checkAndBlockTabIfNeeded(tabId, changeInfo.url, state.sitesConfig, state.globalBlockMessage, state.redirectUrl);
             // }
        }
    }
});

// Tab Activation Listener (Switching Tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (currentFocusState) { // Only check if focus is active
        console.log(`[Tab Listener] Tab activated: ${activeInfo.tabId}`);
        try {
            // Get details of the activated tab
            const tab = await chrome.tabs.get(activeInfo.tabId);
             // Need current state for blocking check
            const state = await loadStateFromStorage();
            if (state.isEnabled && tab && tab.url) { // Ensure enabled and tab has URL
                checkAndBlockTabIfNeeded(tab.id, tab.url, state.sitesConfig, state.globalBlockMessage, state.redirectUrl);
            }
        } catch (error) {
             // Ignore errors if tab closed before get, or permissions issues
            if (!error.message.includes("No tab with id") && !error.message.includes("Cannot access") && !error.message.includes("Invalid tab ID")) {
                 console.warn(`[Tab Listener] Error getting/checking activated tab ${activeInfo.tabId}:`, error);
            }
        }
    }
});

// Message Listener (e.g., from Options Page)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`Message received from ${sender.id === chrome.runtime.id ? 'internally' : (sender.tab ? 'tab ' + sender.tab.id : 'extension')}:`, request);

    if (request.action === "settingsUpdated") {
        console.log("Received 'settingsUpdated' message. Triggering state reload and check.");
        // Reload state and trigger a check (storage listener also runs, but this ensures immediate action)
        checkCalendarAndSetBlocking();
        // No response needed here, options page doesn't wait
        return false;
    }
     // Respond to request for auth status (e.g., from options page)
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
     // Respond to request from options page to update auth status display
      if (request.action === "updateOptionsAuthStatus") {
          // This message is sent *from* background usually, but handle if options sends it too?
          console.log("Request received to have options page update its auth status display.");
          // The options page should have its own listener for this. Nothing to do here.
           return false;
      }


     // Default: Ignore unknown messages
     console.log("Unknown message action:", request.action);
     return false; // Indicate sync response or no response needed
});


// --- Initial Load ---
console.log("Background script executing/restarting.");
// Perform initial check and set up alarm on startup
chrome.alarms.get(constants.CALENDAR_CHECK_ALARM, (existingAlarm) => {
    if (!existingAlarm) {
        console.log("No existing alarm found on startup. Scheduling initial check and alarm.");
        setTimeout(checkCalendarAndSetBlocking, 3000); // Initial check after startup delay
        scheduleNextCheck(); // Setup repeating alarm
    } else {
         console.log("Alarm already exists on startup. Performing immediate check.");
         // Alarm exists, run an immediate check anyway to ensure state is correct after potential SW restart
         setTimeout(checkCalendarAndSetBlocking, 1000);
         // No need to call scheduleNextCheck() again, the existing alarm handles repetition
    }
});