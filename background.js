// background.js
import * as constants from './constants.js';
// Import state functions for manual focus time
import { getBlockedTabs, removeBlockedTab, clearBlockedTabs, loadStateFromStorage, initializeSettings, getManualFocusEndTime, setManualFocusEndTime, clearManualFocusEndTime, updatePopupState } from './state.js';
import { getAuthToken, removeCachedAuthToken } from './auth.js';
import { getActiveFocusProfileName } from './calendar.js';
import { updateBlockingRules } from './blocking.js';
import { checkAndBlockTabIfNeeded, checkExistingTabs } from './tabs.js';

// --- Global State ---
// currentFocusState useful for quick checks in listeners & transition logic
let currentFocusState = false;
let currentActiveProfileName = null; // Track the currently active profile name

// --- Helper function to restore tabs ---
async function restoreBlockedTabs() {
    console.log("Attempting to restore blocked tabs...");
    const map = await getBlockedTabs();
    const tabsToRestore = Object.entries(map); // [ [tabId, url], ... ]
    let restoredCount = 0;

    if (tabsToRestore.length === 0) {
        console.log("No tabs found in the blocked map.");
        return;
    }

    const baseRedirectUrl = chrome.runtime.getURL('blocked.html').split('?')[0];

    for (const [tabIdStr, originalUrl] of tabsToRestore) {
        const tabId = parseInt(tabIdStr, 10);
        if (isNaN(tabId)) continue;

        try {
            const tab = await chrome.tabs.get(tabId);
            // Check if tab still exists AND is *currently* on our block page
            if (tab && tab.url && tab.url.startsWith(baseRedirectUrl)) {
                console.log(`Restoring tab ${tabId} to ${originalUrl}`);
                await chrome.tabs.update(tabId, { url: originalUrl });
                restoredCount++;
            } else {
                 // Tab doesn't exist or navigated away - remove from map implicitly later
                 console.log(`Skipping restore for tab ${tabId}: Not found or not on block page.`);
            }
        } catch (error) {
            // Tab likely closed, ignore "No tab with id" error
            if (!error.message.includes("No tab with id")) {
                 console.warn(`Error restoring tab ${tabId}:`, error);
            }
        }
    }
    console.log(`Finished restoring tabs. Attempted: ${tabsToRestore.length}, Actually Restored: ${restoredCount}`);
    // Clear the map AFTER attempting restoration
    await clearBlockedTabs();
}


// --- Alarm & Focus Management Functions ---

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


/** Creates the alarm to end manual focus */
function createManualEndAlarm(endTime) {
    if (endTime && endTime > Date.now()) {
        chrome.alarms.create(constants.MANUAL_FOCUS_END_ALARM, { when: endTime });
        console.log("Manual focus end alarm created for:", new Date(endTime));
    } else {
        console.warn("Attempted to create manual end alarm with invalid time:", endTime);
    }
}

/** Clears the manual focus end alarm */
async function clearManualEndAlarm() {
    await chrome.alarms.clear(constants.MANUAL_FOCUS_END_ALARM);
    console.log("Cleared manual focus end alarm.");
}

/** Starts a manual focus session */
async function startManualFocus(durationMinutes) {
    console.log(`Attempting to start manual focus for ${durationMinutes} minutes.`);

    // 1. Check if extension is enabled
    const syncState = await chrome.storage.sync.get('isEnabled');
    const isEnabled = syncState.isEnabled === undefined ? true : syncState.isEnabled;
    if (!isEnabled) {
        console.warn("Manual focus start ignored: Extension is disabled.");
        updatePopupState('Disabled'); // Update status
        return;
    }

    // 2. Check if already in focus (manual or calendar)
    const activeManualEndTime = await getManualFocusEndTime();
    if (currentFocusState || activeManualEndTime) {
        console.warn("Manual focus start ignored: Already in a focus session.");
        // Re-fetch status to ensure popup is accurate
        const status = await chrome.storage.local.get(['extensionStatus', constants.MANUAL_FOCUS_END_TIME_KEY]);
        updatePopupState(status.extensionStatus || 'Focus Active', status[constants.MANUAL_FOCUS_END_TIME_KEY] || null);
        return;
    }

    // 3. Calculate end time and store it
    const now = Date.now();
    const endTime = now + durationMinutes * 60 * 1000;
    await setManualFocusEndTime(endTime);

    console.log(">>> Starting MANUAL focus mode.");
    const state = await loadStateFromStorage(); // Get all configs

    // Filter rules specifically for "Manual" profile
    const manualProfileName = "Manual"; // Assuming this exists in profilesConfig
    const rulesForManual = state.processedSitesConfig.filter(rule =>
        rule.profiles.includes(manualProfileName)
    );
    console.log(`Applying ${rulesForManual.length} rules for profile: "${manualProfileName}"`);

    try {
        await updateBlockingRules(true, rulesForManual, state.globalBlockMessage, state.redirectUrl); // Apply manual rules
        currentActiveProfileName = manualProfileName; // Set active profile
        currentFocusState = true;
        updatePopupState(`Focus Active (Manual)`, endTime);
        await checkExistingTabs(rulesForManual, state.globalBlockMessage, state.redirectUrl); // Check tabs with manual rules
        createManualEndAlarm(endTime);
    } catch (error) {
        console.error("!!! Error starting manual focus:", error);
        updatePopupState('Error starting focus');
        await clearManualFocusEndTime(); // Clean up stored time on error
        currentFocusState = false; // Reset focus state
        // Attempt to clear rules as well
        try { await updateBlockingRules(false, [], '', null); } catch (e) { console.warn("Error cleaning up rules after failed manual start:", e); }
    }
}

/** Stops the current manual focus session */
async function stopManualFocus() {
    console.log("Attempting to stop manual focus.");
    const manualEndTime = await getManualFocusEndTime();
    if (!manualEndTime) {
        console.log("Stop manual focus ignored: Not in manual focus mode.");
        return; // Not in manual focus
    }

    console.log("<<< Stopping MANUAL focus mode.");
    await clearManualEndAlarm();
    await clearManualFocusEndTime();

    console.log("<<< Stopping MANUAL focus mode.");
    currentActiveProfileName = null; // Clear active profile BEFORE check

    try {
        await updateBlockingRules(false, [], '', null); // Clear rules first
        currentFocusState = false;
        updatePopupState('Focus Inactive', null);
        await restoreBlockedTabs();

        console.log("Triggering calendar check after stopping manual focus.");
        checkCalendarAndSetBlocking(); // Check if calendar should take over
    } catch (error) {
        console.error("!!! Error stopping manual focus:", error);
        updatePopupState('Error stopping focus', null); // Keep end time null
        currentFocusState = false; // Still assume focus stopped despite error
    }
}


// --- Main Calendar Checking and State Logic (Modified) ---
async function checkCalendarAndSetBlocking() {
    console.log("--- Running Check Check ---");
    let state = await loadStateFromStorage(); // Contains profilesConfig and processedSitesConfig
    let manualEndTime = await getManualFocusEndTime();
    let activeProfileName = null; // Profile for *this* check cycle
    let rulesForProfile = [];

    try {
        // 1. Check Manual Focus Override
        if (manualEndTime) {
            console.log("Manual focus session is active.");
            activeProfileName = "Manual"; // Assign special name
        }
        // 2. Check Calendar (only if manual is not active)
        else if (state.isEnabled) {
            const token = await getAuthToken(false);
            if (token) {
                activeProfileName = await getActiveFocusProfileName(token, state.profilesConfig);
            } else {
                console.warn('Auth token not available. Needs authorization.');
                if (currentActiveProfileName) { // Must have been calendar focus
                   console.log("Transitioning OUT OF focus due to missing auth.");
                   await updateBlockingRules(false, [], '', null);
                   currentFocusState = false;
                   await restoreBlockedTabs(); // Attempt restore on error exit
                   currentActiveProfileName = null; // Reset active profile
                }
                updatePopupState('Auth Required', null);
                // Don't clear calendar alarm, user might authorize soon
                return; // Stop calendar check
            }
        }

        // --- Proceed with Calendar Check (if not in manual focus) ---
        if (!state.isEnabled) {
            activeProfileName = null; // Ensure no profile is active if disabled
            console.log("Check skipped: Extension is disabled.");
            if (currentFocusState) { // If it *was* in focus (must have been calendar)
                console.log("Transitioning OUT OF focus due to disabling.");
                await updateBlockingRules(false, [], '', null);
                currentFocusState = false;
                await restoreBlockedTabs(); // Attempt restore on error exit
            }
            updatePopupState('Disabled', null); // Ensure manual time is null
            clearAlarm(); // Clear calendar alarm
            await clearManualEndAlarm(); // Also clear manual just in case
            return;
        }

        // 4. Filter rules for the determined active profile
        if (activeProfileName) {
            rulesForProfile = state.processedSitesConfig.filter(rule =>
                rule.profiles.includes(activeProfileName)
            );
            console.log(`Found ${rulesForProfile.length} rules for active profile: "${activeProfileName}"`);
        } else {
            rulesForProfile = []; // No active profile, no rules apply
        }

        // 5. Compare with previous state and update DNR
        if (activeProfileName !== currentActiveProfileName) {
            console.log(`Profile changing from "${currentActiveProfileName}" to "${activeProfileName}"`);

            if (activeProfileName) { // Transitioning INTO a profile (or changing profile)
                    console.log(`>>> Activating profile: ${activeProfileName}`);
                    await updateBlockingRules(false, [], '', null);
                    currentFocusState = false;
                    await restoreBlockedTabs(); // Attempt restore on error exit
    
                    await updateBlockingRules(true, rulesForProfile, state.globalBlockMessage, state.redirectUrl); // Pass FILTERED rules
                    currentFocusState = true; // Still useful for simple checks
                    currentActiveProfileName = activeProfileName;
                    updatePopupState(`Focus Active (${activeProfileName})`, manualEndTime);
                    // Check tabs only when *starting* a focus session from inactive
                    await checkExistingTabs(rulesForProfile, state.globalBlockMessage, state.redirectUrl); // Pass FILTERED rules

            } else { // Transitioning OUT OF focus (activeProfileName is null)
                    console.log(`<<< Deactivating profile: ${currentActiveProfileName}`);
                    await updateBlockingRules(false, [], state.globalBlockMessage, state.redirectUrl); // Clear rules
                    currentFocusState = false;
                    currentActiveProfileName = null;
                    updatePopupState('Focus Inactive', null);
                    await restoreBlockedTabs();
            }
        } else if (activeProfileName) {
                // Still in the same profile, just ensure rules are up-to-date
                console.log(`--- Still in profile: ${activeProfileName}`);
                await updateBlockingRules(true, rulesForProfile, state.globalBlockMessage, state.redirectUrl); // Pass FILTERED rules
                updatePopupState(`Focus Active (${activeProfileName})`, manualEndTime);
                currentFocusState = true; // Ensure true
                await checkExistingTabs(rulesForProfile, state.globalBlockMessage, state.redirectUrl); // Pass FILTERED rules
        } else {
                // Still inactive
                console.log(`--- Still inactive`);
                if (currentFocusState) { // Safety check if state somehow got out of sync
                    await updateBlockingRules(false, [], state.globalBlockMessage, state.redirectUrl);
                    currentFocusState = false;
                    await restoreBlockedTabs(); // Attempt restore on error exit
                }
                updatePopupState('Focus Inactive', null);
        }

       

        if (!state.redirectUrl) {
            console.error("Redirect URL is not set. Cannot perform check.");
            updatePopupState('Error: Setup', null);
            return; // Cannot proceed
        }

    } catch (error) {
        console.error('!!! Error during main check cycle:', error);

        // Get manual end time again *inside* catch block in case it changed or initial read failed
        const currentManualEndTime = await getManualFocusEndTime();
        if (error.message.includes('Unauthorized') && token) {
            // Auth error from calendar check
            console.warn("Removing cached token due to 401 error during calendar check.");
            await removeCachedAuthToken(token); // Remove the bad token
            if (currentFocusState) { // Transition out of focus if needed (must be calendar focus here)
                await updateBlockingRules(false, [], '', null);
                currentFocusState = false;
                await restoreBlockedTabs(); // *** Attempt restore on error exit ***
            }
            updatePopupState('Auth Required', null); // Manual end time is null here
        } else if (error.message.includes('Rule Limit Exceeded')) {
             updatePopupState('Error: Rule Limit', currentManualEndTime); // Preserve manual time if relevant
             // Maybe disable extension or just stop blocking? For now, just log.
             console.error("Cannot enforce blocking due to rule limit.");
             if (currentFocusState) { // Ensure we transition *out* of a state we can't enforce
                 await updateBlockingRules(false, [], '', null);
                 currentFocusState = false;
                 await restoreBlockedTabs(); // *** Attempt restore on error exit ***
             }
        } else {
            // General error
            updatePopupState('Error', currentManualEndTime); // Preserve manual time if relevant
            // Assume not in focus on unexpected error and try to clear rules
            if (currentFocusState) {
                try { await updateBlockingRules(false, [], '', null); } catch (cleanupError) {console.warn("Error during cleanup rules on general error:", cleanupError);}
                currentFocusState = false;
                await restoreBlockedTabs(); // *** Attempt restore on error exit ***
            }
        }

        if (currentActiveProfileName) {
            await updateBlockingRules(false, [], state.globalBlockMessage, state.redirectUrl); // Clear rules
            await restoreBlockedTabs();
        }
        currentActiveProfileName = null;
        currentFocusState = false;
    }
    console.log("--- Finished CheckCalendarAndSetBlocking ---");
}


// --- Event Listeners ---

// Extension Installation/Update
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log(`Extension ${details.reason}.`);
    if (details.reason === 'install') {
        await initializeSettings(); // Set defaults
        await clearBlockedTabs(); // Clear any stale map data on first install
    }
    // Always run check on install/update after a short delay
    // The initial load logic below handles more specific startup scenarios now
    // setTimeout(checkCalendarAndSetBlocking, 2000);
    // scheduleNextCheck(); // Ensure alarm is set up
});

// Alarm Listener (Handles BOTH calendar and manual end alarms)
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === constants.CALENDAR_CHECK_ALARM) {
        console.log(`Alarm "${alarm.name}" triggered.`);
        checkCalendarAndSetBlocking();
    } else if (alarm.name === constants.MANUAL_FOCUS_END_ALARM) {
        console.log(`Alarm "${alarm.name}" triggered.`);
        // Manual focus should end now
        stopManualFocus(); // Call the stop function
    }
});

// Storage Change Listener (Restored Detail)
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace !== 'sync') return; // Only care about sync changes

    console.log('Sync storage changed:', Object.keys(changes));
    let needsFullCheck = false;

    // --- 1. Handle Disable Event Immediately ---
    if (changes.isEnabled !== undefined && changes.isEnabled.newValue === false) {
        console.log("Extension is now disabled via settings. Cleaning up immediately.");
        await clearManualEndAlarm();
        await clearManualFocusEndTime();
        if (currentActiveProfileName) { // Check if any profile was active
            await updateBlockingRules(false, [], '', null); // Remove rules
        }
        currentActiveProfileName = null; // Reset profile state
        currentFocusState = false; // Reset focus state flag
        updatePopupState('Disabled', null);
        clearAlarm(); // Clear calendar check alarm
        return; // Stop processing this change event further
    }

    // If we reach here, the extension is enabled or wasn't the setting that changed isEnabled to false.

    // --- 2. Handle Enable Event ---
    if (changes.isEnabled !== undefined && changes.isEnabled.newValue === true) {
        console.log("Extension re-enabled via settings.");
        needsFullCheck = true; // Need a full check to see if calendar focus should start
        scheduleNextCheck();   // Ensure calendar alarm is scheduled
    }

    // --- 3. Handle Profile or Site Config Changes (while enabled) ---
    let configChanged = false;
    if (changes.profilesConfig || changes.sitesConfig || changes.globalBlockMessage) {
        console.log('Profile/Site config or global message changed.');
        configChanged = true;
        needsFullCheck = true; // Config changes might affect keywords, rules etc.
    }

    if (configChanged) {
        // Load the *very latest* state reflecting the changes
        const newState = await loadStateFromStorage();

        // If a profile is *currently* active, update rules/tabs immediately
        if (currentActiveProfileName && newState.isEnabled) { // Check isEnabled again just in case
            console.log(`Config changed while profile "${currentActiveProfileName}" is active. Updating rules/tabs now.`);

            // Filter the NEW rules for the CURRENTLY active profile
            const rulesForCurrentProfile = newState.processedSitesConfig.filter(rule =>
                rule.profiles.includes(currentActiveProfileName)
            );

            try {
                await updateBlockingRules(true, rulesForCurrentProfile, newState.globalBlockMessage, newState.redirectUrl);
                console.log("Checking existing tabs against new rules.");
                await checkExistingTabs(rulesForCurrentProfile, newState.globalBlockMessage, newState.redirectUrl); // Pass filtered rules
            } catch (error) {
                 console.error("Error immediately applying config changes:", error);
                 const currentManualEndTime = await getManualFocusEndTime(); // For popup state
                 if (error.message.includes('Rule Limit Exceeded')) {
                     updatePopupState('Error: Rule Limit', currentManualEndTime);
                     // Transition out of focus if rules can't be applied
                     await updateBlockingRules(false, [], '', null);
                     currentActiveProfileName = null;
                     currentFocusState = false;
                     await restoreBlockedTabs(); // Restore if forced out
                 } else {
                     updatePopupState('Error', currentManualEndTime);
                 }
                 // If rules failed, maybe skip the full check below? Or let it run to try again? Let it run for now.
            }
        }
    }

    // --- 4. Trigger Full Check if Needed ---
    if (needsFullCheck) {
        console.log('Triggering full state re-evaluation (checkCalendarAndSetBlocking).');
        // This ensures the correct profile is identified based on new keywords/time,
        // and the state machine handles transitions properly.
        checkCalendarAndSetBlocking();
    }
});


// Storage Change Listener (Reacts to settings changes from Options page or local state)
chrome.storage.onChanged.addListener(async (changes, namespace) => {

    // React to sync changes (settings)
    if (namespace === 'sync') {
        return; // Ignore sync changes for now
    }

    // React to local changes (popup state, manual focus time)
    if (namespace === 'local') {
        // This is mostly for logging or potential cross-component reaction
        if (changes[constants.MANUAL_FOCUS_END_TIME_KEY]) {
            const newTime = changes[constants.MANUAL_FOCUS_END_TIME_KEY].newValue;
            console.log("Manual focus end time changed in local storage:", newTime ? new Date(newTime) : 'Cleared');
            // The popup listener (`popup.js`) reacts to this visually.
            // Background logic reacts via alarms and direct checks.
        }
         if (changes.extensionStatus) {
             console.log("Extension status changed in local storage:", changes.extensionStatus.newValue);
         }
    }
});


// Tab Update Listener (for navigating away from block page)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only care about URL changes for existing tabs
    if (changeInfo.url) {
        const map = await getBlockedTabs();
        // If this tab *was* blocked...
        if (map[tabId]) {
            const baseRedirectUrl = chrome.runtime.getURL('blocked.html').split('?')[0];
            // ...but it navigated somewhere *else* (not just a parameter change on block page)
            if (!changeInfo.url.startsWith(baseRedirectUrl)) {
                console.log(`Tab ${tabId} navigated away from block page to ${changeInfo.url}. Removing from restore map.`);
                removeBlockedTab(tabId);
            }
        }
    }
    // Existing blocking logic for active focus sessions
    const manualEndTime = await getManualFocusEndTime();
    if ((currentFocusState || manualEndTime) && changeInfo.url && tab) { // Ensure tab exists
        const state = await loadStateFromStorage();
        if (state.isEnabled) {
            checkAndBlockTabIfNeeded(tabId, changeInfo.url, state.sitesConfig, state.globalBlockMessage, state.redirectUrl);
        }
    }
});

// Tab Closure Listener
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    // Remove the closed tab from our tracking map
    console.log(`Tab ${tabId} removed.`);
    removeBlockedTab(tabId);
});

// Tab Activation Listener (Switching Tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const manualEndTime = await getManualFocusEndTime(); // Check manual first
    if (currentFocusState || manualEndTime) { // Check if *any* focus is active
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
             // Ignore common errors if tab closed before get, or permissions issues
            if (!error.message.includes("No tab with id") && !error.message.includes("Cannot access") && !error.message.includes("Invalid tab ID")) {
                 console.warn(`[Tab Listener] Error getting/checking activated tab ${activeInfo.tabId}:`, error);
            }
        }
    }
});

// Message Listener (Updated)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`Message received from ${sender.id === chrome.runtime.id ? 'internally' : (sender.tab ? 'tab ' + sender.tab.id : 'extension')}:`, request);

    if (request.action === "startManualFocus" && request.duration) {
        startManualFocus(request.duration)
            .then(() => sendResponse({ success: true }))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true; // Indicate async response
    }
    if (request.action === "stopManualFocus") {
        stopManualFocus()
            .then(() => sendResponse({ success: true }))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true; // Indicate async response
    }
    // New handler to provide full status to popup
    if (request.action === "getPopupStatus") {
         Promise.all([
             chrome.storage.local.get(['extensionStatus', constants.MANUAL_FOCUS_END_TIME_KEY]),
             chrome.storage.sync.get('isEnabled') // Also check if enabled
         ]).then(([localData, syncData]) => {
             const isEnabled = syncData.isEnabled === undefined ? true : syncData.isEnabled;
             let status = localData.extensionStatus;
             // If disabled, override any other status
             if (!isEnabled) {
                 status = 'Disabled';
             }
             sendResponse({
                 extensionStatus: status,
                 manualFocusEndTime: localData[constants.MANUAL_FOCUS_END_TIME_KEY] || null
             });
         }).catch(error => {
              console.error("Error getting popup status:", error);
              sendResponse(null); // Indicate error to popup
         });
        return true; // Indicate async response
    }

    // Existing handlers
     if (request.action === "settingsUpdated") {
         console.log("Received 'settingsUpdated' message. Triggering state reload and check.");
         // Run checkCalendarAndSetBlocking to react to potential changes
         checkCalendarAndSetBlocking();
         // No response needed here, options page doesn't wait
         return false; // Indicate sync response or no response
     }
     if (request.action === "getAuthStatus") {
         getAuthToken(false).then(token => {
             sendResponse({ isAuthorized: !!token });
         });
         return true; // Indicate async response
     }
     if (request.action === "triggerManualCheck") {
          console.log("Manual check triggered via message.");
          checkCalendarAndSetBlocking().then(() => {
                sendResponse({ status: "Check initiated." });
          }).catch(e => {
                 sendResponse({ status: "Check failed.", error: e.message });
          });
          return true; // Indicate async response
     }
     if (request.action === "updateOptionsAuthStatus") {
         // Message sent *from* background *to* options. No response needed.
         console.log("Ignoring 'updateOptionsAuthStatus' received by background.");
         return false;
     }


    // Default: Ignore unknown messages
    console.log("Unknown message action:", request.action);
    return false; // Indicate sync response or no response needed
});


// --- Initial Load ---
console.log("Background script executing/restarting.");
// Perform initial check and set up alarms on startup
Promise.all([
    chrome.alarms.get(constants.CALENDAR_CHECK_ALARM),
    getManualFocusEndTime() // Check if manual focus should be active
]).then(async ([existingCalendarAlarm, manualEndTime]) => { // Make async for await inside
    const state = await loadStateFromStorage(); // Load state early for enable check

    if (!state.isEnabled) {
         console.log("Extension is disabled on startup. Clearing all alarms and state.");
         await clearManualEndAlarm();
         await clearManualFocusEndTime();
         await clearAlarm(); // Clear calendar alarm
         updatePopupState('Disabled', null);
         currentFocusState = false;
         // Ensure rules are cleared if somehow left over
         try { await updateBlockingRules(false, [], '', null); } catch(e) {}
         return; // Stop further startup logic if disabled
    }

    // If enabled, proceed with checking focus modes
    if (manualEndTime) {
        console.log("Manual focus session ongoing on startup. Ensuring state.");
        // Ensure focus is marked active, rules applied, and end alarm exists
        currentFocusState = true; // Assume focus is active
        createManualEndAlarm(manualEndTime); // Re-create alarm if needed
        // Trigger a check immediately to apply rules etc.
        setTimeout(checkCalendarAndSetBlocking, 1000);
         // No need to schedule calendar check yet, manual mode takes precedence
    } else {
         console.log("No manual focus session on startup.");
         currentFocusState = false; // Ensure focus starts as false if no manual session
         // Proceed with calendar alarm check
         if (!existingCalendarAlarm) {
             console.log("No existing calendar alarm found on startup. Scheduling initial check and alarm.");
             setTimeout(checkCalendarAndSetBlocking, 3000); // Initial check after startup delay
             scheduleNextCheck(); // Setup repeating calendar alarm
         } else {
             console.log("Calendar alarm already exists on startup. Performing immediate check.");
             // Alarm exists, run an immediate check anyway to ensure state is correct after potential SW restart
             setTimeout(checkCalendarAndSetBlocking, 1000);
             // No need to call scheduleNextCheck() again, the existing alarm handles repetition
         }
    }
}).catch(error => {
     console.error("Error during initial load checks:", error);
     // Fallback: try to run a check and schedule anyway? Risky if state is bad.
     // Maybe just log error and set state to Error?
     updatePopupState('Error on Startup', null);
     currentFocusState = false;
     // Attempt to schedule calendar check as a last resort
     // setTimeout(checkCalendarAndSetBlocking, 3000);
     // scheduleNextCheck();
});