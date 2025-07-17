import { checkAndBlockTabIfNeeded, checkExistingTabs, BrowserTab, TabBlockingService, TabManagerService, TabService, RedirectStrategyFactory } from '../tabs.js';

// Mock the state.js addBlockedTab function
const mockTabRepositoryInstance = {
  addBlockedTab: jest.fn().mockResolvedValue(),
  getBlockedTabs: jest.fn().mockResolvedValue({}),
  removeBlockedTab: jest.fn().mockResolvedValue()
};

jest.mock('../state.js', () => ({
  addBlockedTab: jest.fn().mockResolvedValue(),
  TabRepository: jest.fn().mockImplementation(() => mockTabRepositoryInstance)
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

    expect(mockTabRepositoryInstance.addBlockedTab).toHaveBeenCalledWith(123, 'https://facebook.com/profile');
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

    expect(mockTabRepositoryInstance.addBlockedTab).toHaveBeenCalledWith(123, 'https://www.facebook.com/profile');
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

    expect(mockTabRepositoryInstance.addBlockedTab).toHaveBeenCalledWith(123, 'https://example.com');
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

    expect(mockTabRepositoryInstance.addBlockedTab).not.toHaveBeenCalled();
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('should not block if URL already matches redirect URL', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    await checkAndBlockTabIfNeeded(123, 'chrome-extension://test/blocked.html', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(mockTabRepositoryInstance.addBlockedTab).not.toHaveBeenCalled();
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('should handle empty/null URLs', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    await checkAndBlockTabIfNeeded(123, '', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);
    await checkAndBlockTabIfNeeded(123, null, rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(mockTabRepositoryInstance.addBlockedTab).not.toHaveBeenCalled();
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('should handle empty redirect URL', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    await checkAndBlockTabIfNeeded(123, 'https://facebook.com', rulesForActiveProfile, mockGlobalMessage, '');

    expect(mockTabRepositoryInstance.addBlockedTab).not.toHaveBeenCalled();
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('should handle Chrome API errors gracefully', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    chrome.tabs.update.mockRejectedValue(new Error('No tab with id'));

    await checkAndBlockTabIfNeeded(123, 'https://facebook.com', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(mockTabRepositoryInstance.addBlockedTab).toHaveBeenCalledWith(123, 'https://facebook.com');
    // Should not throw error
  });

  test('should handle other Chrome API errors', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];

    chrome.tabs.update.mockRejectedValue(new Error('Unexpected error'));

    await checkAndBlockTabIfNeeded(123, 'https://facebook.com', rulesForActiveProfile, mockGlobalMessage, mockRedirectUrl);

    expect(mockTabRepositoryInstance.addBlockedTab).toHaveBeenCalledWith(123, 'https://facebook.com');
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

    expect(mockTabRepositoryInstance.addBlockedTab).not.toHaveBeenCalled();
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

    expect(mockTabRepositoryInstance.addBlockedTab).not.toHaveBeenCalled();
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
    expect(mockTabRepositoryInstance.addBlockedTab).toHaveBeenCalledWith(123, 'https://facebook.com/profile');
    expect(mockTabRepositoryInstance.addBlockedTab).toHaveBeenCalledWith(456, 'https://youtube.com/watch?v=abc');
    expect(mockTabRepositoryInstance.addBlockedTab).not.toHaveBeenCalledWith(789, 'https://google.com');
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

    expect(mockTabRepositoryInstance.addBlockedTab).toHaveBeenCalledTimes(1);
    expect(mockTabRepositoryInstance.addBlockedTab).toHaveBeenCalledWith(123, 'https://facebook.com');
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
    expect(mockTabRepositoryInstance.addBlockedTab).not.toHaveBeenCalled();
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

    // Should take at least 15ms (timing can vary in tests)
    expect(endTime - startTime).toBeGreaterThanOrEqual(15);
  });
});

// OOP Class Tests
describe('BrowserTab', () => {
  test('should create browser tab with hostname', () => {
    const tab = new BrowserTab(123, 'https://facebook.com/profile');
    
    expect(tab.id).toBe(123);
    expect(tab.url).toBe('https://facebook.com/profile');
    expect(tab.hostname).toBe('facebook.com');
  });

  test('should handle invalid URLs', () => {
    const tab = new BrowserTab(123, 'invalid-url');
    
    expect(tab.hostname).toBe(null);
  });

  test('should extract hostname correctly', () => {
    const tab = new BrowserTab(123, 'https://www.example.com:8080/path?query=value');
    
    expect(tab.hostname).toBe('www.example.com');
  });

  test('should check if tab is blockable', () => {
    expect(new BrowserTab(123, 'https://facebook.com').isBlockable()).toBe(true);
    expect(new BrowserTab(123, 'http://example.com').isBlockable()).toBe(true);
    expect(new BrowserTab(123, 'chrome://settings').isBlockable()).toBe(false);
    expect(new BrowserTab(123, 'moz-extension://test').isBlockable()).toBe(false);
    expect(new BrowserTab(null, 'https://facebook.com').isBlockable()).toBe(false);
    expect(new BrowserTab(123, null).isBlockable()).toBe(false);
  });

  test('should find matching blocking rules', () => {
    const tab = new BrowserTab(123, 'https://facebook.com');
    const rules = [
      { domain: 'youtube.com', message: 'No YouTube' },
      { domain: 'facebook.com', message: 'No Facebook' }
    ];

    const match = tab.findMatchingRule(rules);
    expect(match.domain).toBe('facebook.com');
    expect(match.message).toBe('No Facebook');
  });

  test('should prioritize block-all rules', () => {
    const tab = new BrowserTab(123, 'https://facebook.com');
    const rules = [
      { domain: 'facebook.com', message: 'No Facebook' },
      { blockAll: true, message: 'Block All' }
    ];

    const match = tab.findMatchingRule(rules);
    expect(match.blockAll).toBe(true);
    expect(match.message).toBe('Block All');
  });

  test('should handle subdomain matching', () => {
    const tab = new BrowserTab(123, 'https://www.facebook.com');
    const rules = [{ domain: 'facebook.com', message: 'No Facebook' }];

    const match = tab.findMatchingRule(rules);
    expect(match.domain).toBe('facebook.com');
  });

  test('should return null for no matches', () => {
    const tab = new BrowserTab(123, 'https://google.com');
    const rules = [{ domain: 'facebook.com', message: 'No Facebook' }];

    const match = tab.findMatchingRule(rules);
    expect(match).toBe(null);
  });
});

describe('RedirectStrategyFactory', () => {
  test('should create BlockAllRedirectStrategy for block-all rules', () => {
    const rule = { blockAll: true, message: 'All blocked' };
    const strategy = RedirectStrategyFactory.createStrategy(rule, 'chrome-extension://test/blocked.html', 'Global');
    
    expect(strategy.constructor.name).toBe('BlockAllRedirectStrategy');
  });

  test('should create DomainRedirectStrategy for domain rules', () => {
    const rule = { domain: 'facebook.com', message: 'No Facebook' };
    const strategy = RedirectStrategyFactory.createStrategy(rule, 'chrome-extension://test/blocked.html', 'Global');
    
    expect(strategy.constructor.name).toBe('DomainRedirectStrategy');
  });
});

describe('TabBlockingService', () => {
  let tabBlockingService;
  let mockTabRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTabRepository = {
      addBlockedTab: jest.fn().mockResolvedValue()
    };
    tabBlockingService = new TabBlockingService(mockTabRepository);
  });

  test('should skip blocking for already blocked pages', async () => {
    const redirectUrl = 'chrome-extension://test/blocked.html';
    const url = 'chrome-extension://test/blocked.html?message=test';
    
    await tabBlockingService.checkAndBlockTabIfNeeded(123, url, [], 'Global', redirectUrl);
    
    expect(mockTabRepository.addBlockedTab).not.toHaveBeenCalled();
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('should skip blocking for non-blockable URLs', async () => {
    await tabBlockingService.checkAndBlockTabIfNeeded(123, 'chrome://settings', [], 'Global', 'chrome-extension://test/blocked.html');
    
    expect(mockTabRepository.addBlockedTab).not.toHaveBeenCalled();
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('should block tab when rule matches', async () => {
    const rules = [{ domain: 'facebook.com', message: 'No Facebook' }];
    chrome.tabs.update.mockResolvedValue();
    
    await tabBlockingService.checkAndBlockTabIfNeeded(123, 'https://facebook.com', rules, 'Global', 'chrome-extension://test/blocked.html');
    
    expect(mockTabRepository.addBlockedTab).toHaveBeenCalledWith(123, 'https://facebook.com');
    expect(chrome.tabs.update).toHaveBeenCalledWith(123, {
      url: 'chrome-extension://test/blocked.html?message=No%20Facebook'
    });
  });

  test('should handle tab update errors gracefully', async () => {
    const rules = [{ domain: 'facebook.com', message: 'No Facebook' }];
    chrome.tabs.update.mockRejectedValue(new Error('No tab with id'));
    
    await tabBlockingService.checkAndBlockTabIfNeeded(123, 'https://facebook.com', rules, 'Global', 'chrome-extension://test/blocked.html');
    
    expect(mockTabRepository.addBlockedTab).toHaveBeenCalled();
    // Should not throw error
  });

  test('should handle non-ignorable errors', async () => {
    const rules = [{ domain: 'facebook.com', message: 'No Facebook' }];
    chrome.tabs.update.mockRejectedValue(new Error('Unexpected error'));
    
    await tabBlockingService.checkAndBlockTabIfNeeded(123, 'https://facebook.com', rules, 'Global', 'chrome-extension://test/blocked.html');
    
    expect(mockTabRepository.addBlockedTab).toHaveBeenCalled();
    // Should not throw error but log it
  });
});

describe('TabManagerService', () => {
  let tabManagerService;
  let mockTabBlockingService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTabBlockingService = {
      checkAndBlockTabIfNeeded: jest.fn().mockResolvedValue()
    };
    tabManagerService = new TabManagerService(mockTabBlockingService);
  });

  test('should check existing tabs', async () => {
    const mockTabs = [
      { id: 123, url: 'https://facebook.com' },
      { id: 456, url: 'https://youtube.com' }
    ];
    const rules = [{ domain: 'facebook.com', message: 'No Facebook' }];
    
    chrome.tabs.query.mockResolvedValue(mockTabs);
    
    await tabManagerService.checkExistingTabs(rules, 'Global', 'chrome-extension://test/blocked.html');
    
    expect(chrome.tabs.query).toHaveBeenCalledWith({});
    expect(mockTabBlockingService.checkAndBlockTabIfNeeded).toHaveBeenCalledTimes(2);
  });

  test('should handle tab query errors', async () => {
    chrome.tabs.query.mockRejectedValue(new Error('Query error'));
    
    await tabManagerService.checkExistingTabs([], 'Global', 'chrome-extension://test/blocked.html');
    
    expect(chrome.tabs.query).toHaveBeenCalled();
    // Should not throw error
  });

  test('should get blocked tabs stats', async () => {
    const mockBlockedTabs = { 123: 'https://facebook.com', 456: 'https://youtube.com' };
    mockTabRepositoryInstance.getBlockedTabs.mockResolvedValue(mockBlockedTabs);
    
    const stats = await tabManagerService.getBlockedTabsStats();
    
    expect(stats.count).toBe(2);
    expect(stats.tabs).toEqual(mockBlockedTabs);
  });

  test('should restore all blocked tabs', async () => {
    const mockBlockedTabs = { 123: 'https://facebook.com', 456: 'https://youtube.com' };
    mockTabRepositoryInstance.getBlockedTabs.mockResolvedValue(mockBlockedTabs);
    mockTabRepositoryInstance.removeBlockedTab.mockResolvedValue();
    
    chrome.tabs.update.mockResolvedValue();
    
    const restoredCount = await tabManagerService.restoreAllBlockedTabs();
    
    expect(restoredCount).toBe(2);
    expect(chrome.tabs.update).toHaveBeenCalledTimes(2);
  });

  test('should handle tab restore errors', async () => {
    const mockBlockedTabs = { 123: 'https://facebook.com' };
    mockTabRepositoryInstance.getBlockedTabs.mockResolvedValue(mockBlockedTabs);
    mockTabRepositoryInstance.removeBlockedTab.mockResolvedValue();
    
    chrome.tabs.update.mockRejectedValue(new Error('Tab not found'));
    
    const restoredCount = await tabManagerService.restoreAllBlockedTabs();
    
    expect(restoredCount).toBe(0);
    // Should still remove the stale tab from storage
  });

  test('should create delay', async () => {
    const startTime = Date.now();
    await tabManagerService.delay(50);
    const endTime = Date.now();
    
    expect(endTime - startTime).toBeGreaterThanOrEqual(50);
  });
});

describe('TabService', () => {
  let tabService;
  let mockTabManager;
  let mockTabBlocker;

  beforeEach(() => {
    mockTabManager = {
      checkExistingTabs: jest.fn().mockResolvedValue(),
      restoreAllBlockedTabs: jest.fn().mockResolvedValue(5),
      getBlockedTabsStats: jest.fn().mockResolvedValue({ count: 3, tabs: {} })
    };
    mockTabBlocker = {
      checkAndBlockTabIfNeeded: jest.fn().mockResolvedValue()
    };
    tabService = new TabService(mockTabManager, mockTabBlocker);
  });

  test('should start focus mode', async () => {
    const rules = [{ domain: 'facebook.com', message: 'No Facebook' }];
    
    await tabService.startFocusMode(rules, 'Global', 'chrome-extension://test/blocked.html');
    
    expect(mockTabManager.checkExistingTabs).toHaveBeenCalledWith(rules, 'Global', 'chrome-extension://test/blocked.html');
  });

  test('should stop focus mode', async () => {
    const restoredCount = await tabService.stopFocusMode();
    
    expect(mockTabManager.restoreAllBlockedTabs).toHaveBeenCalled();
    expect(restoredCount).toBe(5);
  });

  test('should block tab if needed', async () => {
    const rules = [{ domain: 'facebook.com', message: 'No Facebook' }];
    
    await tabService.blockTabIfNeeded(123, 'https://facebook.com', rules, 'Global', 'chrome-extension://test/blocked.html');
    
    expect(mockTabBlocker.checkAndBlockTabIfNeeded).toHaveBeenCalledWith(123, 'https://facebook.com', rules, 'Global', 'chrome-extension://test/blocked.html');
  });

  test('should get stats', async () => {
    const stats = await tabService.getStats();
    
    expect(mockTabManager.getBlockedTabsStats).toHaveBeenCalled();
    expect(stats).toEqual({ count: 3, tabs: {} });
  });
});