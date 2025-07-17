// calendar.js - OOP Refactored Google Calendar Integration

/**
 * Calendar event domain model
 */
export class CalendarEvent {
    constructor(summary, start, end, id = null) {
        this.summary = summary;
        this.start = start;
        this.end = end;
        this.id = id;
    }

    /**
     * Creates CalendarEvent from Google Calendar API response
     * @param {Object} apiEvent - Event from Google Calendar API
     * @returns {CalendarEvent} CalendarEvent instance
     */
    static fromApiResponse(apiEvent) {
        const summary = apiEvent.summary || '';
        
        // Handle both dateTime (specific time) and date (all-day) events
        const start = new Date(apiEvent.start.dateTime || apiEvent.start.date);
        let end;
        
        if (apiEvent.end.dateTime) {
            end = new Date(apiEvent.end.dateTime);
        } else {
            // All-day event ends at midnight at the start of the given end date
            end = new Date(apiEvent.end.date);
        }

        return new CalendarEvent(summary, start, end, apiEvent.id);
    }

    /**
     * Checks if the event is currently active
     * @param {Date} currentTime - Current time to check against
     * @returns {boolean} True if event is active
     */
    isActive(currentTime = new Date()) {
        const current = currentTime.getTime();
        const start = this.start.getTime();
        const end = this.end.getTime();
        
        return current >= start && current < end;
    }

    /**
     * Checks if event summary contains the given keyword (case-insensitive)
     * @param {string} keyword - Keyword to search for
     * @returns {boolean} True if keyword is found
     */
    containsKeyword(keyword) {
        if (!keyword || !this.summary) return false;
        return this.summary.trim().toLowerCase().includes(keyword.toLowerCase());
    }

    /**
     * Gets a display string for the event
     * @returns {string} Display string
     */
    toString() {
        return `"${this.summary}" (${this.start.toISOString()} - ${this.end.toISOString()})`;
    }
}

/**
 * Time range for calendar queries
 */
export class TimeRange {
    constructor(start, end) {
        this.start = start;
        this.end = end;
    }

    /**
     * Creates a time range around the current time
     * @param {number} minutesBefore - Minutes before current time
     * @param {number} minutesAfter - Minutes after current time
     * @param {Date} currentTime - Current time (defaults to now)
     * @returns {TimeRange} Time range instance
     */
    static createAroundNow(minutesBefore = 2, minutesAfter = 2, currentTime = new Date()) {
        const start = new Date(currentTime.getTime() - minutesBefore * 60 * 1000);
        const end = new Date(currentTime.getTime() + minutesAfter * 60 * 1000);
        return new TimeRange(start, end);
    }

    /**
     * Converts to ISO string format for API queries
     * @returns {Object} Object with timeMin and timeMax properties
     */
    toApiFormat() {
        return {
            timeMin: this.start.toISOString(),
            timeMax: this.end.toISOString()
        };
    }
}

/**
 * Google Calendar API client
 */
export class GoogleCalendarClient {
    constructor(baseUrl = 'https://www.googleapis.com/calendar/v3') {
        this.baseUrl = baseUrl;
    }

    /**
     * Fetches events from Google Calendar
     * @param {string} token - OAuth token
     * @param {TimeRange} timeRange - Time range for query
     * @param {string} keyword - Keyword to search for
     * @param {Object} options - Additional query options
     * @returns {Promise<Array<CalendarEvent>>} Array of calendar events
     */
    async fetchEvents(token, timeRange, keyword = '', options = {}) {
        const defaultOptions = {
            calendarId: 'primary',
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 10
        };

        const queryOptions = { ...defaultOptions, ...options };
        const { timeMin, timeMax } = timeRange.toApiFormat();
        
        const url = this.buildEventsUrl(queryOptions, timeMin, timeMax, keyword);

        try {
            const response = await this.makeApiRequest(url, token);
            const data = await response.json();
            
            console.log("Fetched events:", data.items ? data.items.length : 0);
            
            return (data.items || []).map(CalendarEvent.fromApiResponse);
        } catch (error) {
            console.error(`Error fetching calendar events for keyword "${keyword}":`, error);
            throw error;
        }
    }

    /**
     * Builds the URL for events API call
     * @param {Object} options - Query options
     * @param {string} timeMin - Minimum time
     * @param {string} timeMax - Maximum time
     * @param {string} keyword - Search keyword
     * @returns {string} Complete API URL
     */
    buildEventsUrl(options, timeMin, timeMax, keyword) {
        const params = new URLSearchParams({
            timeMin,
            timeMax,
            singleEvents: options.singleEvents.toString(),
            orderBy: options.orderBy,
            maxResults: options.maxResults.toString()
        });

        if (keyword) {
            params.append('q', keyword);
        }

        return `${this.baseUrl}/calendars/${options.calendarId}/events?${params.toString()}`;
    }

    /**
     * Makes authenticated API request
     * @param {string} url - API URL
     * @param {string} token - OAuth token
     * @returns {Promise<Response>} Fetch response
     */
    async makeApiRequest(url, token) {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            this.handleApiError(response);
        }

        return response;
    }

    /**
     * Handles API errors with appropriate logging and exceptions
     * @param {Response} response - Failed response
     */
    handleApiError(response) {
        switch (response.status) {
            case 401:
                console.warn('Calendar API Error 401: Unauthorized. Token might be expired/revoked.');
                throw new Error(`Unauthorized: ${response.statusText}`);
            case 403:
                console.error('Calendar API Error 403: Forbidden. Ensure Google Calendar API is enabled: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com');
                break;
            default:
                console.error(`Calendar API Error: ${response.status} ${response.statusText}`);
        }
        
        throw new Error(`Calendar API Error: ${response.status} ${response.statusText}`);
    }
}

/**
 * Profile matcher for finding active profiles based on calendar events
 */
export class ProfileMatcher {
    constructor() {
        this.currentTime = new Date();
    }

    /**
     * Sets the current time for testing purposes
     * @param {Date} time - Time to use as current time
     */
    setCurrentTime(time) {
        this.currentTime = time;
    }

    /**
     * Finds matching profile for given events and keyword
     * @param {Array<CalendarEvent>} events - Calendar events to check
     * @param {string} keyword - Keyword to match
     * @param {string} profileName - Name of the profile
     * @returns {string|null} Profile name if match found, null otherwise
     */
    findMatchingProfile(events, keyword, profileName) {
        if (!keyword) return null;

        const safeKeyword = keyword.trim();
        if (!safeKeyword) return null;

        for (const event of events) {
            if (event.containsKeyword(safeKeyword) && event.isActive(this.currentTime)) {
                console.log(`---> Active Profile Found: "${profileName}" (Keyword: "${keyword}", Event: ${event.toString()})`);
                return profileName;
            }
        }

        return null;
    }

    /**
     * Validates if profile has a valid keyword
     * @param {Object} profile - Profile object
     * @returns {boolean} True if profile has valid keyword
     */
    isValidProfile(profile) {
        return !!(profile.keyword && profile.keyword.trim());
    }
}

/**
 * High-level calendar service for focus profile detection
 */
export class CalendarService {
    constructor(client = new GoogleCalendarClient(), matcher = new ProfileMatcher()) {
        this.client = client;
        this.matcher = matcher;
    }

    /**
     * Finds the name of the first active focus profile based on calendar events
     * @param {string} token - Google OAuth token
     * @param {Array<Object>} profilesConfig - Profile definitions
     * @param {TimeRange} timeRange - Time range for query (optional)
     * @returns {Promise<string|null>} Name of the active profile or null
     */
    async getActiveFocusProfileName(token, profilesConfig, timeRange = null) {
        if (!timeRange) {
            timeRange = TimeRange.createAroundNow(2, 2);
        }

        const validProfiles = profilesConfig.filter(profile => this.matcher.isValidProfile(profile));
        
        for (const profile of validProfiles) {
            try {
                const events = await this.client.fetchEvents(token, timeRange, profile.keyword);
                const matchingProfile = this.matcher.findMatchingProfile(events, profile.keyword, profile.name);
                
                if (matchingProfile) {
                    return matchingProfile;
                }
                
            } catch (error) {
                if (error.message.includes('Unauthorized')) {
                    throw error; // Propagate auth errors
                }
                console.error(`Error checking profile "${profile.name}":`, error);
                return null; // Return null for errors
            }
        }

        console.log('No active calendar-based focus profile found.');
        return null; // Return null when no matches found
    }

    /**
     * Checks if any profile is currently active
     * @param {string} token - OAuth token
     * @param {Array<Object>} profilesConfig - Profile definitions
     * @returns {Promise<boolean>} True if any profile is active
     */
    async hasActiveProfile(token, profilesConfig) {
        const activeProfile = await this.getActiveFocusProfileName(token, profilesConfig);
        return activeProfile !== null;
    }

    /**
     * Gets all active profiles (for future multi-profile support)
     * @param {string} token - OAuth token
     * @param {Array<Object>} profilesConfig - Profile definitions
     * @returns {Promise<Array<string>>} Array of active profile names
     */
    async getAllActiveProfiles(token, profilesConfig) {
        const activeProfiles = [];
        const timeRange = TimeRange.createAroundNow(2, 2);
        const validProfiles = profilesConfig.filter(profile => this.matcher.isValidProfile(profile));

        for (const profile of validProfiles) {
            try {
                const events = await this.client.fetchEvents(token, timeRange, profile.keyword);
                const matchingProfile = this.matcher.findMatchingProfile(events, profile.keyword, profile.name);
                
                if (matchingProfile) {
                    activeProfiles.push(matchingProfile);
                }
                
            } catch (error) {
                if (error.message.includes('Unauthorized')) {
                    throw error;
                }
                console.error(`Error checking profile "${profile.name}":`, error);
            }
        }

        return activeProfiles;
    }

    /**
     * Sets current time for testing purposes
     * @param {Date} time - Time to use as current time
     */
    setCurrentTime(time) {
        this.matcher.setCurrentTime(time);
    }
}

// Backward compatibility function
export async function getActiveFocusProfileName(token, profilesConfig) {
    const calendarService = new CalendarService();
    return calendarService.getActiveFocusProfileName(token, profilesConfig);
}