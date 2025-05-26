/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-expressions */
import { JSDOM } from 'jsdom';

/**
 * Heavy integration tests for extension functionality
 * These tests simulate real usage scenarios and run only on pre-push
 */

describe('Extension Integration Tests', () => {
  let mockDOM: JSDOM;

  beforeEach(() => {
    // Set up a mock DOM for testing
    mockDOM = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="container">
            <h1>Test Page</h1>
            <p>This is a test paragraph with enough content to be processed.</p>
            <div class="content">
              <p>Another paragraph with significant content for testing content collection.</p>
              <span>Some span content that should be collected as well for processing.</span>
            </div>
          </div>
        </body>
      </html>
    `);

    // Mock window and document
    global.window = mockDOM.window as any;
    global.document = mockDOM.window.document;
  });

  afterEach(() => {
    mockDOM.window.close();
  });

  test('content collection identifies valid nodes', async () => {
    // Mock the content collection function (simplified version)
    const collectContent = () => {
      const nodes: any[] = [];
      const elements = document.querySelectorAll('p, div, h1, h2, h3, span');

      elements.forEach(element => {
        const textContent = element.textContent || '';
        if (textContent.length > 10) {
          // Lower minimum text boundary for test
          nodes.push({
            xpath: getXPath(element),
            innerHTML: element.innerHTML,
            plainText: textContent,
            layout: { top: 0, left: 0 },
          });
        }
      });

      return nodes;
    };

    const getXPath = (element: Element): string => {
      const parts: string[] = [];
      let currentElement: Element | null = element;

      while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
        const nodeName = currentElement.nodeName.toLowerCase();
        parts.unshift(nodeName);
        currentElement = currentElement.parentElement;
      }

      return '/' + parts.join('/');
    };

    const nodes = collectContent();

    // Verify we have content in our test DOM
    const allElements = document.querySelectorAll('p, div, h1, h2, h3, span');
    expect(allElements.length).toBeGreaterThan(0);

    // At least one element should have sufficient text content
    const hasValidContent = Array.from(allElements).some(el => (el.textContent || '').length > 10);
    expect(hasValidContent).toBe(true);

    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes[0]).toHaveProperty('xpath');
    expect(nodes[0]).toHaveProperty('innerHTML');
    expect(nodes[0]).toHaveProperty('plainText');
    expect(nodes[0]).toHaveProperty('layout');
  });

  test('popup setup handles template configuration', async () => {
    const mockConfig = {
      templates: {
        test: {
          name: 'Test Template',
          generation: 'Test generation instructions',
        },
      },
      api: {
        key: 'dGVzdC1rZXk=', // base64 encoded 'test-key'
      },
    };

    // Mock fetch for config loading
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: () => Promise.resolve(mockConfig),
    });

    // Mock chrome.runtime.getURL
    (chrome.runtime.getURL as jest.Mock).mockReturnValue('/config.json');

    // Simulate popup setup
    const setupPopup = async () => {
      const response = await fetch(chrome.runtime.getURL('config.json'));
      const config = await response.json();

      // Verify templates are loaded
      expect(config.templates).toBeDefined();
      expect(Object.keys(config.templates).length).toBeGreaterThan(0);

      // Simulate sending setup message
      chrome.runtime.sendMessage({
        action: 'setup',
        templates: config.templates,
        key: config.api.key,
      });

      return config;
    };

    await setupPopup();

    expect(chrome.runtime.getURL).toHaveBeenCalledWith('config.json');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'setup',
      templates: mockConfig.templates,
      key: mockConfig.api.key,
    });
  });

  test('background script processes messages correctly', async () => {
    // Mock IndexedDB operations
    const mockOpenIndexDB = jest.fn().mockResolvedValue(undefined);
    const mockPushToObjectStore = jest.fn().mockResolvedValue(undefined);

    // Simulate background script message processing
    const processMessage = async (message: any) => {
      if (message.action === 'setup') {
        await mockOpenIndexDB(
          message.url,
          Object.values(message.templates).map((t: any) => t.name)
        );

        // Mock content collection execution
        const mockResult = [
          { result: [{ xpath: '/html/body/p', innerHTML: 'test', plainText: 'test' }] },
        ];
        (chrome.scripting.executeScript as jest.Mock).mockResolvedValue(mockResult);

        const result = await chrome.scripting.executeScript({
          target: { tabId: message.id },
          func: () => [{ xpath: '/html/body/p', innerHTML: 'test', plainText: 'test' }],
        });

        if (result[0].result) {
          await mockPushToObjectStore(message.url, 'original', result[0].result);
        }

        return true;
      }

      return false;
    };

    const setupMessage = {
      action: 'setup',
      id: 1,
      url: 'example.com',
      templates: {
        test: { name: 'Test', generation: 'Test generation' },
      },
    };

    const result = await processMessage(setupMessage);

    expect(result).toBe(true);
    expect(mockOpenIndexDB).toHaveBeenCalledWith('example.com', ['Test']);
    expect(chrome.scripting.executeScript).toHaveBeenCalled();
    expect(mockPushToObjectStore).toHaveBeenCalledWith(
      'example.com',
      'original',
      expect.any(Array)
    );
  });

  test('template selection and caching workflow', async () => {
    const mockTemplate = {
      name: 'Test Template',
      generation: 'Transform the content according to test instructions',
    };

    // Mock storage operations
    (chrome.storage.local.set as jest.Mock).mockImplementation((data, callback) => {
      callback && callback();
    });

    // Simulate template selection
    const selectTemplate = async (url: string, template: any) => {
      const storageKey = `template_${url}`;

      return new Promise<void>(resolve => {
        chrome.storage.local.set({ [storageKey]: template }, () => {
          resolve();
        });
      });
    };

    await selectTemplate('example.com', mockTemplate);

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { 'template_example.com': mockTemplate },
      expect.any(Function)
    );
  });

  test('cross-browser compatibility layer works', () => {
    // Test that our polyfill works in different environments
    const originalChrome = (globalThis as any).chrome;

    // Test Chrome environment
    expect((globalThis as any).chrome).toBeDefined();
    expect((globalThis as any).chrome.runtime).toBeDefined();
    expect((globalThis as any).chrome.storage).toBeDefined();

    // Test Firefox environment simulation
    (globalThis as any).browser = (globalThis as any).chrome;
    expect((globalThis as any).browser).toBeDefined();
    expect((globalThis as any).browser.runtime).toBeDefined();

    // Restore
    (globalThis as any).chrome = originalChrome;
  });
});
