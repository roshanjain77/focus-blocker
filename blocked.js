// blocked.js
const messageElement = document.getElementById('block-message');

chrome.storage.sync.get('customMessage', (data) => {
  if (data.customMessage && data.customMessage.trim() !== '') {
    // Use textContent to prevent potential HTML injection if message was manipulated
    messageElement.textContent = data.customMessage;
  } else {
    // Fallback message if none is set or it's empty
    messageElement.textContent = 'This site is blocked during your scheduled focus time.';
  }
}).catch(error => {
    // Handle potential errors fetching from storage
    console.error("Error loading custom message:", error);
    messageElement.textContent = 'This site is blocked. Error loading custom message.';
});