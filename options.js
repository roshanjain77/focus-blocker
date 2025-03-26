const enableToggle = document.getElementById('enable-toggle');
const focusKeywordInput = document.getElementById('focusKeyword');
const blockedSitesTextarea = document.getElementById('blockedSites');
const customMessageTextarea = document.getElementById('customMessage');
const saveButton = document.getElementById('save');
const statusDiv = document.getElementById('status');
const authorizeButton = document.getElementById('authorize');
const authStatusSpan = document.getElementById('auth-status');

// --- Authorization ---
function checkAuthStatus() {
    authStatusSpan.textContent = 'Checking...';
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError || !token) {
            authStatusSpan.textContent = 'Not Authorized';
            authStatusSpan.style.color = 'red';
            console.log('Not authorized:', chrome.runtime.lastError?.message);
        } else {
            authStatusSpan.textContent = 'Authorized';
            authStatusSpan.style.color = 'green';
             // Optional: Remove token if testing re-auth, then call checkAuthStatus() again
            // chrome.identity.removeCachedAuthToken({ token: token }, () => checkAuthStatus());
        }
    });
}

authorizeButton.addEventListener('click', () => {
    authStatusSpan.textContent = 'Authorizing...';
    // Request authorization interactively
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
            authStatusSpan.textContent = 'Authorization Failed/Declined';
            authStatusSpan.style.color = 'red';
            statusDiv.textContent = `Authorization error: ${chrome.runtime.lastError?.message}`;
        } else {
            authStatusSpan.textContent = 'Authorized Successfully!';
            authStatusSpan.style.color = 'green';
            statusDiv.textContent = 'Authorization successful. You might need to save settings again if you changed them.';
            // Maybe trigger a calendar check?
            // chrome.runtime.sendMessage({ action: "checkCalendar" }); // If needed
        }
    });
});


// --- Load Settings ---
function loadSettings() {
    chrome.storage.sync.get(['blockedSites', 'customMessage', 'focusKeyword', 'isEnabled'], (data) => {
        blockedSitesTextarea.value = (data.blockedSites || []).join('\n');
        customMessageTextarea.value = data.customMessage || '';
        focusKeywordInput.value = data.focusKeyword || '[Focus]';
        enableToggle.checked = data.isEnabled === undefined ? true : data.isEnabled; // Default true
    });
    checkAuthStatus(); // Check auth status on load
}

// --- Save Settings ---
saveButton.addEventListener('click', () => {
    const sites = blockedSitesTextarea.value.split('\n').map(s => s.trim()).filter(Boolean); // Trim whitespace and remove empty lines
    const message = customMessageTextarea.value;
    const keyword = focusKeywordInput.value.trim();
    const enabled = enableToggle.checked;

    chrome.storage.sync.set({
        blockedSites: sites,
        customMessage: message,
        focusKeyword: keyword,
        isEnabled: enabled
    }, () => {
        statusDiv.textContent = 'Settings saved successfully!';
        statusDiv.style.color = 'green';
        setTimeout(() => { statusDiv.textContent = ''; }, 3000);

        // Re-check auth status in case it changed somehow, though unlikely here
        checkAuthStatus();

         // Optionally tell background script to re-check immediately after saving
         chrome.alarms.clear('calendarCheckAlarm', (wasCleared) => {
            chrome.runtime.getBackgroundPage( backgroundPage => {
                if (backgroundPage && backgroundPage.checkCalendarAndSetBlocking) {
                    backgroundPage.checkCalendarAndSetBlocking();
                    backgroundPage.scheduleNextCheck(); // Make sure next check is scheduled
                } else {
                    console.warn("Could not directly call background functions. Relying on storage listener.");
                     // Force a reload/restart of the background script *if absolutely necessary*, but avoid this normally
                    // chrome.runtime.reload();
                }
            });
        });
    });
});

// --- Initialize ---
document.addEventListener('DOMContentLoaded', loadSettings);