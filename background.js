import {clear_object_stores, fetch_from_object_store, open_indexDB, push_to_object_store} from "./database.js";
import {CoT} from "./generation.js";
import OpenAI from "openai";

function collect_content() {
    const TEXT_BOUNDARY_MIN = 20;

    function get_position(element) {
        let top = 0, left = 0;
        while (element) {
            top += element.offsetTop || 0;
            left += element.offsetLeft || 0;
            element = element.offsetParent;
        }
        return {top, left};
    }

    let nodeWeightCache = new Map();

    function calculate_weight(node) {
        if (nodeWeightCache.has(node)) {
            return nodeWeightCache.get(node);
        }

        let htmlWeight = 0;
        let contentWeight = 0;

        if (node.nodeType === 3) { //Checking if nodeType is TEXT_NODE
            contentWeight = node.textContent.length;
            htmlWeight = 0;
        } else if (node.nodeType === 8) { //Checking if nodeType is COMMENT_NODE
            contentWeight = 0;
            htmlWeight = node.nodeValue.length;
        } else {
            Array.from(node.childNodes).forEach(child => {
                const {htmlWeight: childHtmlWeight, contentWeight: childContentWeight} = calculate_weight(child);
                htmlWeight += childHtmlWeight;
                contentWeight += childContentWeight;
            });
            try {
                if (node.outerHTML && node.innerHTML) {
                    htmlWeight += node.outerHTML.length - node.innerHTML.length;
                } else if (node.outerHTML) {
                    htmlWeight += node.outerHTML.length;
                }
            } catch (error) {
                console.warn(node, error);
            }
        }

        const result = {htmlWeight, contentWeight};
        nodeWeightCache.set(node, result);
        return result;
    }

    function sigmoid(x, b = 0.5, a = 1) {
        return 1 / (1 + Math.exp(-a * (x - b)));
    }

    function decompose(parentWeight, childrenWeights) {
        const {htmlWeight: parentHtmlWeight, contentWeight: parentContentWeight} = parentWeight;
        const totalChildHtmlWeight = childrenWeights.reduce((sum, weight) => sum + weight.htmlWeight, 0);
        const totalChildContentWeight = childrenWeights.reduce((sum, weight) => sum + weight.contentWeight, 0);

        const htmlWeightReduction = parentHtmlWeight - totalChildHtmlWeight;
        const contentWeightLoss = parentContentWeight - totalChildContentWeight;

        const htmlWeightFactor = sigmoid(parentHtmlWeight / 500, 0.5, 10); // Adjust '10' for steepness
        console.log(htmlWeightFactor);
        const contentWeightFactor = sigmoid(totalChildContentWeight / parentContentWeight, 0.5, 10);
        console.log(contentWeightFactor)

        const weightedHtmlWeightReduction = htmlWeightReduction * htmlWeightFactor;
        const weightedContentWeightLoss = contentWeightLoss * (1 - contentWeightFactor);
        console.log([weightedHtmlWeightReduction, weightedContentWeightLoss]);

        return totalChildContentWeight >= TEXT_BOUNDARY_MIN && weightedHtmlWeightReduction > weightedContentWeightLoss;
    }

    function traverse_dom(node) {
        let bestNodes = [];

        function traverse(node) {
            const {htmlWeight, contentWeight} = calculate_weight(node);
            console.log([node, htmlWeight, contentWeight])

            if (!node.children || node.children.length === 0) {
                if (contentWeight >= TEXT_BOUNDARY_MIN && node.tagName !== 'SCRIPT') {
                    bestNodes.push(node);
                }
                return;
            }

            const childrenWeights = Array.from(node.children).map(child => calculate_weight(child));

            if (decompose({htmlWeight, contentWeight}, childrenWeights)) {
                Array.from(node.children).forEach(child => traverse(child));
            } else {
                if (contentWeight >= TEXT_BOUNDARY_MIN && node.tagName !== 'SCRIPT') {
                    bestNodes.push(node);
                }
            }
            console.log(node, htmlWeight, contentWeight)
        }

        traverse(node);
        console.log("Best nodes:", bestNodes)
        return bestNodes;
    }

    function get_xpath(node) {
        const parts = [];

        for (; node && node.nodeType === 1; node = node.parentNode) { //Checking if nodeType is ELEMENT_NODE
            let index = 0;
            for (let sibling = node.previousSibling; sibling; sibling = sibling.previousSibling) {
                if (sibling.nodeType === 10) continue; //Checking if nodeType is DOCUMENT_NODE
                if (sibling.nodeName === node.nodeName) ++index;
            }

            const nodeName = node.nodeName.toLowerCase();
            const part = (index ? nodeName + '[' + (index + 1) + ']' : nodeName);
            parts.unshift(part);
        }

        return parts.length > 0 ? '/' + parts.join('/') : '';
    }

    function validate_node(orig_node, node) {
        console.log([orig_node, node])
        return orig_node.innerText && orig_node.innerText.length > 40 && orig_node.offsetWidth && orig_node.offsetHeight && node.innerHTML && node.plainText && orig_node.tagName !== 'SCRIPT'
    }

    const root = document.body
    let nodes = [];
    console.log(root)

    function push(node) {
        let {top, left} = get_position(node);
        let minimal = {
            xpath: get_xpath(node),
            layout: {
                left: left,
                top: top,
            },
            innerHTML: node.innerHTML,
            plainText: node.textContent,
        }

        if (validate_node(node, minimal)) {
            nodes.push(minimal);
        }
    }

    traverse_dom(root).forEach(node => push(node));

    console.log(nodes)
    return nodes;
}

/*
--###--
Generation (DOESN'T WORK)
--###--
*/

async function* generate(nodes, template, openai, default_openai) {
    let key = openai
    console.log("Community key is: ", default_openai)
    if(key) {
        const client = new OpenAI({apiKey: key, dangerouslyAllowBrowser: true});
        try {
            await client.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    {
                        "role": "system",
                        "content": "ping"
                    }
                ]
            })
        } catch (e) {
            console.log("Fetching data!")
            await fetch('https://gist.githubusercontent.com/fedor-palisade-research/15cc05c51d4659d7bbec3f5e9594aaf6/raw/311a92e4a25ce1fd5a64951ad35ab09b98399f88/community_key.txt')
                .then(response => response.text())
                .then(data => {
                    console.log(data)

                    function decodeBase64(str) {
                        return decodeURIComponent(atob(str).split('').map(function (c) {
                            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                        }).join(''));
                    }

                    key = decodeBase64(data);
                })
                .catch(error => {
                    console.error('Error fetching the string:', error)
                    key = default_openai
                });
        }
    } else {
        console.log("Fetching data!")
        await fetch('https://gist.githubusercontent.com/fedor-palisade-research/15cc05c51d4659d7bbec3f5e9594aaf6/raw/311a92e4a25ce1fd5a64951ad35ab09b98399f88/community_key.txt')
            .then(response => response.text())
            .then(data => {
                console.log(data)

                function decodeBase64(str) {
                    return decodeURIComponent(atob(str).split('').map(function (c) {
                        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                    }).join(''));
                }

                key = decodeBase64(data);
            })
            .catch(error => {
                console.error('Error fetching the string:', error)
                key = default_openai
            });
    }

    const promises = nodes.map(async node => {
        console.log("CoT launched for node", node, "at", Date.now(), "with template", template.generation);
        const original = node.innerHTML;
        const generation = await CoT(key, template, original);
        console.log("CoT finished for node", node, "at", Date.now(), "with result:", generation);
        return {xpath: node.xpath, html: generation};
    });

    for (const promise of promises) {
        const completion = await promise;
        if (completion.html) {
            yield completion;
        }
    }
}

/*
--###--
SETUP
--###--
*/

chrome.webNavigation.onCompleted.addListener(async function (details) {
    if (details.frameId === 0) {
        await clear_object_stores(new URL(details.url).hostname + new URL(details.url).pathname);

        chrome.runtime.sendMessage({
            action: "close_popup",
        });
    }
});


function push_cached_template(request) {
    fetch_from_object_store(request.url, 'original').then(original_nodes => {
        console.log("Original Nodes:", original_nodes)
        original_nodes.forEach(async original_node => {
            const xpath = original_node.xpath;
            const html = original_node.innerHTML;

            const func = function (xpath, html) {
                const node = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

                if (node) {
                    node.innerHTML = html;
                } else {
                    console.log(`No element matches the provided XPath: ${xpath}`);
                }
            }

            await chrome.scripting.executeScript({
                target: {tabId: request.id},
                function: func,
                args: [xpath, html]
            });

        });
    });

    console.log("Original pushed...")

    console.log("Fetching template", request.template.name)
    // Then fetch and push the chosen template
    fetch_from_object_store(request.url, request.template.name).then(nodes => {
        console.log("Template Nodes:", nodes)
        nodes.forEach(async node => {
            const xpath = node.xpath;
            const html = node.html;

            const func = function (xpath, html) {
                const node = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

                if (node) {
                    node.innerHTML = html;
                } else {
                    console.log(`No element matches the provided XPath: ${xpath}`);
                }
            }

            await chrome.scripting.executeScript({
                target: {tabId: request.id},
                function: func,
                args: [xpath, html]
            });

        });
    });
}

async function process_request(request) {
    if (request.action === "setup") {
        console.log('Setting up ...')
        open_indexDB(request.url, Object.values(request.templates).map(template => template.name)).then(async () => {
                let result;
                try {
                    result = await chrome.scripting.executeScript({
                        target: {tabId: request.id},
                        func: collect_content
                    });
                } catch (e) {
                    console.warn(e.message || e);
                    return;
                }
                const nodes = result[0].result
                push_to_object_store(request.url, 'original', nodes)
                    .then(() => {
                    }).catch(console.error);
            }
        )
    }

    if (request.action === "set_template") {
        let obj = {};
        obj['template_' + request.url] = request.template;
        chrome.storage.local.set(obj, function () {
            console.log('Template for', request.url, 'saved:', request.template);
            push_cached_template(request);
        });
    }

    if (request.action === "clear-cache") {
        await clear_object_stores(request.url)
    }

    if (request.action === "push_openai_to_background") {
        let obj = {};
        obj['openai'] = request.key;
        chrome.storage.local.set(obj, function () {
            console.log('OpenAI key set');
        });

        chrome.runtime.sendMessage({
            action: "push_openai_to_popup",
            openai: request.key
        });
    }

    if (request.action === "setup_finished") {
        chrome.storage.local.get('openai', function (result) {
            let api_key = result['openai']

            if (typeof api_key === "undefined") {
                api_key = "insert OpenAI API key"
            }

            chrome.runtime.sendMessage({
                action: "push_openai_to_popup",
                openai: api_key
            });
        })
    }

    if (request.action === "generate") {
        chrome.runtime.sendMessage({
            action: "generation_initialized",
        });

        new Promise(async (resolve, reject) => {
            try {
                const original = await fetch_from_object_store(request.url, 'original');
                chrome.storage.local.get(['template_' + request.url, 'openai'], async function (result) {
                    if (result['template_' + request.url]) {
                        let nodes = [];
                        for await (const node of generate(original, result['template_' + request.url], result['openai'], request.key)) {
                            nodes.push(node)
                            const xpath = node.xpath;
                            const html = node.html;

                            const func = function (xpath, html) {
                                const node = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

                                if (node) {
                                    node.innerHTML = html;
                                } else {
                                    console.log(`No element matches the provided XPath: ${xpath}`);
                                }
                            }

                            chrome.scripting.executeScript({
                                target: {tabId: request.id},
                                function: func,
                                args: [xpath, html]
                            });
                        }

                        if (nodes.length) {
                            await push_to_object_store(request.url, result['template_' + request.url].name, nodes)
                        }

                        console.log("Page rewritten!...");
                        resolve();
                    } else {
                        console.log('Cannot find required keys in local storage.');
                        reject('Cannot find required keys in local storage.');
                    }
                });
            } catch (error) {
                console.log('Error in processing:', error);
                reject(error);
            }
        }).then(() => {
            chrome.storage.local.get(['template_' + request.url], async function (result) {
                chrome.runtime.sendMessage({
                    action: "template_cached",
                    template_name: result['template_' + request.url].name
                });
            });

            chrome.runtime.sendMessage({
                action: "generation_completed",
            });
        }).catch(error => {
            console.log(`Error during generation: ${error}`);
        });
    }
}

chrome.runtime.onMessage.addListener(async function (request, sender, sendResponse) {
    await process_request(request, sender, sendResponse);
    return true;
});