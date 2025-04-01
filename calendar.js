// calendar.js

/**
 * Finds the name of the first active focus profile based on calendar events.
 * @param {string} token - Google OAuth token.
 * @param {Array<{name: string, keyword: string | null}>} profilesConfig - Profile definitions.
 * @returns {Promise<string|null>} Name of the active profile or null.
 */
export async function getActiveFocusProfileName(token, profilesConfig) {
    const now = new Date();
    const timeMin = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 2 * 60 * 1000).toISOString();
    const currentTime = now.getTime();

    // Iterate through profiles with actual keywords
    for (const profile of profilesConfig) {
        if (!profile.keyword) continue; // Skip profiles without keywords (like Manual)

        const safeKeyword = profile.keyword.trim();
        if (!safeKeyword) continue;

        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=10&q=${encodeURIComponent(safeKeyword)}`;

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
                    if (event.summary && event.summary.trim().toLowerCase().includes(safeKeyword.toLowerCase())) {
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
                            console.log(`---> Active Profile Found: "${profile.name}" (Keyword: "${profile.keyword}", Event: "${event.summary}")`);
                            return profile.name; // Return the NAME of the first matching profile
                        }
                    }
                }
            }
            console.log('No active focus event found matching the keyword and time.');
            return false; // No active matching event found
        } catch (error) {
            // Catch fetch errors or specific thrown errors (like 401)
            console.error(`Error fetching calendar for profile "${profile.name}":`, error);
            if (error.message.includes('Unauthorized')) throw error; // Propagate auth errors
        }
    }
    console.log('No active calendar-based focus profile found.');
    return null; // No active profile found

}