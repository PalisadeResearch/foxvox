import { PopupState, Template, Templates, Config, ChromeMessage } from "./types.js";

/**
 * Gets the currently active tab
 */
function getActiveTab(callback: (tab: chrome.tabs.Tab) => void): void {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs: chrome.tabs.Tab[]) {
        callback(tabs[0]);
    });
}

let generate_button_state: PopupState = {
    isGenerating: false,
    currentEmojiIndex: 0,
    emojiInterval: 0
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
        generate_button_state.currentEmojiIndex = (generate_button_state.currentEmojiIndex + 1) % emoji.length;
        localStorage.setItem("state", JSON.stringify(generate_button_state));
    }, 500);
}

/**
 * Stops the emoji animation for the generate button
 */
function stopEmojiAnimation(): void {
    const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
    generate_button_state.isGenerating = false;
    clearInterval(generate_button_state.emojiInterval);
    generateButton.innerText = "Rewrite the website!";
    localStorage.setItem("state", JSON.stringify(generate_button_state));
}

/**
 * Sets up the popup interface with templates and event listeners
 */
export function setup(tab: chrome.tabs.Tab, url: URL): Promise<void> {
    return new Promise((resolve, reject) => {
        fetch(chrome.runtime.getURL('/config.json'))
            .then(response => response.json())
            .then((data: Config) => {
                const templates = data.templates;

                chrome.runtime.sendMessage({
                    action: "setup",
                    id: tab.id,
                    url: url.hostname + url.pathname,
                    templates: templates,
                    key: data.api.key
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
                        console.log("Sending template" + template.name);
                        chrome.runtime.sendMessage({
                            action: "set_template",
                            id: tab.id,
                            url: url.hostname + url.pathname,
                            template: template,
                        } as ChromeMessage);
                    });

                    chrome.runtime.onMessage.addListener((message: ChromeMessage) => {
                        if (message.action === "template_cached" && message.template_name === template.name) {
                            span.innerText = template.name + ' ✅';
                        }

                        if (message.action === "cache_deleted" && message.template_name === template.name) {
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
                            chrome.runtime.sendMessage({
                                action: "set_template",
                                id: tab.id,
                                url: url.hostname + url.pathname,
                                template: foundTemplate,
                            } as ChromeMessage);
                        }
                    }
                }

                const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
                generateButton.addEventListener('click', async () => {
                    function decodeBase64(str: string): string {
                        return decodeURIComponent(atob(str).split('').map(function (c) {
                            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                        }).join(''));
                    }

                    chrome.runtime.sendMessage({
                        action: "generate",
                        id: tab.id,
                        url: url.hostname + url.pathname,
                        key: decodeBase64(data.api.key)
                    } as ChromeMessage);
                });

                const openAIKeyInput = document.getElementById('openAIKey') as HTMLInputElement;
                openAIKeyInput.addEventListener('input', function () {
                    let openAIKeyValue = openAIKeyInput.value;

                    if (openAIKeyValue === 'undefined' || openAIKeyValue === '') {
                        openAIKeyValue = "insert your own OpenAI API key";
                    }

                    console.log("Setting new openAI key..." + openAIKeyValue);

                    chrome.runtime.sendMessage({
                        action: "push_openai_to_background",
                        key: openAIKeyValue,
                        url: url.hostname + url.pathname
                    } as ChromeMessage);
                });

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
document.addEventListener('DOMContentLoaded', async function () {
    getActiveTab(function (tab: chrome.tabs.Tab) {
        if (!tab.url) return;
        
        const url = new URL(tab.url);
        setup(tab, url).then(async () => {
            chrome.runtime.onMessage.addListener((message: ChromeMessage, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
                if (message.action === "generation_initialized") {
                    startEmojiAnimation();
                    console.log("Generation initialized");
                }
                if (message.action === "generation_completed") {
                    stopEmojiAnimation();
                    console.log("Generation completed");
                }
                if (message.action === "push_openai_to_popup") {
                    console.log("OpenAI set!: " + message.openai);
                    const openAIKeyInput = document.getElementById('openAIKey') as HTMLInputElement;
                    if (openAIKeyInput && message.openai) {
                        openAIKeyInput.value = message.openai;
                    }
                }
                if (message.action === "close_popup") {
                    window.close();
                }
            });

            chrome.runtime.sendMessage({
                action: "setup_finished",
                id: tab.id,
                url: url.hostname + url.pathname,
            } as ChromeMessage);
        });
    });
}); 