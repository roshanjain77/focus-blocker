const statusDiv = document.getElementById('status');
const optionsBtn = document.getElementById('options-btn');

function updateStatus() {
    // Get status saved by background script
    chrome.storage.local.get('extensionStatus', (data) => {
        statusDiv.textContent = data.extensionStatus || 'Initializing...';
    });
}

optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

// Update status when popup is opened
document.addEventListener('DOMContentLoaded', updateStatus);

// Optional: Listen for storage changes to update live if popup stays open
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.extensionStatus) {
      updateStatus();
  }
});