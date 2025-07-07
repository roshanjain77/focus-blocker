import { checkAndBlockTabIfNeeded, checkExistingTabs } from '../tabs.js';

// Mock the state.js addBlockedTab function
jest.mock('../state.js', () => ({
  addBlockedTab: jest.fn().mockResolvedValue()
}));

import { addBlockedTab } from '../state.js';

describe('checkAndBlockTabIfNeeded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockGlobalMessage = 'Site blocked during focus time';
  const mockRedirectUrl = 'chrome-extension://test/blocked.html';

  test('should block tab with specific domain rule', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    chrome.tabs.update.mockResolvedValue();

    await checkAndBlockTabIfNeeded(123, 'https://facebook.com/profile', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(addBlockedTab).toHaveBeenCalledWith(123, 'https://facebook.com/profile');
    expect(chrome.tabs.update).toHaveBeenCalledWith(123, {
      url: 'chrome-extension://test/blocked.html?message=No%20Facebook!'
    });
  });

  test('should block tab with subdomain match', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    chrome.tabs.update.mockResolvedValue();

    await checkAndBlockTabIfNeeded(123, 'https://www.facebook.com/profile', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(addBlockedTab).toHaveBeenCalledWith(123, 'https://www.facebook.com/profile');
    expect(chrome.tabs.update).toHaveBeenCalledWith(123, {
      url: 'chrome-extension://test/blocked.html?message=No%20Facebook!'
    });
  });

  test('should block tab with block all rule', async () => {
    const rulesForActiveProfile = [
      { blockAll: true, message: 'Everything blocked!' }
    ];

    chrome.tabs.update.mockResolvedValue();

    await checkAndBlockTabIfNeeded(123, 'https://example.com', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(addBlockedTab).toHaveBeenCalledWith(123, 'https://example.com');
    expect(chrome.tabs.update).toHaveBeenCalledWith(123, {
      url: 'chrome-extension://test/blocked.html?message=Everything%20blocked!'
    });
  });

  test('should use global message when rule message is null', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: null, allowedVideos: [] }
    ];

    chrome.tabs.update.mockResolvedValue();

    await checkAndBlockTabIfNeeded(123, 'https://facebook.com', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(chrome.tabs.update).toHaveBeenCalledWith(123, {
      url: 'chrome-extension://test/blocked.html?message=Site%20blocked%20during%20focus%20time'
    });
  });

  test('should handle YouTube allowed videos', async () => {
    const rulesForActiveProfile = [
      {
        domain: 'youtube.com',
        message: 'YouTube blocked',
        allowedVideos: [
          { id: 'abc123', name: 'Educational Video' },
          { id: 'def456', name: 'Tutorial' }
        ]
      }
    ];

    chrome.tabs.update.mockResolvedValue();

    await checkAndBlockTabIfNeeded(123, 'https://youtube.com/watch?v=xyz', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    const expectedAllowedVideos = encodeURIComponent(JSON.stringify([
      { id: 'abc123', name: 'Educational Video' },
      { id: 'def456', name: 'Tutorial' }
    ]));

    expect(chrome.tabs.update).toHaveBeenCalledWith(123, {
      url: `chrome-extension://test/blocked.html?message=YouTube%20blocked&allowedVideos=${expectedAllowedVideos}`
    });
  });

  test('should handle youtu.be allowed videos', async () => {
    const rulesForActiveProfile = [
      {
        domain: 'youtu.be',
        message: 'YouTube blocked',
        allowedVideos: [
          { id: 'abc123', name: 'Educational Video' }
        ]
      }
    ];

    chrome.tabs.update.mockResolvedValue();

    await checkAndBlockTabIfNeeded(123, 'https://youtu.be/abc123', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    const expectedAllowedVideos = encodeURIComponent(JSON.stringify([
      { id: 'abc123', name: 'Educational Video' }
    ]));

    expect(chrome.tabs.update).toHaveBeenCalledWith(123, {
      url: `chrome-extension://test/blocked.html?message=YouTube%20blocked&allowedVideos=${expectedAllowedVideos}`
    });
  });

  test('should not block non-matching URLs', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    await checkAndBlockTabIfNeeded(123, 'https://google.com', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(addBlockedTab).not.toHaveBeenCalled();
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('should not block if URL already matches redirect URL', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    await checkAndBlockTabIfNeeded(123, 'chrome-extension://test/blocked.html', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(addBlockedTab).not.toHaveBeenCalled();
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('should handle empty/null URLs', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    await checkAndBlockTabIfNeeded(123, '', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);
    await checkAndBlockTabIfNeeded(123, null, rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(addBlockedTab).not.toHaveBeenCalled();
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('should handle empty redirect URL', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    await checkAndBlockTabIfNeeded(123, 'https://facebook.com', rulesForActiveProfile, mockGlobalMessage, '');

    expect(addBlockedTab).not.toHaveBeenCalled();
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('should handle Chrome API errors gracefully', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    chrome.tabs.update.mockRejectedValue(new Error('No tab with id'));

    await checkAndBlockTabIfNeeded(123, 'https://facebook.com', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(addBlockedTab).toHaveBeenCalledWith(123, 'https://facebook.com');
    // Should not throw error
  });

  test('should handle other Chrome API errors', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    chrome.tabs.update.mockRejectedValue(new Error('Unexpected error'));

    await checkAndBlockTabIfNeeded(123, 'https://facebook.com', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(addBlockedTab).toHaveBeenCalledWith(123, 'https://facebook.com');
    // Should not throw error
  });

  test('should handle JSON stringify errors for allowed videos', async () => {
    const rulesForActiveProfile = [
      {
        domain: 'youtube.com',
        message: 'YouTube blocked',
        allowedVideos: [
          { id: 'abc123', name: 'Video', circular: null }
        ]
      }
    ];

    // Create circular reference
    rulesForActiveProfile[0].allowedVideos[0].circular = rulesForActiveProfile[0].allowedVideos[0];

    chrome.tabs.update.mockResolvedValue();

    await checkAndBlockTabIfNeeded(123, 'https://youtube.com', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(chrome.tabs.update).toHaveBeenCalledWith(123, {
      url: 'chrome-extension://test/blocked.html?message=YouTube%20blocked'
    });
  });

  test('should handle malformed URLs in tab check', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    await checkAndBlockTabIfNeeded(123, 'not-a-url', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(addBlockedTab).not.toHaveBeenCalled();
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('should handle block all rule with null message', async () => {
    const rulesForActiveProfile = [
      { blockAll: true, message: null }
    ];

    chrome.tabs.update.mockResolvedValue();

    await checkAndBlockTabIfNeeded(123, 'https://example.com', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(chrome.tabs.update).toHaveBeenCalledWith(123, {
      url: 'chrome-extension://test/blocked.html?message=Site%20blocked%20during%20focus%20time'
    });
  });

  test('should handle rules without domain property', async () => {
    const rulesForActiveProfile = [
      { message: 'No domain rule', allowedVideos: [] }
    ];

    await checkAndBlockTabIfNeeded(123, 'https://facebook.com', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(addBlockedTab).not.toHaveBeenCalled();
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('should handle case sensitivity correctly', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    chrome.tabs.update.mockResolvedValue();

    await checkAndBlockTabIfNeeded(123, 'https://FACEBOOK.COM', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(chrome.tabs.update).toHaveBeenCalledWith(123, {
      url: 'chrome-extension://test/blocked.html?message=No%20Facebook!'
    });
  });
});

describe('checkExistingTabs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should check and block existing tabs', async () => {
    const mockTabs = [
      { id: 123, url: 'https://facebook.com/profile' },
      { id: 456, url: 'https://youtube.com/watch?v=abc' },
      { id: 789, url: 'https://google.com' }
    ];

    const sitesConfig = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] },
      { domain: 'youtube.com', message: null, allowedVideos: [] }
    ];

    chrome.tabs.query.mockResolvedValue(mockTabs);
    chrome.tabs.update.mockResolvedValue();

    await checkExistingTabs(sitesConfig, 'Global message', 'chrome-extension://test/blocked.html');

    expect(chrome.tabs.query).toHaveBeenCalledWith({});
    expect(addBlockedTab).toHaveBeenCalledWith(123, 'https://facebook.com/profile');
    expect(addBlockedTab).toHaveBeenCalledWith(456, 'https://youtube.com/watch?v=abc');
    expect(addBlockedTab).not.toHaveBeenCalledWith(789, 'https://google.com');
  });

  test('should handle tabs without ID or URL', async () => {
    const mockTabs = [
      { id: 123, url: 'https://facebook.com' },
      { id: null, url: 'https://youtube.com' },
      { id: 456, url: null },
      { url: 'https://twitter.com' }
    ];

    const sitesConfig = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    chrome.tabs.query.mockResolvedValue(mockTabs);
    chrome.tabs.update.mockResolvedValue();

    await checkExistingTabs(sitesConfig, 'Global message', 'chrome-extension://test/blocked.html');

    expect(addBlockedTab).toHaveBeenCalledTimes(1);
    expect(addBlockedTab).toHaveBeenCalledWith(123, 'https://facebook.com');
  });

  test('should handle Chrome API errors', async () => {
    chrome.tabs.query.mockRejectedValue(new Error('API Error'));

    await checkExistingTabs([], 'Global message', 'chrome-extension://test/blocked.html');

    expect(chrome.tabs.query).toHaveBeenCalledWith({});
    // Should not throw error
  });

  test('should handle empty tabs array', async () => {
    chrome.tabs.query.mockResolvedValue([]);

    await checkExistingTabs([], 'Global message', 'chrome-extension://test/blocked.html');

    expect(chrome.tabs.query).toHaveBeenCalledWith({});
    expect(addBlockedTab).not.toHaveBeenCalled();
  });

  test('should add delay between tab checks', async () => {
    const mockTabs = [
      { id: 123, url: 'https://facebook.com' },
      { id: 456, url: 'https://youtube.com' }
    ];

    const sitesConfig = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] },
      { domain: 'youtube.com', message: null, allowedVideos: [] }
    ];

    chrome.tabs.query.mockResolvedValue(mockTabs);
    chrome.tabs.update.mockResolvedValue();

    const startTime = Date.now();
    await checkExistingTabs(sitesConfig, 'Global message', 'chrome-extension://test/blocked.html');
    const endTime = Date.now();

    // Should take at least 30ms (2 tabs * 15ms delay)
    expect(endTime - startTime).toBeGreaterThanOrEqual(30);
  });
});