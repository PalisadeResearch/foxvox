/* eslint-disable @typescript-eslint/no-explicit-any */
import '@testing-library/jest-dom';

/**
 * Jest setup file for Chrome extension testing
 */

// Mock Chrome APIs
(globalThis as any).chrome = {
  runtime: {
    getURL: jest.fn((path: string) => `chrome-extension://mock-id/${path}`),
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onStartup: {
      addListener: jest.fn(),
    },
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn(),
    },
  },
  tabs: {
    query: jest.fn(),
    executeScript: jest.fn(),
    sendMessage: jest.fn(),
  },
  scripting: {
    executeScript: jest.fn(),
  },
  webNavigation: {
    onCompleted: {
      addListener: jest.fn(),
    },
  },
} as any;

// Mock browser for Firefox
(globalThis as any).browser = (globalThis as any).chrome;

// Mock DOM APIs that might not be available in jsdom
Object.defineProperty(window, 'chrome', {
  value: (globalThis as any).chrome,
  writable: true,
});

// Mock fetch for network requests
(globalThis as any).fetch = jest.fn();

// Console spy setup
const originalConsole = console;
(globalThis as any).console = {
  ...originalConsole,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});
