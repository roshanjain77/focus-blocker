// blocked.js
const messageContentElement = document.getElementById('message-content');
const allowedVideosContainer = document.getElementById('allowed-videos-container');
const allowedVideosListElement = document.getElementById('allowed-videos-list');
const videoPlayerContainer = document.getElementById('video-player-container');
const closeVideoBtn = document.getElementById('close-video-btn');
const fallbackHtml = '<h1>Site Blocked</h1><p>This site is blocked during your scheduled focus time.</p>';

try {
    const params = new URLSearchParams(window.location.search);
    const encodedMessage = params.get('message');
    const encodedVideos = params.get('videos'); // Get the new videos parameter

    // --- 1. Render Main Message (Sanitized) ---
    let rawMessage = fallbackHtml;
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

    // --- 2. Process and Display Allowed Videos ---
    if (encodedVideos) {
        try {
            const decodedVideos = decodeURIComponent(encodedVideos);
            const videoIds = decodedVideos.split(',').filter(id => id.trim() !== ''); // Split by comma

            if (videoIds.length > 0) {
                allowedVideosListElement.innerHTML = ''; // Clear previous (if any)
                videoIds.forEach(videoId => {
                    // Create a clickable element for each video
                    const videoItem = document.createElement('div');
                    videoItem.classList.add('allowed-video-item');
                    videoItem.textContent = `Watch Allowed Video (ID: ${videoId})`; // Simple text
                    videoItem.dataset.videoId = videoId; // Store ID in data attribute
                    videoItem.setAttribute('role', 'button'); // Accessibility
                    videoItem.setAttribute('tabindex', '0'); // Make it focusable

                    videoItem.addEventListener('click', playVideo);
                    videoItem.addEventListener('keydown', (e) => { // Allow activation with Enter/Space
                        if (e.key === 'Enter' || e.key === ' ') {
                             e.preventDefault(); // Prevent page scroll on Space
                             playVideo.call(videoItem); // Call playVideo with 'this' set to the item
                        }
                    });

                    allowedVideosListElement.appendChild(videoItem);
                });
                allowedVideosContainer.style.display = 'block'; // Show the section
            }
        } catch (e) {
            console.error("Error processing allowed videos parameter:", e);
        }
    }

    // --- 3. Video Player Logic ---
    function playVideo() {
        const videoId = this.dataset.videoId; // 'this' refers to the clicked element
        if (!videoId) return;

        console.log("Playing video:", videoId);

        // Clear previous iframe if any
        videoPlayerContainer.innerHTML = '';
        // Re-add close button (it gets cleared with innerHTML)
        videoPlayerContainer.appendChild(closeVideoBtn);


        // Create iframe
        const iframe = document.createElement('iframe');
        iframe.width = "560"; // Set initial size or rely on CSS aspect-ratio
        iframe.height = "315";
        // Use youtube-nocookie.com for enhanced privacy
        iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&rel=0`; // Added autoplay=1 and rel=0
        iframe.title = "Allowed YouTube video player";
        iframe.frameborder = "0";
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        iframe.allowFullscreen = true;

        videoPlayerContainer.appendChild(iframe);
        videoPlayerContainer.style.display = 'block'; // Ensure container is visible
        closeVideoBtn.style.display = 'block'; // Show close button

        // Scroll smoothly to the video player
        videoPlayerContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Close button functionality
    closeVideoBtn.addEventListener('click', () => {
        videoPlayerContainer.innerHTML = ''; // Remove iframe
        // Re-add close button so it can be reused
        videoPlayerContainer.appendChild(closeVideoBtn);
        closeVideoBtn.style.display = 'none'; // Hide button again
        videoPlayerContainer.style.display = 'none'; // Optionally hide container too
        videoPlayerContainer.classList.remove('visible');
    });


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