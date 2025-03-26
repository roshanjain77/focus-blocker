// blocked.js
const messageContentElement = document.getElementById('message-content'); // Target the div
const fallbackHtml = '<h1>Site Blocked</h1><p>This site is blocked during your scheduled focus time.</p>';

try {
    const params = new URLSearchParams(window.location.search);
    const encodedMessage = params.get('message');

    let rawMessage = fallbackHtml; // Start with fallback

    if (encodedMessage) {
        try {
            // Decode the message from the URL
            const decoded = decodeURIComponent(encodedMessage);
            if (decoded.trim() !== '') {
                 rawMessage = decoded;
            } else {
                 console.warn("Decoded message is empty, using fallback.");
            }
        } catch (e) {
            console.error("Error decoding message from URL, using fallback.", e);
        }
    } else {
        console.warn("Block page loaded without 'message' URL parameter, using fallback.");
    }

    // *** SANITIZE and RENDER the HTML ***
    if (typeof DOMPurify !== 'undefined') {
        // Allow common formatting tags, explicitly forbid others if needed
        const cleanHtml = DOMPurify.sanitize(rawMessage, {
             USE_PROFILES: { html: true } // Use standard HTML profile
             // Optional: Fine-tune allowed tags/attributes if needed
             // ALLOWED_TAGS: ['p', 'b', 'i', 'u', 'strong', 'em', 'h1', 'h2', 'h3', 'br', 'a'],
             // ALLOWED_ATTR: ['href'] // Only allow href on <a> tags
        });
        messageContentElement.innerHTML = cleanHtml; // Set innerHTML with SANITIZED content
        console.log("Rendered sanitized HTML message.");
    } else {
         console.error("DOMPurify library not loaded! Cannot safely render HTML.");
         // Fallback to plain text rendering as a safety measure
         messageContentElement.textContent = "Error: Sanitizer not found. Message cannot be displayed securely.";
    }

} catch (error) {
    console.error("Error processing block page message:", error);
    // Attempt to render fallback safely in case of errors
    try {
        if (typeof DOMPurify !== 'undefined') {
             messageContentElement.innerHTML = DOMPurify.sanitize(fallbackHtml);
        } else {
            messageContentElement.textContent = "Site blocked (Error displaying message).";
        }
    } catch (finalError) {
        messageContentElement.textContent = "Site blocked (Critical display error).";
    }
}