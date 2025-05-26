import { unifiedBrowser, isChrome, isFirefox } from '../../src/utils/browser-polyfill';

/**
 * Unit tests for browser polyfill
 */

describe('Browser Polyfill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('detects Chrome environment correctly', () => {
    // Since we're in a test environment with mocked chrome
    expect(typeof isChrome).toBe('boolean');
    expect(typeof isFirefox).toBe('boolean');
  });

  test('provides unified browser API', () => {
    expect(unifiedBrowser).toBeDefined();
    expect(unifiedBrowser.storage).toBeDefined();
    expect(unifiedBrowser.tabs).toBeDefined();
    expect(unifiedBrowser.scripting).toBeDefined();
    expect(unifiedBrowser.runtime).toBeDefined();
    expect(unifiedBrowser.webNavigation).toBeDefined();
  });

  test('storage API works correctly', async () => {
    const mockData = { test: 'value' };
    (chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
      if (callback) callback(mockData);
    });

    const result = await unifiedBrowser.storage.local.get('test');
    expect(result).toEqual(mockData);
    expect(chrome.storage.local.get).toHaveBeenCalledWith('test', expect.any(Function));
  });

  test('tabs API works correctly', async () => {
    const mockTabs = [{ id: 1, url: 'https://example.com' }];
    (chrome.tabs.query as jest.Mock).mockImplementation((queryInfo, callback) => {
      if (callback) callback(mockTabs);
    });

    const result = await unifiedBrowser.tabs.query({ active: true });
    expect(result).toEqual(mockTabs);
    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true }, expect.any(Function));
  });

  test('runtime.getURL works correctly', () => {
    const testPath = 'config.json';
    const result = unifiedBrowser.runtime.getURL(testPath);
    expect(chrome.runtime.getURL).toHaveBeenCalledWith(testPath);
    expect(result).toBe(`chrome-extension://mock-id/${testPath}`);
  });

  test('runtime.sendMessage works correctly', async () => {
    const mockMessage = { action: 'test' };
    (chrome.runtime.sendMessage as jest.Mock).mockImplementation((message, callback) => {
      if (callback) callback({ success: true });
    });

    const result = await unifiedBrowser.runtime.sendMessage(mockMessage);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(mockMessage, expect.any(Function));
    expect(result).toEqual({ success: true });
  });

  test('scripting API works correctly', async () => {
    const mockInjection = {
      target: { tabId: 1 },
      func: () => 'test',
      args: ['arg1'],
    };
    const mockResult = [{ result: 'test' }];

    // Mock both Chrome MV3 and Firefox MV2 APIs
    (chrome.scripting.executeScript as jest.Mock).mockImplementation((injection, callback) => {
      if (callback) callback(mockResult);
    });

    (chrome.tabs.executeScript as jest.Mock).mockImplementation((tabId, details, callback) => {
      if (callback) callback(['test']);
      return Promise.resolve(['test']);
    });

    const result = await unifiedBrowser.scripting.executeScript(mockInjection);
    expect(result).toEqual(mockResult);
  });
});
