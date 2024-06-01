import {CoT} from './generation.js';
import {Template} from "./templates.js";
import {cluster} from "./cluster.js";
import templates from './config.json';
import {addData, getAllData, openDatabase} from './indexedDB.js';

document.getElementById("openAIKey").addEventListener("input", function () {
    const apiKey = document.getElementById("openAIKey").value;
    if (apiKey) {
        localStorage.setItem("OpenAI_API_KEY", apiKey);
        document.getElementById("status").textContent = "API key saved!";
    } else {
        document.getElementById("status").textContent = "Please enter a valid API key.";
    }
    setTimeout(() => {
        document.getElementById("status").textContent = '';
    }, 2000);
});

function getApiKey() {
    return localStorage.getItem("OpenAI_API_KEY");
}

document.addEventListener('DOMContentLoaded', function () {
    const apiKeyInput = document.getElementById('openAIKey');

    const storedApiKey = getApiKey()
    if (storedApiKey) {
        apiKeyInput.value = storedApiKey;
    }
});

const DB_PREFIX = 'templateDatabase_';
const CLUSTER_DB_NAME_PREFIX = 'clustersDatabase_';
const ORIGINAL_DB_NAME_PREFIX = 'originalDatabase_';
const CLUSTER_STORE_NAME = 'clusters';
const NODE_STORE_NAME = 'paired';

function getCurrentTabHostname(callback) {
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        const url = new URL(tabs[0].url);
        callback(url.hostname);
    });
}

let templateTypes = Object.keys(templates.templates);

let templatesArr = templateTypes.map(templateType => {
    let templateData = templates.templates[templateType];
    return new Template(templateData.name, {"role": "system", "content": templateData.generation}, {
        "role": "system",
        "content": templateData.critic
    });
});

function clearObjectStore(dbName, storeName) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName);

        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(storeName, 'readwrite');
            const objectStore = transaction.objectStore(storeName);

            objectStore.clear().onsuccess = () => {
                resolve();
            };

            transaction.onerror = (event) => {
                reject(event);
            };
        };

        request.onerror = (event) => {
            reject(event);
        };
    });
}

async function updateLabelsWithCacheStatus(hostname) {
    for (let index in templatesArr) {
        const template = templatesArr[index];
        const span = document.querySelector(`label[for='view-${index}'] span`);
        const dbName = `${DB_PREFIX}${hostname}_${template.name}`;
        const db = await openDatabase(dbName, NODE_STORE_NAME);
        const nodes = await getAllData(db, NODE_STORE_NAME);
        if (span) {
            span.innerText = nodes.length > 0 ? `${template.name} ✅` : template.name;
        }
    }
}

window.templatesArr = templatesArr;
window.chosenTemplate = templatesArr[0];

document.addEventListener('DOMContentLoaded', async function () {
    let radio_container = document.getElementById('radio-container');
    let generateButton = document.getElementById('generate');

    const emoji = ['🦊', '🦊 🦊', '🦊 🦊 🦊'];
    let emojiIndex = 0;
    let emojiInterval;

    getCurrentTabHostname(async function (hostname) {
        async function checkAndSetCachedStatus(templateName, span) {
            const dbName = `${DB_PREFIX}${hostname}_${templateName}`;
            const db = await openDatabase(dbName, NODE_STORE_NAME);
            const paired = await getAllData(db, NODE_STORE_NAME);
            if (paired.length > 0) {
                span.innerText += ' ✅';
            }
        }

        for (let index in window.templatesArr) {
            const template = window.templatesArr[index];

            // Create label and input elements
            let label = document.createElement('label');
            let input = document.createElement('input');
            let span = document.createElement('span');

            input.type = 'radio';
            input.name = 'view';
            input.value = template.name;
            input.id = `view-${index}`;

            span.innerText = template.name;

            label.htmlFor = `view-${index}`;

            // Check and set cached status
            await checkAndSetCachedStatus(template.name, span);

            // Append input and span to the label
            label.appendChild(input);
            label.appendChild(span);

            // Add event listener to input
            input.addEventListener('change', async () => {
                window.chosenTemplate = template;
                console.log(window.chosenTemplate.generation);

                const dbName = `${DB_PREFIX}${hostname}_${template.name}`;
                const db = await openDatabase(dbName, NODE_STORE_NAME);
                const nodes = await getAllData(db, NODE_STORE_NAME);

                if (nodes.length > 0) {
                    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
                        nodes.forEach(node => {
                            chrome.tabs.sendMessage(tabs[0].id, {action: "postText", data: node});
                        })
                    });
                } else {
                    const original_db_name = `${ORIGINAL_DB_NAME_PREFIX}${hostname}`;
                    const original_node_db = await openDatabase(original_db_name, NODE_STORE_NAME);
                    const original_nodes = await getAllData(original_node_db, NODE_STORE_NAME);

                    if (original_nodes.length > 0) {
                        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
                            original_nodes.forEach(node => {
                                chrome.tabs.sendMessage(tabs[0].id, {action: "postText", data: node});
                            })
                        });
                    }
                }
            });

            // Append the label to the container
            radio_container.appendChild(label);
        }

        function startEmojiAnimation() {
            emojiInterval = setInterval(() => {
                generateButton.innerText = `In progress ... ${emoji[emojiIndex]}`;
                emojiIndex = (emojiIndex + 1) % emoji.length;
            }, 500);
        }

        function stopEmojiAnimation() {
            clearInterval(emojiInterval);
            generateButton.innerText = 'Let us rewrite it for you!';
        }

        generateButton.addEventListener('click', async () => {
            // Start the emoji animation
            startEmojiAnimation();

            const db_name = `${DB_PREFIX}${hostname}_${window.chosenTemplate.name}`;
            await clearObjectStore(db_name, NODE_STORE_NAME);
            const db = await openDatabase(db_name, NODE_STORE_NAME);

            chrome.tabs.query({active: true, currentWindow: true}, async function (tabs) {
                let promise = new Promise(async (resolve) => {
                    const clusterDbName = `${CLUSTER_DB_NAME_PREFIX}${hostname}`;
                    const clusterDb = await openDatabase(clusterDbName, CLUSTER_STORE_NAME);
                    let clusters = await getAllData(clusterDb, CLUSTER_STORE_NAME);

                    if (!clusters.length) {
                        chrome.tabs.sendMessage(tabs[0].id, {action: "fetchText"}, async function (response) {
                            clusters = await cluster(response.nodes);
                            clusters.forEach(cluster => {
                                addData(clusterDb, CLUSTER_STORE_NAME, cluster);
                            });

                            // Generate original paired data and save to original database
                            const original_nodes = clusters.flatMap(clusterArray =>
                                clusterArray.map(cluster => ({
                                    xpath: cluster.xpath,
                                    html: cluster.innerHTML
                                }))
                            );

                            const originalDbName = `${ORIGINAL_DB_NAME_PREFIX}${hostname}`;
                            const originalDb = await openDatabase(originalDbName, NODE_STORE_NAME);
                            original_nodes.forEach(node => addData(originalDb, NODE_STORE_NAME, node));

                            resolve();
                        });
                    } else {
                        resolve();
                    }

                    promise.then(async () => {
                        const clusterDbName = `${CLUSTER_DB_NAME_PREFIX}${hostname}`;
                        const clusterDb = await openDatabase(clusterDbName, CLUSTER_STORE_NAME);
                        let clusters = await getAllData(clusterDb, CLUSTER_STORE_NAME);

                        console.log(clusters);
                        let promises = clusters.map(async cluster => {
                            window.OpenAI_API_KEY = getApiKey();
                            const nodes = (await CoT(window.chosenTemplate, cluster.map(node =>
                                `${node.xpath}\n\n${node.innerHTML}`).join('\n\n--###--\n\n'))).nodes;
                            console.log(nodes);

                            for (let node of nodes) {
                                await new Promise((resolve, reject) => {
                                    chrome.tabs.sendMessage(tabs[0].id, {action: "postText", data: node}, function (response) {
                                        if(chrome.runtime.lastError) {
                                            reject(chrome.runtime.lastError);
                                        } else {
                                            resolve(response);
                                        }
                                    });
                                });
                                addData(db, NODE_STORE_NAME, node);
                            }

                            resolve();
                        });

                        await Promise.all(promises);

                        console.log("Posted text!");

                        // Update the labels with the cached emoji
                        await updateLabelsWithCacheStatus(hostname);

                        // Stop the emoji animation once the generation is complete
                        stopEmojiAnimation();
                    });
                });
            });
        });

        // Listen for messages from the content script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'pageRefreshed') {
                const clusterDbName = `${CLUSTER_DB_NAME_PREFIX}${hostname}`;
                clearObjectStore(clusterDbName, CLUSTER_STORE_NAME).then(() => {
                    console.log(`Cleared object store ${CLUSTER_STORE_NAME} in database ${clusterDbName}`);
                }).catch((error) => {
                    console.error(`Failed to clear object store ${CLUSTER_STORE_NAME} in database ${clusterDbName}:`, error);
                });

                const originalDbName = `${ORIGINAL_DB_NAME_PREFIX}${hostname}`;
                clearObjectStore(originalDbName, NODE_STORE_NAME).then(() => {
                    console.log(`Cleared object store ${CLUSTER_STORE_NAME} in database ${originalDbName}`);
                }).catch((error) => {
                    console.error(`Failed to clear object store ${CLUSTER_STORE_NAME} in database ${originalDbName}:`, error);
                });

                const templateDatabases = templatesArr.map(template => `${DB_PREFIX}${hostname}_${template.name}`);
                templateDatabases.forEach(dbName => {
                    clearObjectStore(dbName, NODE_STORE_NAME).then(() => {
                        console.log(`Cleared object store ${NODE_STORE_NAME} in database ${dbName}`);
                    }).catch((error) => {
                        console.error(`Failed to clear object store ${NODE_STORE_NAME} in database ${dbName}:`, error);
                    });
                });

                updateLabelsWithCacheStatus(hostname)
            }
        });
    });
});
