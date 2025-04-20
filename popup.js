// popup.js
const statusDiv = document.getElementById('status');
const timerInfoDiv = document.getElementById('timer-info'); // Renamed from remaining-time
const exceptionInfoDiv = document.getElementById('exception-info');
const exceptionBtn = document.getElementById('exception-btn');
const optionsBtn = document.getElementById('options-btn');
const start30Btn = document.getElementById('start-30');
const start60Btn = document.getElementById('start-60');
const stopManualBtn = document.getElementById('stop-manual');
const manualControlsDiv = document.getElementById('manual-controls'); // For hiding start buttons


let timerIntervalId = null; // To update remaining time display

function formatMinutes(milliseconds) {
    if (milliseconds <= 0) return "0";
    return Math.floor(milliseconds / (60 * 1000));
}


function formatTime(milliseconds) {
    if (milliseconds <= 0) return "00:00";
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
function updatePopupDisplay(statusData) {
    statusDiv.textContent = statusData.extensionStatus || 'Initializing...';
    timerInfoDiv.textContent = ''; // Clear previous timer info
    exceptionInfoDiv.textContent = ''; // Clear previous exception info
    exceptionBtn.disabled = true; // Default to disabled

    // Clear existing timer interval if running
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }

    const now = Date.now();
    const isFocusActive = statusData.extensionStatus?.includes("Focus Active"); // Generic check
    const isManualActive = statusData.manualFocusEndTime && statusData.manualFocusEndTime > now;
    const isExceptionActive = statusData.exceptionEndTime && statusData.exceptionEndTime > now;
    const isDisabled = statusData.extensionStatus === 'Disabled';

    // --- Display Active Timers (Manual or Exception) ---
    let activeEndTime = null;
    let timerLabel = '';

    if (isExceptionActive) {
        activeEndTime = statusData.exceptionEndTime;
        timerLabel = 'Exception active until:';
        statusDiv.textContent = "Exception Active"; // Override main status
    } else if (isManualActive) {
        activeEndTime = statusData.manualFocusEndTime;
        timerLabel = 'Manual focus ends in:';
        // Status is likely already "Focus Active (Manual)"
    }

    if (activeEndTime) {
        const updateRemaining = () => {
            const remainingMs = activeEndTime - now;
            if (remainingMs > 0) {
                timerInfoDiv.textContent = `${timerLabel} ${formatTime(remainingMs)}`;
            } else {
                timerInfoDiv.textContent = isExceptionActive ? 'Exception ending...' : 'Manual focus ending...';
                clearInterval(timerIntervalId);
                timerIntervalId = null;
                setTimeout(requestStatusUpdate, 1500); // Refresh status after end
            }
        };
        updateRemaining();
        timerIntervalId = setInterval(updateRemaining, 1000);
    }

    // --- Display Daily Exception Info ---
    const remainingDailyMs = statusData.availableExceptionMs || 0;
    exceptionInfoDiv.textContent = `Daily Exception Remaining: ${formatMinutes(remainingDailyMs)} min`;

    // --- Control Button States ---
    if (isDisabled) {
        start30Btn.style.display = 'block'; // Show but disabled
        start60Btn.style.display = 'block';
        stopManualBtn.style.display = 'none';
        start30Btn.disabled = true;
        start60Btn.disabled = true;
        stopManualBtn.disabled = true;
        exceptionBtn.disabled = true;
    } else if (isExceptionActive) {
        // Exception active: disable start, stop, and exception buttons
        start30Btn.style.display = 'none';
        start60Btn.style.display = 'none';
        stopManualBtn.style.display = 'none'; // Cannot stop manual during exception? Or should it stop both? Let's hide for now.
        exceptionBtn.disabled = true;
        exceptionBtn.textContent = "Exception Active";
    } else if (isManualActive) {
        // Manual active: hide start, show stop, disable exception (if no time or already focused)
        start30Btn.style.display = 'none';
        start60Btn.style.display = 'none';
        stopManualBtn.style.display = 'block';
        stopManualBtn.disabled = false;
        exceptionBtn.disabled = remainingDailyMs <= 0; // Can use exception during manual focus if time available
        exceptionBtn.textContent = remainingDailyMs > 0 ? "Use Exception Time" : "No Exception Time Left";
    } else if (isFocusActive) { // Calendar focus is active
        start30Btn.style.display = 'block'; // Show but disable manual start
        start60Btn.style.display = 'block';
        start30Btn.disabled = true;
        start60Btn.disabled = true;
        stopManualBtn.style.display = 'none';
        exceptionBtn.disabled = remainingDailyMs <= 0; // Enable exception if time available
        exceptionBtn.textContent = remainingDailyMs > 0 ? "Use Exception Time" : "No Exception Time Left";
    } else { // Inactive
        start30Btn.style.display = 'block';
        start60Btn.style.display = 'block';
        start30Btn.disabled = false;
        start60Btn.disabled = false;
        stopManualBtn.style.display = 'none';
        exceptionBtn.disabled = true; // Cannot use exception if focus isn't active
        exceptionBtn.textContent = "Use Exception Time";
    }
}



function requestStatusUpdate() {
    chrome.runtime.sendMessage({ action: "getPopupStatus" }, (response) => {
        if (chrome.runtime.lastError || !response) {
            console.warn("Error getting popup status:", chrome.runtime.lastError?.message);
            statusDiv.textContent = "Error";
            timerInfoDiv.textContent = "";
            exceptionInfoDiv.textContent = "";
             if (timerIntervalId) clearInterval(timerIntervalId);
        } else {
            updatePopupDisplay(response);
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
    if (timerIntervalId) clearInterval(timerIntervalId);
});

start60Btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "startManualFocus", duration: 60 }, requestStatusUpdate);
    statusDiv.textContent = 'Starting focus...'; // Immediate feedback
    if (timerIntervalId) clearInterval(timerIntervalId);
});

stopManualBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "stopManualFocus" }, requestStatusUpdate);
    statusDiv.textContent = 'Stopping focus...'; // Immediate feedback
    if (timerIntervalId) clearInterval(timerIntervalId);
});

exceptionBtn.addEventListener('click', () => {
    exceptionBtn.disabled = true; // Disable immediately
    exceptionBtn.textContent = 'Starting Exception...';
    chrome.runtime.sendMessage({ action: "startException" }, requestStatusUpdate); // Ask background to start
     if (timerIntervalId) clearInterval(timerIntervalId);
});

document.addEventListener('DOMContentLoaded', requestStatusUpdate);

// Listen for local storage changes (status, manual time, exception time)
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && (changes.extensionStatus || changes.manualFocusEndTime || changes.exceptionEndTime)) {
        console.log("Local Storage changed relevant to popup, requesting status update.");
        requestStatusUpdate();
    }
});


// Clear interval when popup closes
window.addEventListener('unload', () => {
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
    }
});