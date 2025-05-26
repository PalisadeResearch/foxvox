import { unifiedBrowser } from './src/utils/browser-polyfill';

/**
 * User settings interface
 */
interface UserSettings {
  apiKey: string;
  model: string;
  customPrompt: string;
  maxTokens: number;
}

/**
 * Default settings
 */
const DEFAULT_SETTINGS: UserSettings = {
  apiKey: '',
  model: 'gpt-4o',
  customPrompt: '',
  maxTokens: 4000,
};

/**
 * Settings page controller
 */
class OptionsPage {
  private form: HTMLFormElement;
  private statusMessage: HTMLElement;

  constructor() {
    this.form = document.getElementById('settingsForm') as HTMLFormElement;
    this.statusMessage = document.getElementById('statusMessage') as HTMLElement;

    this.init();
  }

  /**
   * Initialize the options page
   */
  private async init(): Promise<void> {
    await this.loadSettings();
    this.attachEventListeners();
  }

  /**
   * Load settings from storage and populate form
   */
  private async loadSettings(): Promise<void> {
    try {
      const stored = await unifiedBrowser.storage.local.get('userSettings');
      const settings: UserSettings = stored.userSettings || DEFAULT_SETTINGS;

      // Populate form fields
      (document.getElementById('apiKey') as HTMLInputElement).value = settings.apiKey;
      (document.getElementById('model') as HTMLSelectElement).value = settings.model;
      (document.getElementById('customPrompt') as HTMLTextAreaElement).value =
        settings.customPrompt;
      (document.getElementById('maxTokens') as HTMLSelectElement).value =
        settings.maxTokens.toString();
    } catch (error) {
      console.error('Error loading settings:', error);
      this.showMessage('Error loading settings', 'error');
    }
  }

  /**
   * Save settings to storage
   */
  private async saveSettings(settings: UserSettings): Promise<void> {
    try {
      await unifiedBrowser.storage.local.set({ userSettings: settings });
      this.showMessage('Settings saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showMessage('Error saving settings', 'error');
    }
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    // Form submission
    this.form.addEventListener('submit', e => {
      e.preventDefault();
      this.handleFormSubmit();
    });

    // Reset button
    document.getElementById('resetBtn')?.addEventListener('click', () => {
      this.resetToDefaults();
    });

    // API key validation on blur
    document.getElementById('apiKey')?.addEventListener('blur', e => {
      const apiKey = (e.target as HTMLInputElement).value;
      this.validateApiKey(apiKey);
    });

    // Model selection change
    document.getElementById('model')?.addEventListener('change', e => {
      const model = (e.target as HTMLSelectElement).value;
      this.updateModelInfo(model);
    });
  }

  /**
   * Handle form submission
   */
  private async handleFormSubmit(): Promise<void> {
    const formData = new FormData(this.form);

    const settings: UserSettings = {
      apiKey: formData.get('apiKey') as string,
      model: formData.get('model') as string,
      customPrompt: formData.get('customPrompt') as string,
      maxTokens: parseInt(formData.get('maxTokens') as string),
    };

    // Validate settings
    if (!this.validateSettings(settings)) {
      return;
    }

    await this.saveSettings(settings);
  }

  /**
   * Validate settings before saving
   */
  private validateSettings(settings: UserSettings): boolean {
    // API key validation
    if (!settings.apiKey.trim()) {
      this.showMessage('API key is required', 'error');
      return false;
    }

    if (!this.validateApiKey(settings.apiKey)) {
      return false;
    }

    // Model validation
    const validModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    if (!validModels.includes(settings.model)) {
      this.showMessage('Invalid model selected', 'error');
      return false;
    }

    // Max tokens validation
    if (settings.maxTokens < 100 || settings.maxTokens > 10000) {
      this.showMessage('Max tokens must be between 100 and 10000', 'error');
      return false;
    }

    return true;
  }

  /**
   * Validate API key format
   */
  private validateApiKey(apiKey: string): boolean {
    const trimmedKey = apiKey.trim();

    // Check if it starts with sk- and has reasonable length
    if (!trimmedKey.startsWith('sk-') || trimmedKey.length < 20) {
      this.showMessage('API key must start with "sk-" and be at least 20 characters long', 'error');
      return false;
    }

    return true;
  }

  /**
   * Update model information display
   */
  private updateModelInfo(model: string): void {
    // This could be expanded to show dynamic model-specific information
    console.log(`Model selected: ${model}`);
  }

  /**
   * Reset form to default values
   */
  private async resetToDefaults(): Promise<void> {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      await this.saveSettings(DEFAULT_SETTINGS);
      await this.loadSettings();
    }
  }

  /**
   * Show status message to user
   */
  private showMessage(message: string, type: 'success' | 'error'): void {
    this.statusMessage.textContent = message;
    this.statusMessage.className = `status-message status-${type}`;
    this.statusMessage.style.display = 'block';

    // Hide message after 5 seconds
    setTimeout(() => {
      this.statusMessage.style.display = 'none';
    }, 5000);
  }
}

/**
 * Initialize options page when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
  new OptionsPage();
});

/**
 * Export settings interface for use in other modules
 */
export type { UserSettings };
