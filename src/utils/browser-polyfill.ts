/**
 * Browser compatibility layer for Chrome and Firefox
 * Provides a unified API interface regardless of the browser
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Detect the browser environment
export const isFirefox =
  typeof (globalThis as unknown as { browser?: unknown }).browser !== 'undefined';
export const isChrome = typeof chrome !== 'undefined' && !isFirefox;

// Create a unified browser API
export const browserAPI = (() => {
  if (
    isFirefox &&
    typeof (globalThis as unknown as { browser?: unknown }).browser !== 'undefined'
  ) {
    return (globalThis as unknown as { browser: typeof chrome }).browser;
  }
  if (isChrome && typeof chrome !== 'undefined') {
    return chrome;
  }
  throw new Error('Unsupported browser environment');
})();

/**
 * Unified storage API
 */
export const storage = {
  local: {
    get: (keys: string | string[] | null): Promise<{ [key: string]: any }> => {
      if (isFirefox) {
        return browserAPI.storage.local.get(keys);
      }
      // Chrome uses callbacks, convert to Promise
      return new Promise(resolve => {
        browserAPI.storage.local.get(keys, resolve);
      });
    },

    set: (items: { [key: string]: any }): Promise<void> => {
      if (isFirefox) {
        return browserAPI.storage.local.set(items);
      }
      // Chrome uses callbacks, convert to Promise
      return new Promise(resolve => {
        browserAPI.storage.local.set(items, resolve);
      });
    },
  },
};

/**
 * Unified tabs API
 */
export const tabs = {
  query: (queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> => {
    if (isFirefox) {
      return browserAPI.tabs.query(queryInfo);
    }
    // Chrome uses callbacks, convert to Promise
    return new Promise(resolve => {
      browserAPI.tabs.query(queryInfo, resolve);
    });
  },
};

/**
 * Unified scripting API
 */
export const scripting = {
  executeScript: (injection: any): Promise<any[]> => {
    if (isFirefox) {
      // Firefox uses tabs.executeScript for MV2
      const { target, func, args } = injection;

      // For Firefox, we need to handle function execution differently
      if (func && args) {
        // Create a self-executing function with the arguments
        const code = `
          (function() {
            const func = ${func.toString()};
            const args = ${JSON.stringify(args)};
            return func.apply(null, args);
          })();
        `;

        return browserAPI.tabs
          .executeScript(target.tabId, { code })
          .then((result: any) => [{ result: result[0] }]);
      } else if (func) {
        // Just execute the function without arguments
        const code = `(${func.toString()})()`;
        return browserAPI.tabs
          .executeScript(target.tabId, { code })
          .then((result: any) => [{ result: result[0] }]);
      } else {
        throw new Error('Function is required for script execution');
      }
    }
    // Chrome MV3 uses scripting.executeScript
    return new Promise(resolve => {
      browserAPI.scripting.executeScript(injection, resolve);
    });
  },
};

/**
 * Unified runtime API
 */
export const runtime = {
  sendMessage: (message: any): Promise<any> => {
    if (isFirefox) {
      return browserAPI.runtime.sendMessage(message);
    }
    // Chrome uses callbacks, convert to Promise
    return new Promise(resolve => {
      browserAPI.runtime.sendMessage(message, resolve);
    });
  },

  onMessage: {
    addListener: (
      callback: (message: any, sender: any, sendResponse: any) => void | Promise<any>
    ) => {
      if (isFirefox) {
        browserAPI.runtime.onMessage.addListener(callback);
      } else {
        // Chrome requires special handling for async callbacks
        browserAPI.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
          const result = callback(message, sender, sendResponse);
          if (result instanceof Promise) {
            result.then(sendResponse);
            return true; // Indicates async response
          }
          return result;
        });
      }
    },
  },

  getURL: (path: string): string => {
    return browserAPI.runtime.getURL(path);
  },
};

/**
 * Unified webNavigation API
 */
export const webNavigation = {
  onCompleted: {
    addListener: (
      callback: (details: chrome.webNavigation.WebNavigationFramedCallbackDetails) => void
    ) => {
      browserAPI.webNavigation.onCompleted.addListener(callback);
    },
  },
};

/**
 * Export the unified browser object
 */
export const unifiedBrowser = {
  storage,
  tabs,
  scripting,
  runtime,
  webNavigation,
};
