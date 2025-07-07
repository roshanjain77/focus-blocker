// Mock crypto.randomUUID
global.crypto = global.crypto || {};
global.crypto.randomUUID = jest.fn(() => 'test-uuid-123');

// Mock Chrome extension APIs for testing
global.chrome = {
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    },
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    }
  },
  runtime: {
    id: 'test-extension-id',
    getURL: jest.fn((path) => `chrome-extension://test-extension-id/${path}`)
  },
  declarativeNetRequest: {
    getSessionRules: jest.fn(),
    updateSessionRules: jest.fn()
  },
  tabs: {
    query: jest.fn(),
    update: jest.fn()
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn(),
    get: jest.fn(),
    onAlarm: {
      addListener: jest.fn()
    }
  }
};

// Mock fetch for calendar API calls
global.fetch = jest.fn();

// Mock URL constructor for older Node versions
if (!global.URL) {
  global.URL = class URL {
    constructor(url) {
      // Simple URL parsing for testing
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const parts = url.split('/');
        this.hostname = parts[2];
        this.protocol = parts[0];
      } else {
        this.hostname = url;
        this.protocol = 'http:';
      }
    }
  };
}

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});