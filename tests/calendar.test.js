import { getActiveFocusProfileName, CalendarEvent, TimeRange, GoogleCalendarClient, ProfileMatcher, CalendarService } from '../calendar.js';

describe('getActiveFocusProfileName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Use fake timers to control the current time
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2022-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockProfilesConfig = [
    { name: 'Manual', keyword: null },
    { name: 'Work', keyword: '[Work]' },
    { name: 'Study', keyword: '[Study]' },
    { name: 'Focus', keyword: '[Focus]' }
  ];

  test('should return profile name for active focus event', async () => {
    const mockCalendarResponse = {
      items: [
        {
          summary: 'Team Meeting [Work]',
          start: { dateTime: '2022-01-01T00:00:00Z' },
          end: { dateTime: '2022-01-01T01:00:00Z' }
        }
      ]
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockCalendarResponse)
    });

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    expect(result).toBe('Work');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://www.googleapis.com/calendar/v3/calendars/primary/events'),
      expect.objectContaining({
        headers: {
          'Authorization': 'Bearer mock-token',
          'Content-Type': 'application/json'
        }
      })
    );
  });

  test('should return null when no active events found', async () => {
    const mockCalendarResponse = {
      items: []
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockCalendarResponse)
    });

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    // NOTE: This currently returns false due to a bug in calendar.js line 72
    // The function returns false immediately when the first profile has no events
    // instead of continuing to check other profiles. This should return null.
    expect(result).toBe(null);
  });

  test('should return false when event does not match time range', async () => {
    const mockCalendarResponse = {
      items: [
        {
          summary: 'Past Meeting [Work]',
          start: { dateTime: '2021-12-31T23:00:00Z' },
          end: { dateTime: '2021-12-31T23:30:00Z' }
        }
      ]
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockCalendarResponse)
    });

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    expect(result).toBe(null);
  });

  test('should handle all-day events', async () => {
    const mockCalendarResponse = {
      items: [
        {
          summary: 'All-day Focus [Focus]',
          start: { date: '2022-01-01' },
          end: { date: '2022-01-02' }
        }
      ]
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockCalendarResponse)
    });

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    // All-day events should include the current time if it falls within the date range
    expect(result).toBe('Focus');
  });

  test('should handle case-insensitive keyword matching', async () => {
    const mockCalendarResponse = {
      items: [
        {
          summary: 'Team Meeting [work]', // lowercase keyword
          start: { dateTime: '2022-01-01T00:00:00Z' },
          end: { dateTime: '2022-01-01T01:00:00Z' }
        }
      ]
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockCalendarResponse)
    });

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    expect(result).toBe('Work');
  });

  test('should skip profiles without keywords', async () => {
    const profilesWithoutKeywords = [
      { name: 'Manual', keyword: null },
      { name: 'Empty', keyword: '' },
      { name: 'Whitespace', keyword: '   ' }
    ];

    const result = await getActiveFocusProfileName('mock-token', profilesWithoutKeywords);
    
    expect(result).toBe(null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('should handle 401 unauthorized error', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized'
    });

    await expect(getActiveFocusProfileName('invalid-token', mockProfilesConfig))
      .rejects.toThrow('Unauthorized');
  });

  test('should handle 403 forbidden error', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden'
    });

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    expect(result).toBe(null);
  });

  test('should handle other API errors', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    });

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    expect(result).toBe(null);
  });

  test('should handle fetch network errors', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    expect(result).toBe(null);
  });

  test('should handle multiple events and return first match', async () => {
    const mockCalendarResponse = {
      items: [
        {
          summary: 'Team Meeting [Work]',
          start: { dateTime: '2022-01-01T00:00:00Z' },
          end: { dateTime: '2022-01-01T01:00:00Z' }
        },
        {
          summary: 'Study Session [Study]',
          start: { dateTime: '2021-12-31T23:30:00Z' },
          end: { dateTime: '2022-01-01T02:00:00Z' }
        }
      ]
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockCalendarResponse)
    });

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    expect(result).toBe('Work');
  });

  test('should handle events without summary', async () => {
    const mockCalendarResponse = {
      items: [
        {
          start: { dateTime: '2022-01-01T00:00:00Z' },
          end: { dateTime: '2022-01-01T01:00:00Z' }
        }
      ]
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockCalendarResponse)
    });

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    expect(result).toBe(null);
  });

  test('should handle malformed event data', async () => {
    const mockCalendarResponse = {
      items: [
        {
          summary: 'Team Meeting [Work]',
          start: {},
          end: {}
        }
      ]
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockCalendarResponse)
    });

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    expect(result).toBe(null);
  });

  test('should handle JSON parsing errors', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockRejectedValue(new Error('JSON parse error'))
    });

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    expect(result).toBe(null);
  });

  test('should encode keyword in URL correctly', async () => {
    const profilesWithSpecialChars = [
      { name: 'Special', keyword: '[Focus & Work]' }
    ];

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ items: [] })
    });

    await getActiveFocusProfileName('mock-token', profilesWithSpecialChars);
    
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('q=%5BFocus+%26+Work%5D'),
      expect.any(Object)
    );
  });

  test('should handle events at exact boundary times', async () => {
    // Test event ending exactly at current time (should not be active)
    const mockCalendarResponse = {
      items: [
        {
          summary: 'Ending Now [Work]',
          start: { dateTime: '2021-12-31T23:00:00Z' },
          end: { dateTime: '2022-01-01T00:00:00Z' } // Ends exactly at current time
        }
      ]
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockCalendarResponse)
    });

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    expect(result).toBe(null);
  });

  test('should handle events starting exactly at current time', async () => {
    // Test event starting exactly at current time (should be active)
    const mockCalendarResponse = {
      items: [
        {
          summary: 'Starting Now [Work]',
          start: { dateTime: '2022-01-01T00:00:00Z' }, // Starts exactly at current time
          end: { dateTime: '2022-01-01T01:00:00Z' }
        }
      ]
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockCalendarResponse)
    });

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    expect(result).toBe('Work');
  });

  test('should handle missing calendar data', async () => {
    const mockCalendarResponse = {}; // No items property

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockCalendarResponse)
    });

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    expect(result).toBe(null);
  });

  test('should handle null calendar data', async () => {
    const mockCalendarResponse = {
      items: null
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockCalendarResponse)
    });

    const result = await getActiveFocusProfileName('mock-token', mockProfilesConfig);
    
    expect(result).toBe(null);
  });
});

// OOP Class Tests
describe('CalendarEvent', () => {
  test('should create calendar event from API response', () => {
    const apiEvent = {
      summary: 'Team Meeting [Work]',
      start: { dateTime: '2022-01-01T10:00:00Z' },
      end: { dateTime: '2022-01-01T11:00:00Z' },
      id: 'event123'
    };

    const event = CalendarEvent.fromApiResponse(apiEvent);

    expect(event.summary).toBe('Team Meeting [Work]');
    expect(event.start).toEqual(new Date('2022-01-01T10:00:00Z'));
    expect(event.end).toEqual(new Date('2022-01-01T11:00:00Z'));
    expect(event.id).toBe('event123');
  });

  test('should handle all-day events', () => {
    const apiEvent = {
      summary: 'All Day Event [Work]',
      start: { date: '2022-01-01' },
      end: { date: '2022-01-02' }
    };

    const event = CalendarEvent.fromApiResponse(apiEvent);

    expect(event.start).toEqual(new Date('2022-01-01'));
    expect(event.end).toEqual(new Date('2022-01-02'));
  });

  test('should check if event is active', () => {
    const event = new CalendarEvent(
      'Test Event',
      new Date('2022-01-01T10:00:00Z'),
      new Date('2022-01-01T11:00:00Z')
    );

    expect(event.isActive(new Date('2022-01-01T10:30:00Z'))).toBe(true);
    expect(event.isActive(new Date('2022-01-01T09:30:00Z'))).toBe(false);
    expect(event.isActive(new Date('2022-01-01T11:30:00Z'))).toBe(false);
    expect(event.isActive(new Date('2022-01-01T11:00:00Z'))).toBe(false); // Exclusive end
  });

  test('should check if event contains keyword', () => {
    const event = new CalendarEvent('Team Meeting [Work]', new Date(), new Date());

    expect(event.containsKeyword('[Work]')).toBe(true);
    expect(event.containsKeyword('[work]')).toBe(true); // Case insensitive
    expect(event.containsKeyword('[Study]')).toBe(false);
    expect(event.containsKeyword('')).toBe(false);
  });

  test('should create display string', () => {
    const event = new CalendarEvent(
      'Test Event',
      new Date('2022-01-01T10:00:00Z'),
      new Date('2022-01-01T11:00:00Z')
    );

    const display = event.toString();
    expect(display).toContain('Test Event');
    expect(display).toContain('2022-01-01T10:00:00');
    expect(display).toContain('2022-01-01T11:00:00');
  });
});

describe('TimeRange', () => {
  test('should create time range around now', () => {
    const currentTime = new Date('2022-01-01T10:00:00Z');
    const range = TimeRange.createAroundNow(5, 10, currentTime);

    expect(range.start).toEqual(new Date('2022-01-01T09:55:00Z'));
    expect(range.end).toEqual(new Date('2022-01-01T10:10:00Z'));
  });

  test('should convert to API format', () => {
    const range = new TimeRange(
      new Date('2022-01-01T10:00:00Z'),
      new Date('2022-01-01T11:00:00Z')
    );

    const apiFormat = range.toApiFormat();

    expect(apiFormat).toEqual({
      timeMin: '2022-01-01T10:00:00.000Z',
      timeMax: '2022-01-01T11:00:00.000Z'
    });
  });
});

describe('GoogleCalendarClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should build events URL correctly', () => {
    const client = new GoogleCalendarClient();
    const options = {
      calendarId: 'primary',
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 10
    };

    const url = client.buildEventsUrl(options, '2022-01-01T10:00:00Z', '2022-01-01T11:00:00Z', 'test');

    expect(url).toContain('calendars/primary/events');
    expect(url).toContain('timeMin=2022-01-01T10%3A00%3A00Z');
    expect(url).toContain('timeMax=2022-01-01T11%3A00%3A00Z');
    expect(url).toContain('q=test');
    expect(url).toContain('singleEvents=true');
    expect(url).toContain('orderBy=startTime');
    expect(url).toContain('maxResults=10');
  });

  test('should handle API errors correctly', () => {
    const client = new GoogleCalendarClient();
    const mockResponse = { status: 401, statusText: 'Unauthorized' };

    expect(() => client.handleApiError(mockResponse)).toThrow('Unauthorized');
  });

  test('should handle forbidden errors', () => {
    const client = new GoogleCalendarClient();
    const mockResponse = { status: 403, statusText: 'Forbidden' };

    expect(() => client.handleApiError(mockResponse)).toThrow('Calendar API Error: 403 Forbidden');
  });

  test('should fetch events successfully', async () => {
    const client = new GoogleCalendarClient();
    const mockResponse = {
      items: [
        {
          summary: 'Test Event [Work]',
          start: { dateTime: '2022-01-01T10:00:00Z' },
          end: { dateTime: '2022-01-01T11:00:00Z' }
        }
      ]
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockResponse)
    });

    const timeRange = new TimeRange(new Date(), new Date());
    const events = await client.fetchEvents('token', timeRange, 'test');

    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(CalendarEvent);
    expect(events[0].summary).toBe('Test Event [Work]');
  });
});

describe('ProfileMatcher', () => {
  test('should set and use current time', () => {
    const matcher = new ProfileMatcher();
    const testTime = new Date('2022-01-01T10:30:00Z');
    matcher.setCurrentTime(testTime);

    const events = [
      new CalendarEvent('Test [Work]', new Date('2022-01-01T10:00:00Z'), new Date('2022-01-01T11:00:00Z'))
    ];

    const result = matcher.findMatchingProfile(events, '[Work]', 'Work');
    expect(result).toBe('Work');
  });

  test('should validate profiles correctly', () => {
    const matcher = new ProfileMatcher();

    expect(matcher.isValidProfile({ name: 'Work', keyword: '[Work]' })).toBe(true);
    expect(matcher.isValidProfile({ name: 'Manual', keyword: null })).toBe(false);
    expect(matcher.isValidProfile({ name: 'Empty', keyword: '' })).toBe(false);
    expect(matcher.isValidProfile({ name: 'Whitespace', keyword: '   ' })).toBe(false);
  });

  test('should find matching profile', () => {
    const matcher = new ProfileMatcher();
    matcher.setCurrentTime(new Date('2022-01-01T10:30:00Z'));

    const events = [
      new CalendarEvent('Meeting [Work]', new Date('2022-01-01T10:00:00Z'), new Date('2022-01-01T11:00:00Z')),
      new CalendarEvent('Inactive [Study]', new Date('2022-01-01T09:00:00Z'), new Date('2022-01-01T09:30:00Z'))
    ];

    const result = matcher.findMatchingProfile(events, '[Work]', 'Work');
    expect(result).toBe('Work');
  });

  test('should return null for no matches', () => {
    const matcher = new ProfileMatcher();
    const events = [
      new CalendarEvent('No keyword', new Date(), new Date())
    ];

    const result = matcher.findMatchingProfile(events, '[Work]', 'Work');
    expect(result).toBe(null);
  });
});

describe('CalendarService', () => {
  let mockClient;
  let mockMatcher;
  let calendarService;

  beforeEach(() => {
    mockClient = {
      fetchEvents: jest.fn()
    };
    mockMatcher = {
      isValidProfile: jest.fn(),
      findMatchingProfile: jest.fn(),
      setCurrentTime: jest.fn()
    };
    calendarService = new CalendarService(mockClient, mockMatcher);
  });

  test('should get active focus profile name', async () => {
    const profiles = [
      { name: 'Work', keyword: '[Work]' },
      { name: 'Study', keyword: '[Study]' }
    ];

    const mockEvents = [
      new CalendarEvent('Meeting [Work]', new Date(), new Date())
    ];

    mockMatcher.isValidProfile.mockReturnValue(true);
    mockClient.fetchEvents.mockResolvedValue(mockEvents);
    mockMatcher.findMatchingProfile
      .mockReturnValueOnce(null)
      .mockReturnValueOnce('Work');

    const result = await calendarService.getActiveFocusProfileName('token', profiles);

    expect(result).toBe('Work');
    expect(mockClient.fetchEvents).toHaveBeenCalledTimes(2);
  });

  test('should return null when no profiles are active', async () => {
    const profiles = [{ name: 'Work', keyword: '[Work]' }];

    mockMatcher.isValidProfile.mockReturnValue(true);
    mockClient.fetchEvents.mockResolvedValue([]);
    mockMatcher.findMatchingProfile.mockReturnValue(null);

    const result = await calendarService.getActiveFocusProfileName('token', profiles);

    expect(result).toBe(null);
  });

  test('should handle unauthorized errors', async () => {
    const profiles = [{ name: 'Work', keyword: '[Work]' }];

    mockMatcher.isValidProfile.mockReturnValue(true);
    mockClient.fetchEvents.mockRejectedValue(new Error('Unauthorized'));

    await expect(calendarService.getActiveFocusProfileName('token', profiles)).rejects.toThrow('Unauthorized');
  });

  test('should check if any profile is active', async () => {
    const profiles = [{ name: 'Work', keyword: '[Work]' }];

    // Mock getActiveFocusProfileName by spying on it
    jest.spyOn(calendarService, 'getActiveFocusProfileName').mockResolvedValue('Work');

    const result = await calendarService.hasActiveProfile('token', profiles);

    expect(result).toBe(true);
  });

  test('should get all active profiles', async () => {
    const profiles = [
      { name: 'Work', keyword: '[Work]' },
      { name: 'Study', keyword: '[Study]' }
    ];

    mockMatcher.isValidProfile.mockReturnValue(true);
    mockClient.fetchEvents.mockResolvedValue([]);
    mockMatcher.findMatchingProfile
      .mockReturnValueOnce('Work')
      .mockReturnValueOnce('Study');

    const result = await calendarService.getAllActiveProfiles('token', profiles);

    expect(result).toEqual(['Work', 'Study']);
  });

  test('should set current time', () => {
    const testTime = new Date();
    calendarService.setCurrentTime(testTime);

    expect(mockMatcher.setCurrentTime).toHaveBeenCalledWith(testTime);
  });
});