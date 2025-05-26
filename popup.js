function getActiveTab(callback) {
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        callback(tabs[0]);
    });
}

let generate_button_state = {
    isGenerating: false,
    currentEmojiIndex: 0,
    emojiInterval: 0
};

const loadedState = localStorage.getItem('state');

if (loadedState) {
    generate_button_state = JSON.parse(loadedState);
}

function startEmojiAnimation() {
    let generateButton = document.getElementById('generate-button');
    generate_button_state.isGenerating = true;
    const emoji = ['🦊', '🦊 🦊', '🦊 🦊 🦊'];

    generate_button_state.emojiInterval = setInterval(() => {
        generateButton.innerText = `Generating... ${emoji[generate_button_state.currentEmojiIndex]}`;
        generate_button_state.currentEmojiIndex = (generate_button_state.currentEmojiIndex + 1) % emoji.length;
        localStorage.setItem("state", JSON.stringify(generate_button_state));
    }, 500);
}

function stopEmojiAnimation() {
    let generateButton = document.getElementById('generate-button');
    generate_button_state.isGenerating = false;
    clearInterval(generate_button_state.emojiInterval);
    generateButton.innerText = "Rewrite the website!";
    localStorage.setItem("state", JSON.stringify(generate_button_state));
}

export function setup(tab, url) {
    return new Promise((resolve, reject) => {
        fetch(chrome.runtime.getURL('/config.json'))
            .then(response => response.json())
            .then(data => {
                const templates = data.templates

                chrome.runtime.sendMessage({
                    action: "setup",
                    id: tab.id,
                    url: url.hostname + url.pathname,
                    templates: templates,
                    key: data.api.key
                });

                let radio_container = document.getElementById('radio-container');

                Object.values(templates).forEach(template => {
                    let label = document.createElement('label');
                    let input = document.createElement('input');
                    let span = document.createElement('span');

                    input.type = 'radio';
                    input.name = 'view';
                    input.value = template.name;
                    input.id = `view-${template.name}`;

                    span.innerText = template.name;

                    label.htmlFor = `view-${template.name}`;

                    label.appendChild(input);
                    label.appendChild(span);

                    input.addEventListener('change', async () => {
                        localStorage.setItem('chosen_radio', input.id)
                        console.log("Sending template" + template.name)
                        chrome.runtime.sendMessage({
                            action: "set_template",
                            id: tab.id,
                            url: url.hostname + url.pathname,
                            template: template,
                        });
                    });

                    chrome.runtime.onMessage.addListener((message) => {
                        if (message.action === "template_cached" && message.template_name === template.name) {
                            span.innerText = template.name + ' ✅'
                        }

                        if (message.action === "cache_deleted" && message.template_name === template.name) {
                            span.innerText = template.name
                        }
                    });

                    radio_container.appendChild(label);
                });

                if (localStorage.getItem('chosen_radio')) {
                    const radio = document.getElementById(localStorage.getItem('chosen_radio'))
                    radio.checked = true;

                    let inputValue = radio.value; // Get the value from input
                    let templatesArray = Object.values(templates); // Convert object to array

                    let foundTemplate = templatesArray.find(template => template.name === inputValue);

                    chrome.runtime.sendMessage({
                        action: "set_template",
                        id: tab.id,
                        url: url.hostname + url.pathname,
                        template: foundTemplate,
                    });
                }


                document.getElementById('generate-button').addEventListener('click', async () => {
                    function decodeBase64(str) {
                        return decodeURIComponent(atob(str).split('').map(function(c) {
                            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                        }).join(''));
                    }

                    chrome.runtime.sendMessage({action: "generate", id: tab.id, url: url.hostname + url.pathname, key: decodeBase64(data.api.key)})
                });

                document.getElementById('openAIKey').addEventListener('input', function () {
                    let openAIKeyValue = document.getElementById('openAIKey').value;

                    if (openAIKeyValue === 'undefined' || openAIKeyValue === '') {
                        openAIKeyValue = "insert your own OpenAI API key";
                    }

                    console.log("Setting new openAI key..." + openAIKeyValue)

                    chrome.runtime.sendMessage({
                        action: "push_openai_to_background",
                        key: openAIKeyValue,
                        url: url.hostname + url.pathname
                    })
                });

            })
            .catch((error) => {
                console.log('Error:', error)
                reject(error);
            });

        resolve();
    })
}

document.addEventListener('DOMContentLoaded', async function () {
    getActiveTab(function (tab) {
        const url = new URL(tab.url);
        setup(tab, url).then(async () => {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.action === "generation_initialized") {
                    startEmojiAnimation();
                    console.log("Generation initialized");
                }
                if (message.action === "generation_completed") {
                    stopEmojiAnimation();
                    console.log("Generation completed");
                }
                if (message.action === "push_openai_to_popup") {
                    console.log("OpenAI set!: " + message.openai)
                    document.getElementById('openAIKey').value = message.openai;
                }
                if (message.action === "close_popup") {
                    window.close()
                }
            });

            chrome.runtime.sendMessage({
                action: "setup_finished",
                id: tab.id,
                url: url.hostname + url.pathname,
            })
        });
    })
});


/*
--###--
Event listeners
--###--
*/
