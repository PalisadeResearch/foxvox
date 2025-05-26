/**
 * Global type declarations for Jest test environment
 */

declare global {
  // eslint-disable-next-line no-var
  var chrome: typeof chrome;
  // eslint-disable-next-line no-var
  var browser: typeof chrome;
  // eslint-disable-next-line no-var
  var fetch: jest.MockedFunction<typeof fetch>;
  // eslint-disable-next-line no-var
  var console: Console & {
    log: jest.MockedFunction<typeof console.log>;
    warn: jest.MockedFunction<typeof console.warn>;
    error: jest.MockedFunction<typeof console.error>;
  };

  namespace NodeJS {
    interface Global {
      chrome: typeof chrome;
      browser: typeof chrome;
      fetch: jest.MockedFunction<typeof fetch>;
      console: Console & {
        log: jest.MockedFunction<typeof console.log>;
        warn: jest.MockedFunction<typeof console.warn>;
        error: jest.MockedFunction<typeof console.error>;
      };
    }
  }
}

export {};
