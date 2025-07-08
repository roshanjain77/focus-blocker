# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Testing
```bash
npm test                    # Run all unit tests
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Run tests with coverage report
npm test tests/utils.test.js  # Run specific test file
```

### Extension Development
```bash
# Load extension in Chrome (manual process):
# 1. Open chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" and select this directory
```

## Architecture Overview

This is a Manifest V3 Chrome extension that blocks distracting websites during focus sessions. Focus sessions can be triggered either by:

1. **Calendar Integration**: Automatically detects Google Calendar events with focus keywords
2. **Manual Timer**: User-initiated timed focus sessions via popup

### Core System Flow

```
Calendar Check ──┐
                 ├─→ Profile Detection ──→ Rule Generation ──→ Website Blocking
Manual Timer ────┘
```

### Key Architectural Components

**Service Worker (background.js)**
- Central orchestrator managing focus state transitions
- Handles alarms for calendar checks and manual timer expiration
- Coordinates between all modules and maintains global state

**Profile-Based Blocking System**
- Multiple focus profiles with different keyword triggers and blocked site configurations
- Calendar events can specify profiles via keywords (e.g., "[Work]", "[Study]")
- Manual focus uses a default "Manual" profile
- Each profile has its own set of blocking rules and custom messages

**Dual Storage Strategy**
- `chrome.storage.sync`: User configurations, profiles, blocked sites (synced across devices)
- `chrome.storage.local`: Transient state like manual focus timers, blocked tab tracking

**Blocking Implementation**
- Uses `declarativeNetRequest` API for efficient website blocking
- Dynamic rule management: creates/removes rules based on active focus state
- Special handling for YouTube with allowed video exceptions
- "Block All" capability for complete internet blocking during focus

**Tab Management**
- Tracks originally blocked tabs to restore them when focus ends
- Immediate blocking of existing tabs when focus session starts
- Graceful handling of tab closures and navigation during blocking

### Module Responsibilities

**state.js**: Chrome storage abstraction, configuration loading/processing, manual focus timer management
**blocking.js**: DNR rule creation/deletion, handles block-all vs specific domain rules
**calendar.js**: Google Calendar API integration, OAuth token management, event parsing
**tabs.js**: Tab enumeration, blocking, and restoration logic
**utils.js**: Domain extraction and URL matching utilities
**auth.js**: Google OAuth 2.0 authentication flow management

### Critical State Transitions

1. **Focus Activation**: Existing tabs checked → Rules created → Background monitoring starts
2. **Focus Deactivation**: Rules removed → Blocked tabs restored → Clean up state
3. **Manual Override**: Manual timer takes priority over calendar-based focus
4. **Profile Switching**: Can happen mid-session if calendar event changes

### Testing Architecture

Comprehensive Jest test suite with:
- Chrome extension API mocking (in `tests/setup.js`)
- 120+ tests covering edge cases, error scenarios, and defensive programming
- Mocked Google Calendar API responses and OAuth flows
- Coverage reports generated in `coverage/` directory

### Extension Permissions Usage

- `declarativeNetRequest`: Dynamic website blocking rules
- `identity`: Google OAuth for calendar access
- `alarms`: Periodic calendar checks and manual timer expiration
- `tabs`: Tab enumeration and restoration
- `storage`: Configuration and state persistence
- `<all_urls>`: Required for blocking arbitrary user-specified domains

### Configuration Structure

Sites are configured as entries with:
- Domain list (comma-separated for grouping)
- Custom block messages (HTML supported)
- Profile assignments (which focus profiles trigger this blocking)
- YouTube-specific allowed video exceptions

The system processes raw configuration into expanded rules where each domain gets individual blocking entries while preserving grouping for message inheritance.