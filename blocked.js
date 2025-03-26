// blocked.js
const messageElement = document.getElementById('block-message');
const fallbackMessage = 'This site is blocked during your scheduled focus time.';

try {
    // Get URL parameters
    const params = new URLSearchParams(window.location.search);
    const encodedMessage = params.get('message'); // Get the 'message' parameter

    if (encodedMessage) {
        // Decode and display the message from the URL
        const decodedMessage = decodeURIComponent(encodedMessage);
        messageElement.textContent = decodedMessage;
    } else {
        // If message parameter is missing, show fallback
        console.warn("Block page loaded without a 'message' URL parameter.");
        messageElement.textContent = fallbackMessage;
    }
} catch (error) {
    // Handle potential errors (e.g., URLSearchParams not supported - very unlikely)
    console.error("Error processing block page message:", error);
    messageElement.textContent = fallbackMessage; // Show fallback on error
}

// Optional: Add a title attribute for very long messages
if (messageElement.textContent.length > 150) { // Example threshold
    messageElement.title = messageElement.textContent;
}