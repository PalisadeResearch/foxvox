import { UserSettings } from '../../types';

describe('Popup generation logging', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    document.body.innerHTML = `
      <div id="radio-container"></div>
      <button id="generate-button"></button>
      <button id="settings-button"></button>
      <span id="api-key-status"></span>
      <span id="current-model"></span>
      <span id="custom-prompt-status"></span>`;
  });

  test.each(['configured', 'fallback'])('%s credentials are sent but never logged', async mode => {
    const apiKey = 'sk-test-only-private-key-sentinel';
    const customPrompt = 'test-only-private-prompt-sentinel';
    const settings: UserSettings = {
      apiKey,
      customPrompt,
      model: 'test-model',
      maxTokens: 100,
    };
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({
      userSettings: mode === 'configured' ? settings : undefined,
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({ templates: {}, api: { key: btoa(apiKey) } }),
    });

    // Exercise setup directly without allowing automatic popup startup.
    const startupListener = jest.spyOn(document, 'addEventListener').mockImplementation(() => {});
    const { setup } = await import('../../popup');
    startupListener.mockRestore();
    await setup({ id: 7 } as chrome.tabs.Tab, new URL('https://example.test/article'));
    document.getElementById('generate-button')!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'generate',
      id: 7,
      url: 'example.test/article',
      key: apiKey,
    });
    const output = JSON.stringify((console.log as jest.Mock).mock.calls);
    expect(output).not.toContain(apiKey);
    expect(output).not.toContain(customPrompt);
    expect(output).not.toContain(btoa(apiKey));
    // Config is read through mocked fetch; no model client or background worker runs.
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
