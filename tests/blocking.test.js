import { updateBlockingRules, DNRService, BlockingService, DomainRuleGenerator, BlockAllRuleGenerator, RuleGeneratorFactory } from '../blocking.js';

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

// OOP Class Tests
describe('DomainRuleGenerator', () => {
  const generator = new DomainRuleGenerator('chrome-extension://test/blocked.html', 'Global message');

  test('should generate domain rules correctly', () => {
    const rule = { domain: 'facebook.com', message: 'No Facebook!', allowedVideos: [] };
    const rules = generator.generateRules(rule, 0);

    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe(1000);
    expect(rules[0].priority).toBe(1);
    expect(rules[0].action.redirect.url).toBe('chrome-extension://test/blocked.html?message=No%20Facebook!');
    expect(rules[0].condition.urlFilter).toBe('||facebook.com^');
  });

  test('should skip invalid domains', () => {
    const rule = { domain: '', message: 'Empty domain', allowedVideos: [] };
    const rules = generator.generateRules(rule, 0);

    expect(rules).toEqual([]);
  });

  test('should respect max blocked sites limit', () => {
    const rule = { domain: 'facebook.com', message: 'Blocked', allowedVideos: [] };
    const rules = generator.generateRules(rule, 101); // Over limit

    expect(rules).toEqual([]);
  });

  test('should handle YouTube domains with allowed videos', () => {
    const rule = {
      domain: 'youtube.com',
      message: 'YouTube blocked',
      allowedVideos: [{ id: 'abc123', name: 'Educational Video' }]
    };
    const rules = generator.generateRules(rule, 0);

    expect(rules[0].action.redirect.url).toContain('allowedVideos=');
    expect(rules[0].action.redirect.url).toContain(encodeURIComponent(JSON.stringify(rule.allowedVideos)));
  });

  test('should create redirect URL correctly', () => {
    const url = generator.createRedirectUrl('Custom message', { param: 'value' });
    expect(url).toBe('chrome-extension://test/blocked.html?message=Custom%20message&param=value');
  });

  test('should detect YouTube domains', () => {
    expect(generator.isYouTubeDomain('youtube.com')).toBe(true);
    expect(generator.isYouTubeDomain('youtu.be')).toBe(true);
    expect(generator.isYouTubeDomain('facebook.com')).toBe(false);
  });
});

describe('BlockAllRuleGenerator', () => {
  const generator = new BlockAllRuleGenerator('chrome-extension://test/blocked.html', 'Global message');

  test('should generate block-all rules correctly', () => {
    const rule = { blockAll: true, message: 'Everything blocked!' };
    const rules = generator.generateRules(rule, 0);

    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe(1000);
    expect(rules[0].priority).toBe(2); // Higher priority than domain rules
    expect(rules[0].action.redirect.url).toBe('chrome-extension://test/blocked.html?message=Everything%20blocked!');
    expect(rules[0].condition.urlFilter).toBe('|http*://*/*');
  });

  test('should use global message when rule message is null', () => {
    const rule = { blockAll: true, message: null };
    const rules = generator.generateRules(rule, 0);

    expect(rules[0].action.redirect.url).toBe('chrome-extension://test/blocked.html?message=Global%20message');
  });
});

describe('RuleGeneratorFactory', () => {
  test('should create BlockAllRuleGenerator for block-all rules', () => {
    const rule = { blockAll: true };
    const generator = RuleGeneratorFactory.createGenerator(rule, 'url', 'message');
    
    expect(generator).toBeInstanceOf(BlockAllRuleGenerator);
  });

  test('should create DomainRuleGenerator for domain rules', () => {
    const rule = { domain: 'facebook.com' };
    const generator = RuleGeneratorFactory.createGenerator(rule, 'url', 'message');
    
    expect(generator).toBeInstanceOf(DomainRuleGenerator);
  });
});

describe('DNRService', () => {
  let dnrService;

  beforeEach(() => {
    jest.clearAllMocks();
    dnrService = new DNRService();
  });

  test('should get existing focus rule IDs', async () => {
    const mockRules = [
      { id: 1000, priority: 1 },
      { id: 1001, priority: 1 },
      { id: 2000, priority: 1 } // Outside focus range
    ];
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue(mockRules);

    const ruleIds = await dnrService.getExistingFocusRuleIds();

    expect(ruleIds).toEqual([1000, 1001]);
  });

  test('should generate rules to add for block-all', () => {
    const rules = [{ blockAll: true, message: 'All blocked' }];
    const rulesToAdd = dnrService.generateRulesToAdd(true, rules, 'Global', 'chrome-extension://test/blocked.html');

    expect(rulesToAdd).toHaveLength(1);
    expect(rulesToAdd[0].priority).toBe(2); // Block-all priority
  });

  test('should generate rules to add for domain rules', () => {
    const rules = [
      { domain: 'facebook.com', message: 'No Facebook' },
      { domain: 'youtube.com', message: null }
    ];
    const rulesToAdd = dnrService.generateRulesToAdd(true, rules, 'Global', 'chrome-extension://test/blocked.html');

    expect(rulesToAdd).toHaveLength(2);
    expect(rulesToAdd[0].condition.urlFilter).toBe('||facebook.com^');
    expect(rulesToAdd[1].condition.urlFilter).toBe('||youtube.com^');
  });

  test('should return empty array when blocking disabled', () => {
    const rules = [{ domain: 'facebook.com', message: 'Blocked' }];
    const rulesToAdd = dnrService.generateRulesToAdd(false, rules, 'Global', 'chrome-extension://test/blocked.html');

    expect(rulesToAdd).toEqual([]);
  });

  test('should apply rule changes atomically', async () => {
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();

    const existingIds = [1000, 1001];
    const newRules = [{ id: 1000, priority: 1, action: {}, condition: {} }];

    await dnrService.applyRuleChanges(existingIds, newRules);

    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: existingIds,
      addRules: newRules
    });
  });

  test('should handle rule update errors', async () => {
    chrome.declarativeNetRequest.updateSessionRules.mockRejectedValue(
      new Error('MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES exceeded')
    );

    await expect(dnrService.updateBlockingRules(true, [{ domain: 'facebook.com' }], 'Global', 'chrome-extension://test/blocked.html')).rejects.toThrow('Rule Limit Exceeded');
  });

  test('should clear all rules', async () => {
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue([
      { id: 1000, priority: 1 },
      { id: 1001, priority: 1 }
    ]);
    chrome.declarativeNetRequest.updateSessionRules.mockResolvedValue();

    await dnrService.clearAllRules();

    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [1000, 1001],
      addRules: []
    });
  });

  test('should get current rules', async () => {
    const mockRules = [{ id: 1000, priority: 1 }];
    chrome.declarativeNetRequest.getSessionRules.mockResolvedValue(mockRules);

    const rules = await dnrService.getCurrentRules();

    expect(rules).toEqual(mockRules);
  });
});

describe('BlockingService', () => {
  let blockingService;
  let mockDnrService;

  beforeEach(() => {
    mockDnrService = {
      updateBlockingRules: jest.fn(),
      getCurrentRules: jest.fn()
    };
    blockingService = new BlockingService(mockDnrService);
  });

  test('should enable blocking', async () => {
    const rules = [{ domain: 'facebook.com', message: 'Blocked' }];
    
    await blockingService.enableBlocking(rules, 'Global', 'chrome-extension://test/blocked.html');

    expect(mockDnrService.updateBlockingRules).toHaveBeenCalledWith(
      true, rules, 'Global', 'chrome-extension://test/blocked.html'
    );
  });

  test('should disable blocking', async () => {
    await blockingService.disableBlocking();

    expect(mockDnrService.updateBlockingRules).toHaveBeenCalledWith(false, [], '', '');
  });

  test('should update profile blocking', async () => {
    const allRules = [
      { domain: 'facebook.com', profiles: ['Work'] },
      { domain: 'reddit.com', profiles: ['Study'] },
      { domain: 'youtube.com', profiles: ['Work', 'Study'] }
    ];

    await blockingService.updateProfileBlocking('Work', allRules, 'Global', 'url');

    expect(mockDnrService.updateBlockingRules).toHaveBeenCalledWith(
      true,
      [
        { domain: 'facebook.com', profiles: ['Work'] },
        { domain: 'youtube.com', profiles: ['Work', 'Study'] }
      ],
      'Global',
      'url'
    );
  });

  test('should disable blocking when no rules for profile', async () => {
    const allRules = [{ domain: 'facebook.com', profiles: ['Other'] }];

    await blockingService.updateProfileBlocking('Work', allRules, 'Global', 'url');

    expect(mockDnrService.updateBlockingRules).toHaveBeenCalledWith(false, [], '', '');
  });

  test('should get blocking status', async () => {
    const mockRules = [
      { id: 1000, priority: 1 },
      { id: 1001, priority: 1 },
      { id: 2000, priority: 1 } // Outside focus range
    ];
    mockDnrService.getCurrentRules.mockResolvedValue(mockRules);

    const status = await blockingService.getBlockingStatus();

    expect(status).toEqual({
      isBlocking: true,
      ruleCount: 2,
      rules: [
        { id: 1000, priority: 1 },
        { id: 1001, priority: 1 }
      ]
    });
  });
});