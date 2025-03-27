// popup.js
const statusDiv = document.getElementById('status');
const remainingTimeDiv = document.getElementById('remaining-time');
const optionsBtn = document.getElementById('options-btn');
const start30Btn = document.getElementById('start-30');
const start60Btn = document.getElementById('start-60');
const stopManualBtn = document.getElementById('stop-manual');
const manualControlsDiv = document.getElementById('manual-controls'); // For hiding start buttons

let intervalId = null; // To update remaining time display

function formatTime(milliseconds) {
    if (milliseconds <= 0) return "00:00";
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updatePopupDisplay(statusData) {
    statusDiv.textContent = statusData.extensionStatus || 'Initializing...';
    remainingTimeDiv.textContent = ''; // Clear previous remaining time

    // Clear existing interval if running
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }

    if (statusData.manualFocusEndTime && statusData.manualFocusEndTime > Date.now()) {
        // Manual focus is active
        const endTime = statusData.manualFocusEndTime;
        const updateRemaining = () => {
            const remainingMs = endTime - Date.now();
            if (remainingMs > 0) {
                remainingTimeDiv.textContent = `Manual focus ends in: ${formatTime(remainingMs)}`;
            } else {
                remainingTimeDiv.textContent = 'Manual focus ending...';
                clearInterval(intervalId);
                intervalId = null;
                // Optionally force a status refresh after a short delay
                setTimeout(requestStatusUpdate, 1500);
            }
        };
        updateRemaining(); // Update immediately
        intervalId = setInterval(updateRemaining, 1000); // Update every second

        // Adjust UI elements
        statusDiv.textContent = 'Manual Focus Active'; // More specific status
        start30Btn.style.display = 'none';
        start60Btn.style.display = 'none';
        stopManualBtn.style.display = 'block';
    } else {
        // Not in manual focus mode (could be calendar focus or inactive)
        start30Btn.style.display = 'block';
        start60Btn.style.display = 'block';
        stopManualBtn.style.display = 'none';

        // If status indicates calendar focus, keep that text
        if (!statusData.extensionStatus?.includes("Manual")) {
             statusDiv.textContent = statusData.extensionStatus || 'Initializing...';
        } else {
            // If manual just ended, status might still be cached, show inactive temporarily
            statusDiv.textContent = statusData.extensionStatus === 'Disabled' ? 'Disabled' : 'Focus Inactive';
        }
    }

     // Disable start buttons if *any* focus (manual or calendar) is active or if disabled
     const focusActive = statusData.extensionStatus?.includes("Focus Active");
     const isDisabled = statusData.extensionStatus === 'Disabled';
     start30Btn.disabled = focusActive || isDisabled;
     start60Btn.disabled = focusActive || isDisabled;
     stopManualBtn.disabled = isDisabled; // Keep stop enabled unless fully disabled

}

function requestStatusUpdate() {
    // Get combined status from background
    chrome.runtime.sendMessage({ action: "getPopupStatus" }, (response) => {
        if (chrome.runtime.lastError) {
            console.warn("Error getting popup status:", chrome.runtime.lastError.message);
            statusDiv.textContent = "Error";
            remainingTimeDiv.textContent = "";
            if (intervalId) clearInterval(intervalId);
        } else if (response) {
            updatePopupDisplay(response);
        } else {
             statusDiv.textContent = "Unavailable"; // Background might be restarting
             remainingTimeDiv.textContent = "";
             if (intervalId) clearInterval(intervalId);
        }
    });
}

// --- Event Listeners ---
optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

start30Btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "startManualFocus", duration: 30 }, requestStatusUpdate);
    statusDiv.textContent = 'Starting focus...'; // Immediate feedback
    if (intervalId) clearInterval(intervalId);
});

start60Btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "startManualFocus", duration: 60 }, requestStatusUpdate);
    statusDiv.textContent = 'Starting focus...'; // Immediate feedback
    if (intervalId) clearInterval(intervalId);
});

stopManualBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "stopManualFocus" }, requestStatusUpdate);
    statusDiv.textContent = 'Stopping focus...'; // Immediate feedback
    if (intervalId) clearInterval(intervalId);
});

// Update status when popup is opened
document.addEventListener('DOMContentLoaded', requestStatusUpdate);

// Listen for storage changes to update live if popup stays open
chrome.storage.onChanged.addListener((changes, namespace) => {
    // Listen for changes in local storage where status/manual time are kept
    if (namespace === 'local' && (changes.extensionStatus || changes.manualFocusEndTime)) {
        console.log("Storage changed, requesting status update.");
        requestStatusUpdate();
    }
});

// Clear interval when popup closes
window.addEventListener('unload', () => {
    if (intervalId) {
        clearInterval(intervalId);
    }
});