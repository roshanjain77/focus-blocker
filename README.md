# Calendar Focus Blocker Chrome Extension

Automatically block distracting websites during focus time scheduled in your Google Calendar, **or start a timed manual focus session anytime!** Stay focused and reclaim your productivity!

## Key Features

*   **Google Calendar Integration:** Reads events directly from your primary Google Calendar.
*   **Keyword Detection:** Identifies "focus time" events based on a customizable keyword in the event title (e.g., "[Focus]").
*   **Manual Focus Timer:** Start timed focus sessions (e.g., 30 or 60 minutes) directly from the extension popup, overriding calendar checks.
*   **Website Blocking:** Blocks a list of websites defined by you during active focus periods (calendar or manual).
*   **Grouped Website Entry:** Enter multiple domains separated by commas (e.g., `youtube.com, youtu.be`) in a single entry to block them all with the same custom message.
*   **Custom Block Message:** Displays a personalized message (can include basic HTML) when you attempt to access a blocked site. Assign specific messages per group of sites, with a global fallback.
*   **Efficient Blocking:** Uses Chrome's `declarativeNetRequest` API for efficient, low-resource website blocking.
*   **Secure Authentication:** Uses Google OAuth 2.0 for secure, read-only access to your calendar data.
*   **Configurable:** Easily configure keywords, blocked sites, messages, and enable/disable via the extension's options page.
*   **Status Popup:** Quickly see if focus is active (calendar or manual), start/stop manual sessions, and view remaining time for manual sessions.

## How It Works

1.  **Manual Focus (Priority):** If you start a manual focus session via the popup, the extension immediately enables blocking rules for the specified duration, regardless of your calendar.
2.  **Calendar Check:** If no manual session is active, the extension periodically checks your primary Google Calendar for events occurring *now*.
3.  **Keyword Detection:** It looks for events whose titles contain your specified "Focus Keyword".
4.  **Blocking Activation:** If a matching focus event is currently active (and no manual session is running), the extension enables blocking rules.
5.  **Rule Application:** Blocking rules prevent you from accessing the websites you've listed in the options. Domains entered as comma-separated lists are treated as a group sharing the same custom message.
6.  **Redirection:** If you try to visit a blocked site, you are redirected to a page displaying your custom message (per-site group message takes priority over the global message).
7.  **Tab Check:** When any focus session (manual or calendar) starts, the extension checks currently open tabs and blocks them if they match the blocked list.
8.  **Deactivation:**
    *   Manual focus automatically stops (and blocking rules are disabled) when the timer runs out, or if stopped manually via the popup.
    *   Calendar-based blocking automatically stops when the focus event ends, or if no active focus event is found during a check.
    *   **Note:** After a manual session ends, the extension immediately checks the calendar to see if a calendar-based focus session should start.

## Setup Instructions

This extension requires initial setup in Google Cloud Console to securely access your calendar.

**1. Google Cloud Console Setup:**

*   Go to the [Google Cloud Console](https://console.cloud.google.com/).
*   Create a new project or select an existing one.
*   Go to **APIs & Services > Library**. Search for and **Enable** the **Google Calendar API**.
*   Go to **APIs & Services > Credentials**.
*   Click **+ CREATE CREDENTIALS > OAuth client ID**.
*   If prompted, configure the **OAuth consent screen**:
    *   Select **User Type** (likely "External" unless you have a Workspace account).
    *   Enter an **App name** (e.g., "Calendar Focus Blocker").
    *   Enter your **User support email**.
    *   Add Developer contact info (your email).
    *   **Scopes:** Click "Add or Remove Scopes", find "Google Calendar API", and select the scope ending in `.../auth/calendar.readonly`. Click Update.
    *   **Test users:** While the consent screen is in "Testing" mode, click "+ ADD USERS" and add the Google Account email address(es) you will use this extension with.
    *   Save and continue through the consent screen setup.
*   Go back to **APIs & Services > Credentials**.
*   Click **+ CREATE CREDENTIALS > OAuth client ID** again.
*   Select **Application type: Chrome Extension**.
*   Enter a **Name** (e.g., "Focus Blocker Extension Client").
*   **Application ID:** You need your extension's ID for this. To get it:
    *   Open Chrome and go to `chrome://extensions`.
    *   Enable "Developer mode" (top-right).
    *   Click "Load unpacked" and select the folder containing this extension's code.
    *   Copy the **ID** shown on the extension's card.
    *   Paste this ID into the "Application ID" field in Google Cloud Console.
*   Click **CREATE**.
*   Copy the resulting **Client ID** (looks like `....apps.googleusercontent.com`). **You need this for the next step.**

**2. Extension Code Setup:**

*   Download or clone the extension code files.
*   Open the `manifest.json` file in a text editor.
*   Find the `oauth2` section and paste your **Client ID** (copied from Google Cloud Console) as the value for `client_id`:
    ```json
     "oauth2": {
       "client_id": "YOUR_COPIED_CLIENT_ID_HERE.apps.googleusercontent.com",
       "scopes": [
         "https://www.googleapis.com/auth/calendar.readonly"
       ]
     },
    ```
*   Save `manifest.json`.

**3. Load the Extension in Chrome:**

*   Go to `chrome://extensions`.
*   Ensure "Developer mode" is enabled.
*   If you loaded the extension temporarily before, remove it using the "Remove" button.
*   Click **Load unpacked**.
*   Select the folder containing all the extension's files (`manifest.json`, `background.js`, `options.html`, etc.).
*   The extension should now appear in your list. Check for any errors on its card.

**4. Configure the Extension:**

*   Find the "Calendar Focus Blocker" extension card on the `chrome://extensions` page and click **Details**, then **Extension options**. (Alternatively, click the extension's icon in your toolbar and click "Options").
*   **Authorize:** Click the "Authorize / Re-authorize" button and follow the prompts to sign in with the Google Account you added as a test user. Grant the requested "View your calendars" permission.
*   **Focus Keyword:** Enter the text the extension should look for in calendar event titles (e.g., `[Focus]`, `Deep Work`). Leave blank if you only plan to use manual focus.
*   **Blocked Websites:**
    *   Click "+ Add Site Entry".
    *   In the "Website Domain(s)" field, enter the domains you want to block. **You can enter multiple domains separated by commas** (e.g., `youtube.com, facebook.com, reddit.com`) to apply the same custom message to all of them within that entry. The extension will block the main domain and its subdomains (e.g., entering `reddit.com` also blocks `old.reddit.com`).
    *   Optionally, enter a custom HTML message for this specific site/group of sites in the "Custom HTML Message" box. If left blank, the Global Block Message will be used.
    *   Add more entries as needed.
*   **Global Block Message:** Enter the fallback message (HTML is allowed) to display when a site is blocked and doesn't have a specific custom message assigned.
*   **Enable:** Ensure the "Enable Extension" checkbox is checked for the extension to function.
*   Click **Save All Settings**.

## Usage

**Calendar-Based Focus:**

1.  Create events in your Google Calendar during the times you want to focus automatically.
2.  Include your chosen **Focus Keyword** (exactly as set in the options) somewhere in the event title.
3.  During the scheduled time of these events (and if no manual focus is active), the extension will automatically block the websites you listed. Trying to access them will show your custom message.
4.  Outside of these scheduled focus times, website access will be normal (unless manual focus is started).

**Manual Focus:**

1.  Click the extension's icon in your Chrome toolbar to open the popup.
2.  If focus is not already active, click "Focus 30 Min" or "Focus 60 Min" (or other configured times).
3.  Blocking will start immediately for the selected duration. The popup will show the remaining time.
4.  To end the manual session early, open the popup and click "Stop Manual Focus".
5.  When the timer expires or you stop it manually, blocking stops, and the extension reverts to checking the calendar (if enabled and configured).

## Permissions Explained

*   **storage:** To save your settings (blocked sites list, messages, keyword, enabled status) and manual focus end time.
*   **identity:** To securely authenticate with your Google Account via OAuth 2.0 to read calendar data.
*   **alarms:** To periodically trigger checks of your calendar and to precisely end manual focus sessions.
*   **declarativeNetRequest:** To efficiently block network requests to the specified websites without impacting browser performance.
*   **tabs:** To check currently open tabs when a focus session starts and redirect them if they match a blocked site.
*   **host_permissions (`<all_urls>`, `https://www.googleapis.com/`):** `<all_urls>` is required by `declarativeNetRequest` to potentially block any user-specified site. `googleapis.com` is needed to make requests to the Google Calendar API.

## Limitations & Notes

*   Calendar integration requires a Google Account and use of Google Calendar.
*   Only checks the primary calendar associated with the authorized account.
*   Calendar blocking relies entirely on the presence of the specified keyword in event titles.
*   **Manual focus mode takes priority over calendar events.** If a manual session is running, calendar events will not trigger blocking.
*   Initial setup requires configuration in Google Cloud Console.
*   While your Google Cloud project's consent screen is in "Testing" mode, only Google accounts added as "Test users" can authorize the extension.