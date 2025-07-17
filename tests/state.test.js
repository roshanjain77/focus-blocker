import {
  loadStateFromStorage,
  getManualFocusEndTime,
  setManualFocusEndTime,
  clearManualFocusEndTime,
  updatePopupState,
  initializeSettings,
  getBlockedTabs,
  addBlockedTab,
  removeBlockedTab,
  clearBlockedTabs,
  Profile,
  BlockingRule,
  DomainRule,
  BlockAllRule,
  ApplicationState,
  StateRepository,
  FocusSessionRepository,
  TabRepository
} from '../state.js';

// crypto.randomUUID is mocked in setup.js

describe('loadStateFromStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should load default state when no data exists', async () => {
    chrome.storage.sync.get.mockResolvedValue({});
    
    const state = await loadStateFromStorage();
    
    expect(state).toEqual({
      isEnabled: true,
      profilesConfig: [{ name: "Manual", keyword: null }],
      processedSitesConfig: [],
      globalBlockMessage: '<h1>Site Blocked</h1><p>This site is blocked during your scheduled focus time.</p>',
      focusKeyword: '',
      redirectUrl: 'chrome-extension://test-extension-id/blocked.html',
      blockedDomains: [],
      sitesConfig: []
    });
  });

  test('should load and process stored configuration', async () => {
    const mockStoredData = {
      isEnabled: false,
      globalBlockMessage: 'Custom block message',
      profilesConfig: [
        { name: "Work", keyword: "[Work]" },
        { name: "Study", keyword: "[Study]" }
      ],
      sitesConfig: [
        { id: 'site1', domain: 'facebook.com', message: 'No Facebook!', profiles: ['Work'] },
        { id: 'site2', domain: 'youtube.com,youtu.be', message: null, profiles: ['Study'] }
      ]
    };
    
    chrome.storage.sync.get.mockResolvedValue(mockStoredData);
    
    const state = await loadStateFromStorage();
    
    expect(state.isEnabled).toBe(false);
    expect(state.globalBlockMessage).toBe('Custom block message');
    expect(state.profilesConfig).toEqual([
      { name: "Work", keyword: "[Work]" },
      { name: "Study", keyword: "[Study]" }
    ]);
    expect(state.processedSitesConfig).toEqual([
      { id: 'site1', domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [], profiles: ['Work'] },
      { id: 'site2', domain: 'youtube.com', message: null, allowedVideos: [], profiles: ['Study'] },
      { id: 'site2', domain: 'youtu.be', message: null, allowedVideos: [], profiles: ['Study'] }
    ]);
  });

  test('should handle blockAll configuration', async () => {
    const mockStoredData = {
      sitesConfig: [
        { id: 'block-all', blockAll: true, message: 'Everything blocked', profiles: ['Focus'] }
      ]
    };
    
    chrome.storage.sync.get.mockResolvedValue(mockStoredData);
    
    const state = await loadStateFromStorage();
    
    expect(state.processedSitesConfig).toEqual([
      { id: 'block-all', blockAll: true, message: 'Everything blocked', profiles: ['Focus'] }
    ]);
  });

  test('should handle missing IDs by generating new ones', async () => {
    const mockStoredData = {
      sitesConfig: [
        { domain: 'facebook.com', message: 'No Facebook!', profiles: ['Work'] }
      ]
    };
    
    chrome.storage.sync.get.mockResolvedValue(mockStoredData);
    
    const state = await loadStateFromStorage();
    
    expect(state.processedSitesConfig[0].id).toBe('test-uuid-123');
    expect(state.processedSitesConfig[0].domain).toBe('facebook.com');
    expect(state.processedSitesConfig[0].allowedVideos).toEqual([]);
  });

  test('should handle invalid domains gracefully', async () => {
    const mockStoredData = {
      sitesConfig: [
        { domain: 'invalid-domain', message: 'Invalid', profiles: ['Work'] },
        { domain: 'facebook.com', message: 'Valid', profiles: ['Work'] }
      ]
    };
    
    chrome.storage.sync.get.mockResolvedValue(mockStoredData);
    
    const state = await loadStateFromStorage();
    
    // Should only include valid domains (extractDomain returns null for 'invalid-domain')
    expect(state.processedSitesConfig).toEqual([
      { id: 'test-uuid-123', domain: 'facebook.com', message: 'Valid', allowedVideos: [], profiles: ['Work'] }
    ]);
  });

  test('should handle storage errors gracefully', async () => {
    chrome.storage.sync.get.mockRejectedValue(new Error('Storage error'));
    
    const state = await loadStateFromStorage();
    
    expect(state).toEqual({
      isEnabled: true,
      profilesConfig: [{ name: "Manual", keyword: null }],
      processedSitesConfig: [],
      globalBlockMessage: '<h1>Site Blocked</h1><p>This site is blocked during your scheduled focus time.</p>',
      focusKeyword: '',
      redirectUrl: 'chrome-extension://test-extension-id/blocked.html',
      blockedDomains: [],
      sitesConfig: []
    });
  });

  test('should handle allowed videos configuration', async () => {
    const mockStoredData = {
      sitesConfig: [
        {
          domain: 'youtube.com',
          message: 'YouTube blocked',
          allowedVideos: [
            { id: 'abc123', name: 'Educational Video' },
            { id: 'def456', name: 'Tutorial' }
          ],
          profiles: ['Study']
        }
      ]
    };
    
    chrome.storage.sync.get.mockResolvedValue(mockStoredData);
    
    const state = await loadStateFromStorage();
    
    expect(state.processedSitesConfig[0].allowedVideos).toEqual([
      { id: 'abc123', name: 'Educational Video' },
      { id: 'def456', name: 'Tutorial' }
    ]);
    expect(state.processedSitesConfig[0].domain).toBe('youtube.com');
    expect(state.processedSitesConfig[0].id).toBe('test-uuid-123');
  });
});

describe('getManualFocusEndTime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return valid future end time', async () => {
    const futureTime = Date.now() + 3600000; // 1 hour from now
    chrome.storage.local.get.mockResolvedValue({
      manualFocusEndTime: futureTime
    });
    
    const result = await getManualFocusEndTime();
    
    expect(result).toBe(futureTime);
  });

  test('should return null for past end time', async () => {
    const pastTime = Date.now() - 3600000; // 1 hour ago
    chrome.storage.local.get.mockResolvedValue({
      manualFocusEndTime: pastTime
    });
    
    const result = await getManualFocusEndTime();
    
    expect(result).toBe(null);
  });

  test('should return null when no end time set', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    
    const result = await getManualFocusEndTime();
    
    expect(result).toBe(null);
  });

  test('should handle storage errors gracefully', async () => {
    chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));
    
    const result = await getManualFocusEndTime();
    
    expect(result).toBe(null);
  });
});

describe('setManualFocusEndTime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should set manual focus end time', async () => {
    const endTime = Date.now() + 3600000;
    chrome.storage.local.set.mockResolvedValue();
    
    await setManualFocusEndTime(endTime);
    
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      manualFocusEndTime: endTime
    });
  });

  test('should handle storage errors gracefully', async () => {
    chrome.storage.local.set.mockRejectedValue(new Error('Storage error'));
    
    await expect(setManualFocusEndTime(Date.now() + 3600000)).resolves.not.toThrow();
  });
});

describe('clearManualFocusEndTime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should clear manual focus end time', async () => {
    chrome.storage.local.remove.mockResolvedValue();
    
    await clearManualFocusEndTime();
    
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('manualFocusEndTime');
  });

  test('should handle storage errors gracefully', async () => {
    chrome.storage.local.remove.mockRejectedValue(new Error('Storage error'));
    
    await expect(clearManualFocusEndTime()).resolves.not.toThrow();
  });
});

describe('updatePopupState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should update popup state with status and end time', () => {
    chrome.storage.local.set.mockResolvedValue();
    
    updatePopupState('Focus Active', 1234567890);
    
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      extensionStatus: 'Focus Active',
      manualFocusEndTime: 1234567890
    });
  });

  test('should update popup state with null end time', () => {
    chrome.storage.local.set.mockResolvedValue();
    
    updatePopupState('Focus Inactive');
    
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      extensionStatus: 'Focus Inactive',
      manualFocusEndTime: null
    });
  });

  test('should handle storage errors gracefully', () => {
    chrome.storage.local.set.mockRejectedValue(new Error('Storage error'));
    
    expect(() => updatePopupState('Test Status')).not.toThrow();
  });
});

describe('initializeSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize default settings', async () => {
    chrome.storage.sync.set.mockResolvedValue();
    
    await initializeSettings();
    
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      sitesConfig: [
        { domain: "youtube.com", message: "Maybe watch this later?" },
        { domain: "facebook.com", message: null },
        { domain: "twitter.com", message: null },
        { domain: "reddit.com", message: "Focus time! No endless scrolling." }
      ],
      globalBlockMessage: '<h1>Site Blocked</h1><p>This site is blocked during your scheduled focus time.</p>',
      focusKeyword: '[Focus]',
      isEnabled: true
    });
  });

  test('should handle storage errors gracefully', async () => {
    chrome.storage.sync.set.mockRejectedValue(new Error('Storage error'));
    
    await expect(initializeSettings()).resolves.not.toThrow();
  });
});

describe('getBlockedTabs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return blocked tabs map', async () => {
    const mockTabs = { 123: 'https://facebook.com', 456: 'https://youtube.com' };
    chrome.storage.local.get.mockResolvedValue({
      blockedTabsMap: mockTabs
    });
    
    const result = await getBlockedTabs();
    
    expect(result).toEqual(mockTabs);
  });

  test('should return empty object when no blocked tabs', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    
    const result = await getBlockedTabs();
    
    expect(result).toEqual({});
  });

  test('should handle storage errors gracefully', async () => {
    chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));
    
    const result = await getBlockedTabs();
    
    expect(result).toEqual({});
  });
});

describe('addBlockedTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should add blocked tab to map', async () => {
    const existingTabs = { 123: 'https://facebook.com' };
    chrome.storage.local.get.mockResolvedValue({ blockedTabsMap: existingTabs });
    chrome.storage.local.set.mockResolvedValue();
    
    await addBlockedTab(456, 'https://youtube.com');
    
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      blockedTabsMap: {
        123: 'https://facebook.com',
        456: 'https://youtube.com'
      }
    });
  });

  test('should handle empty blocked tabs map', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue();
    
    await addBlockedTab(123, 'https://facebook.com');
    
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      blockedTabsMap: {
        123: 'https://facebook.com'
      }
    });
  });

  test('should not add tab with missing parameters', async () => {
    await addBlockedTab(null, 'https://facebook.com');
    await addBlockedTab(123, null);
    await addBlockedTab(null, null);
    
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  test('should handle storage errors gracefully', async () => {
    chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));
    
    await expect(addBlockedTab(123, 'https://facebook.com')).resolves.not.toThrow();
  });
});

describe('removeBlockedTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should remove blocked tab from map', async () => {
    const existingTabs = { 123: 'https://facebook.com', 456: 'https://youtube.com' };
    chrome.storage.local.get.mockResolvedValue({ blockedTabsMap: existingTabs });
    chrome.storage.local.set.mockResolvedValue();
    
    await removeBlockedTab(123);
    
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      blockedTabsMap: {
        456: 'https://youtube.com'
      }
    });
  });

  test('should handle removal of non-existent tab', async () => {
    const existingTabs = { 456: 'https://youtube.com' };
    chrome.storage.local.get.mockResolvedValue({ blockedTabsMap: existingTabs });
    
    await removeBlockedTab(123);
    
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  test('should not remove tab with missing tabId', async () => {
    await removeBlockedTab(null);
    await removeBlockedTab(undefined);
    
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  test('should handle storage errors gracefully', async () => {
    chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));
    
    await expect(removeBlockedTab(123)).resolves.not.toThrow();
  });
});

describe('clearBlockedTabs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should clear all blocked tabs', async () => {
    chrome.storage.local.remove.mockResolvedValue();
    
    await clearBlockedTabs();
    
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('blockedTabsMap');
  });

  test('should handle storage errors gracefully', async () => {
    chrome.storage.local.remove.mockRejectedValue(new Error('Storage error'));
    
    await expect(clearBlockedTabs()).resolves.not.toThrow();
  });
});

// OOP Class Tests
describe('Profile', () => {
  test('should create profile with name and keyword', () => {
    const profile = new Profile('Work', '[Work]');
    expect(profile.name).toBe('Work');
    expect(profile.keyword).toBe('[Work]');
  });

  test('should create profile with default null keyword', () => {
    const profile = new Profile('Manual');
    expect(profile.name).toBe('Manual');
    expect(profile.keyword).toBe(null);
  });

  test('should convert to/from object', () => {
    const profile = new Profile('Study', '[Study]');
    const obj = profile.toObject();
    const restored = Profile.fromObject(obj);
    
    expect(obj).toEqual({ name: 'Study', keyword: '[Study]' });
    expect(restored.name).toBe('Study');
    expect(restored.keyword).toBe('[Study]');
  });
});

describe('DomainRule', () => {
  test('should create domain rule', () => {
    const rule = new DomainRule('123', ['Work'], 'facebook.com', 'No Facebook', []);
    expect(rule.id).toBe('123');
    expect(rule.profiles).toEqual(['Work']);
    expect(rule.domain).toBe('facebook.com');
    expect(rule.message).toBe('No Facebook');
    expect(rule.allowedVideos).toEqual([]);
  });

  test('should expand comma-separated domains', () => {
    const rule = new DomainRule('123', ['Work'], 'youtube.com, youtu.be', 'No YouTube', []);
    const expanded = rule.expandDomains();
    
    expect(expanded).toHaveLength(2);
    expect(expanded[0].domain).toBe('youtube.com');
    expect(expanded[1].domain).toBe('youtu.be');
    expect(expanded[0].id).toBe('123'); // Same ID for all expanded
    expect(expanded[1].id).toBe('123');
  });

  test('should filter invalid domains when expanding', () => {
    const rule = new DomainRule('123', ['Work'], 'facebook.com, invalid, google.com', 'Blocked', []);
    const expanded = rule.expandDomains();
    
    expect(expanded).toHaveLength(2);
    expect(expanded[0].domain).toBe('facebook.com');
    expect(expanded[1].domain).toBe('google.com');
  });

  test('should handle empty domain string', () => {
    const rule = new DomainRule('123', ['Work'], '', 'Empty', []);
    const expanded = rule.expandDomains();
    
    expect(expanded).toEqual([]);
  });
});

describe('BlockAllRule', () => {
  test('should create block-all rule', () => {
    const rule = new BlockAllRule('456', ['Focus'], 'Everything blocked');
    expect(rule.id).toBe('456');
    expect(rule.profiles).toEqual(['Focus']);
    expect(rule.message).toBe('Everything blocked');
    expect(rule.blockAll).toBe(true);
  });

  test('should convert to object correctly', () => {
    const rule = new BlockAllRule('456', ['Focus'], 'Everything blocked');
    const obj = rule.toObject();
    
    expect(obj).toEqual({
      id: '456',
      profiles: ['Focus'],
      message: 'Everything blocked',
      blockAll: true
    });
  });
});

describe('BlockingRule.fromObject', () => {
  test('should create DomainRule from object', () => {
    const obj = {
      id: '123',
      profiles: ['Work'],
      domain: 'facebook.com',
      message: 'No Facebook',
      allowedVideos: []
    };
    
    const rule = BlockingRule.fromObject(obj);
    expect(rule).toBeInstanceOf(DomainRule);
    expect(rule.domain).toBe('facebook.com');
  });

  test('should create BlockAllRule from object', () => {
    const obj = {
      id: '456',
      profiles: ['Focus'],
      blockAll: true,
      message: 'Everything blocked'
    };
    
    const rule = BlockingRule.fromObject(obj);
    expect(rule).toBeInstanceOf(BlockAllRule);
    expect(rule.blockAll).toBe(true);
  });

  test('should generate UUID if missing', () => {
    const obj = {
      profiles: ['Work'],
      domain: 'facebook.com'
    };
    
    const rule = BlockingRule.fromObject(obj);
    expect(rule.id).toBe('test-uuid-123');
  });
});

describe('ApplicationState', () => {
  test('should initialize with defaults', () => {
    const state = new ApplicationState();
    
    expect(state.isEnabled).toBe(true);
    expect(state.profilesConfig).toHaveLength(1);
    expect(state.profilesConfig[0].name).toBe('Manual');
    expect(state.processedSitesConfig).toEqual([]);
  });

  test('should set processed rules and expand domains', () => {
    const state = new ApplicationState();
    const rules = [
      new DomainRule('123', ['Work'], 'facebook.com,youtube.com', 'Blocked', []),
      new BlockAllRule('456', ['Focus'], 'All blocked')
    ];
    
    state.setProcessedRules(rules);
    
    expect(state.processedSitesConfig).toHaveLength(3); // 2 domains + 1 block-all
    expect(state.processedSitesConfig[0].domain).toBe('facebook.com');
    expect(state.processedSitesConfig[1].domain).toBe('youtube.com');
    expect(state.processedSitesConfig[2].blockAll).toBe(true);
  });

  test('should get rules for specific profile', () => {
    const state = new ApplicationState();
    const rules = [
      new DomainRule('123', ['Work'], 'facebook.com', 'Work blocked', []),
      new DomainRule('456', ['Study'], 'reddit.com', 'Study blocked', []),
      new DomainRule('789', ['Work', 'Study'], 'youtube.com', 'Both blocked', [])
    ];
    
    state.setProcessedRules(rules);
    
    const workRules = state.getRulesForProfile('Work');
    expect(workRules).toHaveLength(2);
    expect(workRules[0].domain).toBe('facebook.com');
    expect(workRules[1].domain).toBe('youtube.com');
  });
});

describe('StateRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should load state with defaults when storage is empty', async () => {
    chrome.storage.sync.get.mockResolvedValue({});
    
    const repository = new StateRepository();
    const state = await repository.loadState();
    
    expect(state).toBeInstanceOf(ApplicationState);
    expect(state.isEnabled).toBe(true);
    expect(state.profilesConfig[0].name).toBe('Manual');
  });

  test('should load state from storage', async () => {
    const mockData = {
      isEnabled: false,
      globalBlockMessage: 'Custom message',
      profilesConfig: [{ name: 'Work', keyword: '[Work]' }],
      sitesConfig: [{ id: '123', profiles: ['Work'], domain: 'facebook.com', message: 'Blocked' }]
    };
    
    chrome.storage.sync.get.mockResolvedValue(mockData);
    
    const repository = new StateRepository();
    const state = await repository.loadState();
    
    expect(state.isEnabled).toBe(false);
    expect(state.globalBlockMessage).toBe('Custom message');
    expect(state.profilesConfig[0].name).toBe('Work');
    expect(state.processedSitesConfig[0].domain).toBe('facebook.com');
  });

  test('should save state to storage', async () => {
    chrome.storage.sync.set.mockResolvedValue();
    
    const repository = new StateRepository();
    const state = new ApplicationState();
    state.isEnabled = false;
    state.globalBlockMessage = 'Custom';
    
    await repository.saveState(state);
    
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      isEnabled: false,
      globalBlockMessage: 'Custom',
      profilesConfig: [{ name: 'Manual', keyword: null }]
    });
  });
});

describe('FocusSessionRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should get manual focus end time', async () => {
    const endTime = Date.now() + 60000; // 1 minute in future
    chrome.storage.local.get.mockResolvedValue({ manualFocusEndTime: endTime });
    
    const repository = new FocusSessionRepository();
    const result = await repository.getManualFocusEndTime();
    
    expect(result).toBe(endTime);
  });

  test('should return null for expired end time', async () => {
    const endTime = Date.now() - 60000; // 1 minute in past
    chrome.storage.local.get.mockResolvedValue({ manualFocusEndTime: endTime });
    
    const repository = new FocusSessionRepository();
    const result = await repository.getManualFocusEndTime();
    
    expect(result).toBe(null);
  });

  test('should set manual focus end time', async () => {
    chrome.storage.local.set.mockResolvedValue();
    
    const repository = new FocusSessionRepository();
    const endTime = Date.now() + 60000;
    
    await repository.setManualFocusEndTime(endTime);
    
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ manualFocusEndTime: endTime });
  });

  test('should clear manual focus end time', async () => {
    chrome.storage.local.remove.mockResolvedValue();
    
    const repository = new FocusSessionRepository();
    await repository.clearManualFocusEndTime();
    
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('manualFocusEndTime');
  });
});

describe('TabRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should get blocked tabs', async () => {
    const mockTabs = { 123: 'https://facebook.com' };
    chrome.storage.local.get.mockResolvedValue({ blockedTabsMap: mockTabs });
    
    const repository = new TabRepository();
    const result = await repository.getBlockedTabs();
    
    expect(result).toEqual(mockTabs);
  });

  test('should add blocked tab', async () => {
    chrome.storage.local.get.mockResolvedValue({ blockedTabsMap: {} });
    chrome.storage.local.set.mockResolvedValue();
    
    const repository = new TabRepository();
    await repository.addBlockedTab(123, 'https://facebook.com');
    
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      blockedTabsMap: { 123: 'https://facebook.com' }
    });
  });

  test('should remove blocked tab', async () => {
    chrome.storage.local.get.mockResolvedValue({
      blockedTabsMap: { 123: 'https://facebook.com', 456: 'https://youtube.com' }
    });
    chrome.storage.local.set.mockResolvedValue();
    
    const repository = new TabRepository();
    await repository.removeBlockedTab(123);
    
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      blockedTabsMap: { 456: 'https://youtube.com' }
    });
  });

  test('should clear blocked tabs', async () => {
    chrome.storage.local.remove.mockResolvedValue();
    
    const repository = new TabRepository();
    await repository.clearBlockedTabs();
    
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('blockedTabsMap');
  });
});