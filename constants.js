// constants.js

export const CALENDAR_CHECK_ALARM = 'calendarCheckAlarm';
export const RULE_PRIORITY = 1;
export const FOCUS_RULE_ID_START = 1000; // Start ID for DNR rules
export const MAX_BLOCKED_SITES = 100; // Max DNR rules to create
export const FOCUS_RULE_ID_END = FOCUS_RULE_ID_START + MAX_BLOCKED_SITES - 1;

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