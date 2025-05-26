import { PopupState, Template, Config, ChromeMessage, UserSettings } from './types';
import { unifiedBrowser } from './src/utils/browser-polyfill';

/**
 * Gets the currently active tab
 */
async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const tabs = await unifiedBrowser.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

/**
 * Loads and displays current user settings status
 */
async function loadSettingsStatus(): Promise<void> {
  try {
    const result = await unifiedBrowser.storage.local.get('userSettings');
    const userSettings: UserSettings = result.userSettings;

    const apiKeyStatus = document.getElementById('api-key-status') as HTMLSpanElement;
    const currentModel = document.getElementById('current-model') as HTMLSpanElement;
    const customPromptStatus = document.getElementById('custom-prompt-status') as HTMLSpanElement;

    if (userSettings && userSettings.apiKey) {
      apiKeyStatus.textContent = userSettings.apiKey.startsWith('sk-')
        ? 'Configured ✅'
        : 'Invalid ❌';
      currentModel.textContent = userSettings.model || 'gpt-4.1';
      customPromptStatus.textContent = userSettings.customPrompt ? 'Set ✅' : 'None';
    } else {
      apiKeyStatus.textContent = 'Not configured ❌';
      currentModel.textContent = 'Default (gpt-4.1)';
      customPromptStatus.textContent = 'None';
    }
  } catch (error) {
    console.error('Error loading settings status:', error);
  }
}

/**
 * Opens the extension settings page
 */
async function openSettings(): Promise<void> {
  try {
    // Try Chrome's openOptionsPage first
    if (typeof chrome !== 'undefined' && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else if (typeof browser !== 'undefined' && browser.tabs.create) {
      // Fallback for Firefox - create a new tab with options page
      await browser.tabs.create({ url: browser.runtime.getURL('options.html') });
    } else {
      // Final fallback - use window.open
      window.open(unifiedBrowser.runtime.getURL('options.html'), '_blank');
    }
  } catch (error) {
    console.error('Error opening settings:', error);
    // Final fallback - use window.open
    window.open(unifiedBrowser.runtime.getURL('options.html'), '_blank');
  }
}

let generate_button_state: PopupState = {
  isGenerating: false,
  currentEmojiIndex: 0,
  emojiInterval: 0,
};

const loadedState = localStorage.getItem('state');

if (loadedState) {
  generate_button_state = JSON.parse(loadedState) as PopupState;
}

/**
 * Starts the emoji animation for the generate button
 */
function startEmojiAnimation(): void {
  const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
  generate_button_state.isGenerating = true;
  const emoji = ['🦊', '🦊 🦊', '🦊 🦊 🦊'];

  generate_button_state.emojiInterval = window.setInterval(() => {
    generateButton.innerText = `Generating... ${emoji[generate_button_state.currentEmojiIndex]}`;
    generate_button_state.currentEmojiIndex =
      (generate_button_state.currentEmojiIndex + 1) % emoji.length;
    localStorage.setItem('state', JSON.stringify(generate_button_state));
  }, 500);
}

/**
 * Stops the emoji animation for the generate button
 */
function stopEmojiAnimation(): void {
  const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
  generate_button_state.isGenerating = false;
  clearInterval(generate_button_state.emojiInterval);
  generateButton.innerText = 'Rewrite the website!';
  localStorage.setItem('state', JSON.stringify(generate_button_state));
}

/**
 * Sets up the popup interface with templates and event listeners
 */
export function setup(tab: chrome.tabs.Tab, url: URL): Promise<void> {
  return new Promise((resolve, reject) => {
    fetch(unifiedBrowser.runtime.getURL('config.json'))
      .then(response => response.json())
      .then((data: Config) => {
        const templates = data.templates;

        unifiedBrowser.runtime.sendMessage({
          action: 'setup',
          id: tab.id,
          url: url.hostname + url.pathname,
          templates,
          key: data.api.key,
        } as ChromeMessage);

        const radio_container = document.getElementById('radio-container') as HTMLDivElement;

        Object.values(templates).forEach((template: Template) => {
          const label = document.createElement('label');
          const input = document.createElement('input');
          const span = document.createElement('span');

          input.type = 'radio';
          input.name = 'view';
          input.value = template.name;
          input.id = `view-${template.name}`;

          span.innerText = template.name;

          label.htmlFor = `view-${template.name}`;

          label.appendChild(input);
          label.appendChild(span);

          input.addEventListener('change', async () => {
            localStorage.setItem('chosen_radio', input.id);
            console.log('Sending template' + template.name);
            unifiedBrowser.runtime.sendMessage({
              action: 'set_template',
              id: tab.id,
              url: url.hostname + url.pathname,
              template,
            } as ChromeMessage);
          });

          unifiedBrowser.runtime.onMessage.addListener((message: ChromeMessage) => {
            if (message.action === 'template_cached' && message.template_name === template.name) {
              span.innerText = template.name + ' ✅';
            }

            if (message.action === 'cache_deleted' && message.template_name === template.name) {
              span.innerText = template.name;
            }
          });

          radio_container.appendChild(label);
        });

        const chosenRadio = localStorage.getItem('chosen_radio');
        if (chosenRadio) {
          const radio = document.getElementById(chosenRadio) as HTMLInputElement;
          if (radio) {
            radio.checked = true;

            const inputValue = radio.value;
            const templatesArray = Object.values(templates);

            const foundTemplate = templatesArray.find(template => template.name === inputValue);

            if (foundTemplate) {
              unifiedBrowser.runtime.sendMessage({
                action: 'set_template',
                id: tab.id,
                url: url.hostname + url.pathname,
                template: foundTemplate,
              } as ChromeMessage);
            }
          }
        }

        const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
        generateButton.addEventListener('click', async () => {
          // Check if user has configured their settings
          const settingsResult = await unifiedBrowser.storage.local.get('userSettings');
          const userSettings: UserSettings = settingsResult.userSettings;

          if (!userSettings || !userSettings.apiKey) {
            // If no user settings, fall back to config.json key
            function decodeBase64(str: string): string {
              return decodeURIComponent(
                atob(str)
                  .split('')
                  .map(c => {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                  })
                  .join('')
              );
            }

            unifiedBrowser.runtime.sendMessage({
              action: 'generate',
              id: tab.id,
              url: url.hostname + url.pathname,
              key: decodeBase64(data.api.key),
            } as ChromeMessage);
          } else {
            // Use user settings
            unifiedBrowser.runtime.sendMessage({
              action: 'generate',
              id: tab.id,
              url: url.hostname + url.pathname,
              key: '', // Background will use user settings instead
            } as ChromeMessage);
          }
        });

        // Add settings button event listener
        const settingsButton = document.getElementById('settings-button') as HTMLButtonElement;
        settingsButton.addEventListener('click', () => {
          openSettings();
        });

        // Load and display current settings status
        loadSettingsStatus();

        resolve();
      })
      .catch((error: Error) => {
        console.log('Error:', error);
        reject(error);
      });
  });
}

/**
 * Initializes the popup when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', async () => {
  const tab = await getActiveTab();
  if (!tab.url) return;

  const url = new URL(tab.url);
  setup(tab, url).then(async () => {
    unifiedBrowser.runtime.onMessage.addListener(
      (message: ChromeMessage, _sender: unknown, _sendResponse: (response?: unknown) => void) => {
        if (message.action === 'generation_initialized') {
          startEmojiAnimation();
          console.log('Generation initialized');
        }
        if (message.action === 'generation_completed') {
          stopEmojiAnimation();
          console.log('Generation completed');
        }
        if (message.action === 'settings_updated') {
          // Reload settings status when settings are updated
          loadSettingsStatus();
        }
        if (message.action === 'close_popup') {
          window.close();
        }
      }
    );

    unifiedBrowser.runtime.sendMessage({
      action: 'setup_finished',
      id: tab.id,
      url: url.hostname + url.pathname,
    } as ChromeMessage);
  });
});
