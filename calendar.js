// calendar.js

/**
 * Fetches calendar events around 'now' and checks if a focus event is active.
 * @param {string} token - Google OAuth token.
 * @param {string} focusKeyword - The keyword to search for in event titles.
 * @returns {Promise<boolean>} True if a matching focus event is currently active, false otherwise.
 */
export async function isCurrentlyInFocusEvent(token, focusKeyword) {
    const now = new Date();
    // Look slightly back and forward to catch events starting/ending around now
    const timeMin = new Date(now.getTime() - 2 * 60 * 1000).toISOString(); // 2 minutes ago
    const timeMax = new Date(now.getTime() + 2 * 60 * 1000).toISOString(); // 2 minutes ahead
    const safeKeyword = focusKeyword.trim().toLowerCase(); // Use trimmed, lowercased keyword for checks
    // Use 'q' for filtering but double-check summary as 'q' can be fuzzy
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=10&q=${encodeURIComponent(focusKeyword)}`; // Use original keyword for 'q'

    console.log(`Checking calendar with keyword: "${focusKeyword}"`);

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            // Handle specific errors, returning false but logging details
            if (response.status === 401) { // Unauthorized
                console.warn('Calendar API Error 401: Unauthorized. Token might be expired/revoked.');
                // Let the caller handle token removal based on status
                throw new Error(`Unauthorized: ${response.statusText}`); // Throw to signal auth issue
            } else if (response.status === 403) { // Forbidden
                console.error(`Calendar API Error 403: Forbidden. Ensure Google Calendar API is enabled: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com`);
            } else {
                console.error(`Calendar API Error: ${response.status} ${response.statusText}`);
            }
            return false; // Assume not in focus on non-401 errors
        }

        const data = await response.json();
        console.log("Fetched events:", data.items ? data.items.length : 0);

        if (data.items && data.items.length > 0) {
            const currentTime = now.getTime();
            for (const event of data.items) {
                 // Double-check keyword presence (case-insensitive) as 'q' param can be fuzzy
                if (event.summary && event.summary.trim().toLowerCase().includes(safeKeyword)) {
                    // Handle both dateTime (specific time) and date (all-day) events
                    const start = new Date(event.start.dateTime || event.start.date).getTime();
                    let end;
                    if (event.end.dateTime) {
                        end = new Date(event.end.dateTime).getTime();
                    } else { // All-day event ends at midnight *at the start* of the given end date
                         const endDate = new Date(event.end.date);
                         end = endDate.getTime();
                    }

                    console.log(`Event: "${event.summary}", Start: ${new Date(start)}, End: ${new Date(end)}, Now: ${now}`);

                    // Check if 'now' is within the event's time range (inclusive start, exclusive end)
                    if (currentTime >= start && currentTime < end) {
                        console.log(`---> Focus event found and ACTIVE: "${event.summary}"`);
                        return true; // Currently in a matching focus event
                    }
                }
            }
        }
        console.log('No active focus event found matching the keyword and time.');
        return false; // No active matching event found
    } catch (error) {
        // Catch fetch errors or specific thrown errors (like 401)
        if (error.message.includes('Unauthorized')) {
             throw error; // Re-throw auth errors for specific handling
        } else {
            console.error('Error fetching/processing calendar events:', error);
        }
        return false; // Assume not in focus on other errors
    }
}