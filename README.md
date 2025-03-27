# Calendar Focus Blocker Chrome Extension

Automatically block distracting websites during focus time scheduled in your Google Calendar. Stay focused and reclaim your productivity!

## Key Features

*   **Google Calendar Integration:** Reads events directly from your primary Google Calendar.
*   **Keyword Detection:** Identifies "focus time" events based on a customizable keyword in the event title (e.g., "[Focus]").
*   **Website Blocking:** Blocks a list of websites defined by you during active focus periods.
*   **Custom Block Message:** Displays a personalized message (can include basic HTML) when you attempt to access a blocked site.
*   **Efficient Blocking:** Uses Chrome's `declarativeNetRequest` API for efficient, low-resource website blocking.
*   **Secure Authentication:** Uses Google OAuth 2.0 for secure, read-only access to your calendar data.
*   **Configurable:** Easily configure keywords, blocked sites, and messages via the extension's options page.

## How It Works

1.  The extension periodically checks your primary Google Calendar for events occurring *now*.
2.  It looks for events whose titles contain your specified "Focus Keyword".
3.  If a matching focus event is currently active, the extension enables blocking rules.
4.  These rules prevent you from accessing the websites you've listed in the options.
5.  If you try to visit a blocked site, you are redirected to a page displaying your custom message.
6.  When the focus event ends (or no active focus event is found), the blocking rules are automatically disabled, allowing normal access to websites.
7.  It also checks currently open tabs when a focus session starts and blocks them if they match the list.

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
    *   Click "Load unpacked" and temporarily select the folder containing this extension's code (even if `manifest.json` isn't fully ready yet).
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
*   If you loaded the extension temporarily before, remove it.
*   Click **Load unpacked**.
*   Select the folder containing all the extension's files (`manifest.json`, `background.js`, etc.).
*   The extension should now appear in your list. Check for any errors on its card.

**4. Configure the Extension:**

*   Find the "Calendar Focus Blocker" extension card on the `chrome://extensions` page and click **Details**, then **Extension options**. (Alternatively, click the extension's icon in your toolbar if available and click "Options").
*   **Authorize:** Click the "Authorize / Re-authorize" button and follow the prompts to sign in with the Google Account you added as a test user. Grant the requested "View your calendars" permission.
*   **Focus Keyword:** Enter the text the extension should look for in calendar event titles (e.g., `[Focus]`, `Deep Work`).
*   **Blocked Websites:** Enter the domains of websites you want to block (e.g., `youtube.com`, `facebook.com`, `reddit.com`), one per line. The extension will block the main domain and its subdomains.
*   **Global Block Message:** Enter the message (HTML is allowed) to display when a site is blocked.
*   **Enable:** Ensure the "Enable Extension" checkbox is checked.
*   Click **Save All Settings**.

## Usage

1.  Create events in your Google Calendar during the times you want to focus.
2.  Include your chosen **Focus Keyword** (exactly as set in the options) somewhere in the event title.
3.  During the scheduled time of these events, the extension will automatically block the websites you listed. Trying to access them will show your custom block message.
4.  Outside of these scheduled focus times, website access will be normal.

## Permissions Explained

*   **storage:** To save your settings (blocked sites list, custom message, focus keyword, enabled status).
*   **identity:** To securely authenticate with your Google Account via OAuth 2.0 to read calendar data.
*   **alarms:** To periodically trigger checks of your calendar in the background without keeping the extension constantly active.
*   **declarativeNetRequest:** To efficiently block network requests to the specified websites without impacting browser performance.
*   **tabs:** To check currently open tabs when a focus session starts and redirect them if they match a blocked site.
*   **host_permissions (`<all_urls>`, `https://www.googleapis.com/`):** `<all_urls>` is required by `declarativeNetRequest` to potentially block any user-specified site. `googleapis.com` is needed to make requests to the Google Calendar API.

## Limitations & Notes

*   Requires a Google Account and use of Google Calendar.
*   Only checks the primary calendar associated with the authorized account.
*   Relies entirely on the presence of the specified keyword in event titles.
*   Initial setup requires configuration in Google Cloud Console.
*   While your Google Cloud project's consent screen is in "Testing" mode, only Google accounts added as "Test users" can authorize the extension.

