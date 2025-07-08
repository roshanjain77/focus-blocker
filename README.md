# Calendar Focus Blocker Chrome Extension

Automatically block distracting websites during focus time scheduled in your Google Calendar, **or start a timed manual focus session anytime!** Features a sophisticated **multi-profile system** with **YouTube video allowlists** and comprehensive blocking capabilities. Stay focused and reclaim your productivity!

## Key Features

### 🎯 **Multi-Profile Focus System**
*   **Profile-Based Blocking:** Create multiple focus profiles (e.g., "Work", "Study", "Deep Focus") with unique calendar keywords and blocking rules
*   **Smart Profile Detection:** Calendar events trigger specific profiles based on keywords in event titles (e.g., "[Work]", "[Study]")
*   **Manual Profile Override:** Manual focus sessions use a dedicated "Manual" profile that overrides calendar-based blocking

### ⏰ **Dual Focus Activation**
*   **Manual Focus Timer:** Start 30 or 60-minute focus sessions directly from the popup, with real-time countdown
*   **Google Calendar Integration:** Automatically detects focus events in your calendar using customizable keywords per profile
*   **Priority System:** Manual sessions take priority over calendar events, with seamless transitions

### 🚫 **Advanced Website Blocking**
*   **Flexible Blocking Rules:** Block specific domains or enable "Block All" mode for complete internet blocking
*   **Domain Grouping:** Enter multiple domains (comma-separated) in single rules with shared custom messages
*   **Subdomain Support:** Automatically blocks all subdomains (e.g., blocking `reddit.com` also blocks `old.reddit.com`)
*   **Efficient Implementation:** Uses Chrome's `declarativeNetRequest` API for low-resource, high-performance blocking

### 🎬 **YouTube Integration**
*   **Allowed Video Lists:** Create curated lists of educational/work-related videos that remain accessible during focus
*   **Embedded Video Player:** Watch allowed videos directly in the block page with privacy-enhanced playback
*   **Per-Rule Video Assignment:** Different blocking rules can have different allowed video lists

### 💬 **Custom Block Messages**
*   **Rich HTML Support:** Create custom block messages with HTML formatting, sanitized for security
*   **Per-Rule Messages:** Each blocking rule can have its own custom message
*   **Global Fallback:** Set a default message for rules without specific messages
*   **Dynamic Content:** Messages can include styling, links, and motivational content

### 🔄 **Smart Tab Management**
*   **Existing Tab Blocking:** When focus starts, automatically blocks and redirects already-open blocked sites
*   **Tab Restoration:** When focus ends, intelligently restores previously blocked tabs to their original URLs
*   **Session Persistence:** Tab tracking works across browser restarts and extension updates

### ⚙️ **Configuration & Management**
*   **Import/Export Settings:** Backup and share your complete configuration including profiles and blocking rules
*   **Real-Time Updates:** Settings changes apply immediately without requiring extension reload
*   **Profile Assignment:** Assign blocking rules to multiple profiles for flexible focus scenarios

## How It Works

### Focus Activation Priority
1. **Manual Focus (Highest Priority):** Manual sessions immediately activate blocking and override any calendar events
2. **Calendar-Based Focus:** When no manual session is active, the extension checks for calendar events every 5 minutes
3. **Profile Matching:** Calendar events are matched to profiles based on keywords in event titles
4. **Rule Activation:** All blocking rules assigned to the active profile are immediately enforced

### Blocking Mechanism
1. **Rule Generation:** Chrome's declarativeNetRequest creates efficient blocking rules for active profiles
2. **Traffic Interception:** All matching requests are redirected to the custom block page
3. **Tab Management:** Existing tabs are checked and blocked if they match active rules
4. **Restoration:** When focus ends, blocked tabs are restored to their original URLs

### YouTube Integration
1. **Video Allowlists:** Each blocking rule can specify allowed YouTube videos by ID
2. **Smart Blocking:** YouTube is blocked except for specifically allowed videos
3. **Embedded Playback:** Allowed videos play directly in the block page using privacy-enhanced YouTube

## Setup Instructions

### 1. Google Cloud Console Setup

**Create OAuth Credentials:**
*   Go to the [Google Cloud Console](https://console.cloud.google.com/)
*   Create a new project or select an existing one
*   Navigate to **APIs & Services > Library** and enable the **Google Calendar API**
*   Go to **APIs & Services > Credentials**

**Configure OAuth Consent Screen:**
*   Click **OAuth consent screen** and select "External" user type
*   Fill in required fields:
    *   App name: "Calendar Focus Blocker"
    *   User support email: Your email
    *   Developer contact info: Your email
*   Under **Scopes**, add `https://www.googleapis.com/auth/calendar.readonly`
*   Add your Google account as a test user (while in testing mode)

**Create Chrome Extension Credentials:**
*   Return to **Credentials** and click **+ CREATE CREDENTIALS > OAuth client ID**
*   Select **Application type: Chrome Extension**
*   For **Application ID**, you need your extension's Chrome ID:
    1. Load the extension in Chrome (`chrome://extensions` > "Load unpacked")
    2. Copy the extension ID from the extension card
    3. Paste it into the Application ID field
*   Click **CREATE** and copy the generated **Client ID**

### 2. Extension Configuration

**Update manifest.json:**
```json
{
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID_HERE.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/calendar.readonly"]
  }
}
```

**Load Extension:**
*   Open `chrome://extensions`
*   Enable "Developer mode"
*   Click "Load unpacked" and select the extension folder
*   Verify the extension loads without errors

### 3. Initial Setup

**Access Options:**
*   Click the extension icon and select "Options" or go to `chrome://extensions` > Extension details > Extension options

**Authorize Calendar Access:**
*   Click "Authorize / Re-authorize" and sign in with your Google account
*   Grant calendar read permissions when prompted

**Create Profiles:**
*   Add focus profiles (e.g., "Work", "Study") with unique keywords
*   Keywords should match text in your calendar events (e.g., "[Work]", "[Study]")

**Configure Blocking Rules:**
*   Add website blocking rules and assign them to profiles
*   Enter domains (comma-separated for groups) and optional custom messages
*   For YouTube rules, add allowed video IDs if desired

**Test Configuration:**
*   Create a test calendar event with your profile keyword
*   Verify blocking activates during the event time
*   Test manual focus sessions from the popup

## Usage Guide

### Manual Focus Sessions
*   Click the extension popup icon
*   Choose "Focus 30 Min" or "Focus 60 Min"
*   Monitor remaining time in the popup
*   End early by clicking "Stop Manual Focus"

### Calendar-Based Focus
*   Create calendar events with profile keywords in titles
*   Example: "Team Meeting [Work]" or "Study Session [Study]"
*   Blocking automatically activates during event times
*   Different profiles can have different blocking rules

### YouTube Integration
*   Add educational video IDs to blocking rules
*   Videos remain accessible during focus via the block page
*   Use privacy-enhanced playback (youtube-nocookie.com)

### Configuration Management
*   Export settings for backup: Options > "Export Settings"
*   Import settings: Options > "Import Settings" > Select file
*   Settings sync across devices when using Chrome sync

## Advanced Features

### Block All Mode
*   Enable "Block All Websites" for complete internet blocking
*   Only the extension's own pages remain accessible
*   Useful for extreme focus scenarios or digital detox

### Profile Strategies
*   **Work Profile:** Block social media, allow work-related sites
*   **Study Profile:** Block entertainment, allow educational content
*   **Deep Focus:** Block everything except essential tools

### Custom Messages
*   Use HTML for rich formatting in block messages
*   Include motivational quotes, focus tips, or deadline reminders
*   Different messages for different types of distractions

## Technical Details

### Permissions Explained
*   **storage:** Save settings and session data
*   **identity:** Google OAuth authentication for calendar access
*   **alarms:** Periodic calendar checks and timer management
*   **declarativeNetRequest:** Efficient website blocking without performance impact
*   **tabs:** Manage existing tabs during focus sessions
*   **host_permissions:** Required for blocking user-specified domains and calendar API access

### Performance & Efficiency
*   Minimal resource usage through Chrome's native blocking APIs
*   Efficient rule management with atomic updates
*   Smart caching of calendar data and authentication tokens
*   Optimized for minimal battery and performance impact

### Privacy & Security
*   Read-only calendar access (cannot modify your calendar)
*   Local storage of all settings and preferences
*   Optional cloud sync through Chrome's built-in sync
*   No external analytics or tracking

## Limitations & Notes

*   Requires Google account and Google Calendar usage
*   Only monitors the primary calendar of the authenticated account
*   Calendar blocking depends on keyword presence in event titles
*   Manual focus always overrides calendar-based blocking
*   OAuth setup required during initial configuration
*   Test users must be added during Google Cloud Console setup (testing mode)
*   YouTube video allowlists require specific video IDs, not channel or playlist IDs

## Support & Troubleshooting

### Common Issues
*   **No calendar events detected:** Verify keywords match exactly and events are in primary calendar
*   **Blocking not working:** Check extension permissions and reload if necessary
*   **OAuth errors:** Ensure correct Client ID in manifest.json and test user setup

### Debug Steps
1. Check extension errors in `chrome://extensions`
2. Verify calendar authorization in Options page
3. Test manual focus to isolate calendar vs. blocking issues
4. Review blocking rules and profile assignments

For additional support, check the extension's popup status messages and browser console for detailed error information.