import { updateBlockingRules } from '../blocking.js';

describe('updateBlockingRules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should remove all rules when blocking is disabled', async () => {
    const existingRules = [
      { id: 1000, priority: 1 },
      { id: 1001, priority: 1 },
      { id: 1002, priority: 1 }
    ];
    
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue(existingRules);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();
    
    await updateBlockingRules(false, [], 'Global message', 'chrome-extension://test/blocked.html');
    
    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [1000, 1001, 1002],
      addRules: []
    });
  });

  test('should create rules for specific domains', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] },
      { domain: 'youtube.com', message: null, allowedVideos: [] }
    ];
    
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([]);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();
    
    await updateBlockingRules(true, rulesForActiveProfile, 'Global message', 'chrome-extension://test/blocked.html');
    
    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [],
      addRules: [
        {
          id: 1000,
          priority: 1,
          action: {
            type: 'redirect',
            redirect: {
              url: 'chrome-extension://test/blocked.html?message=No%20Facebook!'
            }
          },
          condition: {
            urlFilter: '||facebook.com^',
            excludedInitiatorDomains: ['test-extension-id'],
            resourceTypes: ['main_frame']
          }
        },
        {
          id: 1001,
          priority: 1,
          action: {
            type: 'redirect',
            redirect: {
              url: 'chrome-extension://test/blocked.html?message=Global%20message'
            }
          },
          condition: {
            urlFilter: '||youtube.com^',
            excludedInitiatorDomains: ['test-extension-id'],
            resourceTypes: ['main_frame']
          }
        }
      ]
    });
  });

  test('should create block all rule when blockAll is true', async () => {
    const rulesForActiveProfile = [
      { blockAll: true, message: 'Everything blocked!' }
    ];
    
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([]);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();
    
    await updateBlockingRules(true, rulesForActiveProfile, 'Global message', 'chrome-extension://test/blocked.html');
    
    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [],
      addRules: [
        {
          id: 1000,
          priority: 2,
          action: {
            type: 'redirect',
            redirect: {
              url: 'chrome-extension://test/blocked.html?message=Everything%20blocked!'
            }
          },
          condition: {
            urlFilter: '|http*://*/*',
            excludedInitiatorDomains: ['test-extension-id'],
            resourceTypes: ['main_frame']
          }
        }
      ]
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
    
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([]);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();
    
    await updateBlockingRules(true, rulesForActiveProfile, 'Global message', 'chrome-extension://test/blocked.html');
    
    const expectedAllowedVideos = encodeURIComponent(JSON.stringify([
      { id: 'abc123', name: 'Educational Video' },
      { id: 'def456', name: 'Tutorial' }
    ]));
    
    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [],
      addRules: [
        {
          id: 1000,
          priority: 1,
          action: {
            type: 'redirect',
            redirect: {
              url: `chrome-extension://test/blocked.html?message=YouTube%20blocked&allowedVideos=${expectedAllowedVideos}`
            }
          },
          condition: {
            urlFilter: '||youtube.com^',
            excludedInitiatorDomains: ['test-extension-id'],
            resourceTypes: ['main_frame']
          }
        }
      ]
    });
  });

  test('should handle youtu.be domain with allowed videos', async () => {
    const rulesForActiveProfile = [
      {
        domain: 'youtu.be',
        message: 'YouTube blocked',
        allowedVideos: [
          { id: 'abc123', name: 'Educational Video' }
        ]
      }
    ];
    
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([]);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();
    
    await updateBlockingRules(true, rulesForActiveProfile, 'Global message', 'chrome-extension://test/blocked.html');
    
    const expectedAllowedVideos = encodeURIComponent(JSON.stringify([
      { id: 'abc123', name: 'Educational Video' }
    ]));
    
    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [],
      addRules: [
        {
          id: 1000,
          priority: 1,
          action: {
            type: 'redirect',
            redirect: {
              url: `chrome-extension://test/blocked.html?message=YouTube%20blocked&allowedVideos=${expectedAllowedVideos}`
            }
          },
          condition: {
            urlFilter: '||youtu.be^',
            excludedInitiatorDomains: ['test-extension-id'],
            resourceTypes: ['main_frame']
          }
        }
      ]
    });
  });

  test('should handle redirect URL with existing query parameters', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];
    
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([]);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();
    
    await updateBlockingRules(true, rulesForActiveProfile, 'Global message', 'chrome-extension://test/blocked.html?existing=param');
    
    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [],
      addRules: [
        {
          id: 1000,
          priority: 1,
          action: {
            type: 'redirect',
            redirect: {
              url: 'chrome-extension://test/blocked.html?message=No%20Facebook!'
            }
          },
          condition: {
            urlFilter: '||facebook.com^',
            excludedInitiatorDomains: ['test-extension-id'],
            resourceTypes: ['main_frame']
          }
        }
      ]
    });
  });

  test('should respect MAX_BLOCKED_SITES limit', async () => {
    const rulesForActiveProfile = Array.from({ length: 150 }, (_, i) => ({
      domain: `example${i}.com`,
      message: `Site ${i} blocked`,
      allowedVideos: []
    }));
    
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([]);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();
    
    await updateBlockingRules(true, rulesForActiveProfile, 'Global message', 'chrome-extension://test/blocked.html');
    
    const call = chrome.declarativeNetRequest.updateSessionRules.mock.calls[0][0];
    expect(call.addRules).toHaveLength(100); // MAX_BLOCKED_SITES = 100
  });

  test('should skip invalid site entries', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'Valid site', allowedVideos: [] },
      { domain: '', message: 'Empty domain', allowedVideos: [] },
      { domain: null, message: 'Null domain', allowedVideos: [] },
      { domain: undefined, message: 'Undefined domain', allowedVideos: [] },
      { domain: 'twitter.com', message: 'Another valid site', allowedVideos: [] }
    ];
    
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([]);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();
    
    await updateBlockingRules(true, rulesForActiveProfile, 'Global message', 'chrome-extension://test/blocked.html');
    
    const call = chrome.declarativeNetRequest.updateSessionRules.mock.calls[0][0];
    expect(call.addRules).toHaveLength(2); // Only valid domains
    expect(call.addRules[0].condition.urlFilter).toBe('||facebook.com^');
    expect(call.addRules[1].condition.urlFilter).toBe('||twitter.com^');
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
    
    // Create a circular reference to cause JSON.stringify to fail
    rulesForActiveProfile[0].allowedVideos[0].circular = rulesForActiveProfile[0].allowedVideos[0];
    
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([]);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();
    
    await updateBlockingRules(true, rulesForActiveProfile, 'Global message', 'chrome-extension://test/blocked.html');
    
    const call = chrome.declarativeNetRequest.updateSessionRules.mock.calls[0][0];
    expect(call.addRules[0].action.redirect.url).toBe('chrome-extension://test/blocked.html?message=YouTube%20blocked');
  });

  test('should handle Chrome API errors', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];
    
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([]);
    chrome.declarativeNetRequest.updateSessionRules.mockRejectedValue(new Error('API Error'));
    
    await expect(updateBlockingRules(true, rulesForActiveProfile, 'Global message', 'chrome-extension://test/blocked.html'))
      .rejects.toThrow('API Error');
  });

  test('should handle rule limit exceeded error', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];
    
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([]);
    chrome.declarativeNetRequest.updateSessionRules.mockRejectedValue(
      new Error('MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES exceeded')
    );
    
    await expect(updateBlockingRules(true, rulesForActiveProfile, 'Global message', 'chrome-extension://test/blocked.html'))
      .rejects.toThrow('Rule Limit Exceeded');
  });

  test('should handle missing redirect URL', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];
    
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([]);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();
    
    await updateBlockingRules(true, rulesForActiveProfile, 'Global message', null);
    
    // When redirect URL is null, no rules should be added and since no existing rules, no update call
    expect(chrome.declarativeNetRequest.updateSessionRules).not.toHaveBeenCalled();
  });

  test('should handle empty rules array', async () => {
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([]);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();
    
    await updateBlockingRules(true, [], 'Global message', 'chrome-extension://test/blocked.html');
    
    // With empty rules array and no existing rules, no update call should be made
    expect(chrome.declarativeNetRequest.updateSessionRules).not.toHaveBeenCalled();
  });

  test('should replace existing rules', async () => {
    const existingRules = [
      { id: 1000, priority: 1 },
      { id: 1001, priority: 1 },
      { id: 1002, priority: 1 }
    ];
    
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] }
    ];
    
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue(existingRules);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();
    
    await updateBlockingRules(true, rulesForActiveProfile, 'Global message', 'chrome-extension://test/blocked.html');
    
    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [1000, 1001, 1002],
      addRules: [
        {
          id: 1000,
          priority: 1,
          action: {
            type: 'redirect',
            redirect: {
              url: 'chrome-extension://test/blocked.html?message=No%20Facebook!'
            }
          },
          condition: {
            urlFilter: '||facebook.com^',
            excludedInitiatorDomains: ['test-extension-id'],
            resourceTypes: ['main_frame']
          }
        }
      ]
    });
  });

  test('should handle rules with fallback to global message', async () => {
    const rulesForActiveProfile = [
      { domain: 'facebook.com', message: '', allowedVideos: [] }
    ];
    
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([]);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();
    
    await updateBlockingRules(true, rulesForActiveProfile, 'Global message', 'chrome-extension://test/blocked.html');
    
    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [],
      addRules: [
        {
          id: 1000,
          priority: 1,
          action: {
            type: 'redirect',
            redirect: {
              url: 'chrome-extension://test/blocked.html?message=Global%20message'
            }
          },
          condition: {
            urlFilter: '||facebook.com^',
            excludedInitiatorDomains: ['test-extension-id'],
            resourceTypes: ['main_frame']
          }
        }
      ]
    });
  });

  test('should handle blockAll with null message', async () => {
    const rulesForActiveProfile = [
      { blockAll: true, message: null }
    ];
    
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([]);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();
    
    await updateBlockingRules(true, rulesForActiveProfile, 'Global message', 'chrome-extension://test/blocked.html');
    
    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [],
      addRules: [
        {
          id: 1000,
          priority: 2,
          action: {
            type: 'redirect',
            redirect: {
              url: 'chrome-extension://test/blocked.html?message=Global%20message'
            }
          },
          condition: {
            urlFilter: '|http*://*/*',
            excludedInitiatorDomains: ['test-extension-id'],
            resourceTypes: ['main_frame']
          }
        }
      ]
    });
  });
});