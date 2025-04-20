// constants.js

export const CALENDAR_CHECK_ALARM = 'calendarCheckAlarm';
export const RULE_PRIORITY = 1;
export const FOCUS_RULE_ID_START = 1000; // Start ID for DNR rules
export const MAX_BLOCKED_SITES = 100; // Max DNR rules to create
export const FOCUS_RULE_ID_END = FOCUS_RULE_ID_START + MAX_BLOCKED_SITES - 1;
export const BLOCKED_TABS_MAP_KEY = 'blockedTabsMap'; // { tabId: originalUrl }


// Default values
export const defaultSitesConfigForBG = [
    { domain: "youtube.com", message: "Maybe watch this later?" },
    { domain: "facebook.com", message: null },
    { domain: "twitter.com", message: null },
    { domain: "reddit.com", message: "Focus time! No endless scrolling." }
];
export const defaultGlobalMessageForBG = '<h1>Site Blocked</h1><p>This site is blocked during your scheduled focus time.</p>'; // Keep default as HTML
export const defaultFocusKeyword = '[Focus]';

export const CHECK_INTERVAL_MINUTES = 5; // Calendar check frequency

export const MANUAL_FOCUS_END_ALARM = 'manualFocusEndAlarm';
export const MANUAL_FOCUS_END_TIME_KEY = 'manualFocusEndTime'; // Storage key


// Exception Tracking
export const EXCEPTION_DATA_KEY = 'exceptionData'; // { lastResetDate: "YYYY-MM-DD", dayUsedMs: number, nightUsedMs: number }
export const EXCEPTION_END_TIME_KEY = 'exceptionEndTime'; // Timestamp | null
export const EXCEPTION_END_ALARM = 'exceptionEndAlarm'; // Alarm name

// Exception Limits
export const DAILY_EXCEPTION_TOTAL_MS = 1 * 60 * 60 * 1000; // 1 hour total
export const NIGHTLY_EXCEPTION_LIMIT_MS = 30 * 60 * 1000; // 30 mins max during night
export const DEFAULT_EXCEPTION_DURATION_MS = 15 * 60 * 1000; // Grant 15 mins per click (configurable maybe later)

// Night Time Definition
export const NIGHT_START_HOUR = 0; // 12:00 AM (inclusive)
export const NIGHT_END_HOUR = 6;   // 6:00 AM (exclusive)