import {
  clear_object_stores,
  fetch_from_object_store,
  open_indexDB,
  push_to_object_store,
} from './database';
import { CoT } from './generation';
import {
  NodeData,
  NodeWeight,
  GeneratedNode,
  ChromeMessage,
  Template,
  StorageResult,
} from './types';
import { unifiedBrowser } from './src/utils/browser-polyfill';
import OpenAI from 'openai';

/**
 * Content collection script that runs in the page context
 * @returns Array of NodeData objects representing page content
 */
function collect_content(): NodeData[] {
  const TEXT_BOUNDARY_MIN = 20;

  function get_position(element: Element): { top: number; left: number } {
    let top = 0,
      left = 0;
    let currentElement = element as HTMLElement;
    while (currentElement) {
      top += currentElement.offsetTop || 0;
      left += currentElement.offsetLeft || 0;
      currentElement = currentElement.offsetParent as HTMLElement;
    }
    return { top, left };
  }

  const nodeWeightCache = new Map<Node, NodeWeight>();

  function calculate_weight(node: Node): NodeWeight {
    const cached = nodeWeightCache.get(node);
    if (cached) {
      return cached;
    }

    let htmlWeight = 0;
    let contentWeight = 0;

    if (node.nodeType === Node.TEXT_NODE) {
      contentWeight = node.textContent?.length || 0;
      htmlWeight = 0;
    } else if (node.nodeType === Node.COMMENT_NODE) {
      contentWeight = 0;
      htmlWeight = (node as Comment).nodeValue?.length || 0;
    } else {
      Array.from(node.childNodes).forEach(child => {
        const { htmlWeight: childHtmlWeight, contentWeight: childContentWeight } =
          calculate_weight(child);
        htmlWeight += childHtmlWeight;
        contentWeight += childContentWeight;
      });
      try {
        const element = node as Element;
        if (element.outerHTML && element.innerHTML) {
          htmlWeight += element.outerHTML.length - element.innerHTML.length;
        } else if (element.outerHTML) {
          htmlWeight += element.outerHTML.length;
        }
      } catch (error) {
        console.warn(node, error);
      }
    }

    const result: NodeWeight = { htmlWeight, contentWeight };
    nodeWeightCache.set(node, result);
    return result;
  }

  function sigmoid(x: number, b: number = 0.5, a: number = 1): number {
    return 1 / (1 + Math.exp(-a * (x - b)));
  }

  function decompose(parentWeight: NodeWeight, childrenWeights: NodeWeight[]): boolean {
    const { htmlWeight: parentHtmlWeight, contentWeight: parentContentWeight } = parentWeight;
    const totalChildHtmlWeight = childrenWeights.reduce(
      (sum, weight) => sum + weight.htmlWeight,
      0
    );
    const totalChildContentWeight = childrenWeights.reduce(
      (sum, weight) => sum + weight.contentWeight,
      0
    );

    const htmlWeightReduction = parentHtmlWeight - totalChildHtmlWeight;
    const contentWeightLoss = parentContentWeight - totalChildContentWeight;

    const htmlWeightFactor = sigmoid(parentHtmlWeight / 500, 0.5, 10);
    console.log(htmlWeightFactor);
    const contentWeightFactor = sigmoid(totalChildContentWeight / parentContentWeight, 0.5, 10);
    console.log(contentWeightFactor);

    const weightedHtmlWeightReduction = htmlWeightReduction * htmlWeightFactor;
    const weightedContentWeightLoss = contentWeightLoss * (1 - contentWeightFactor);
    console.log([weightedHtmlWeightReduction, weightedContentWeightLoss]);

    return (
      totalChildContentWeight >= TEXT_BOUNDARY_MIN &&
      weightedHtmlWeightReduction > weightedContentWeightLoss
    );
  }

  function traverse_dom(node: Element): Element[] {
    const bestNodes: Element[] = [];

    function traverse(node: Element): void {
      const { htmlWeight, contentWeight } = calculate_weight(node);
      console.log([node, htmlWeight, contentWeight]);

      if (!node.children || node.children.length === 0) {
        if (contentWeight >= TEXT_BOUNDARY_MIN && node.tagName !== 'SCRIPT') {
          bestNodes.push(node);
        }
        return;
      }

      const childrenWeights = Array.from(node.children).map(child => calculate_weight(child));

      if (decompose({ htmlWeight, contentWeight }, childrenWeights)) {
        Array.from(node.children).forEach(child => traverse(child));
      } else {
        if (contentWeight >= TEXT_BOUNDARY_MIN && node.tagName !== 'SCRIPT') {
          bestNodes.push(node);
        }
      }
      console.log(node, htmlWeight, contentWeight);
    }

    traverse(node);
    console.log('Best nodes:', bestNodes);
    return bestNodes;
  }

  function get_xpath(node: Element): string {
    const parts: string[] = [];

    let currentNode: Element | null = node;
    for (
      ;
      currentNode && currentNode.nodeType === Node.ELEMENT_NODE;
      currentNode = currentNode.parentElement
    ) {
      let index = 0;
      let sibling = currentNode.previousElementSibling;
      while (sibling) {
        if (sibling.nodeName === currentNode.nodeName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }

      const nodeName = currentNode.nodeName.toLowerCase();
      const part = index ? nodeName + '[' + (index + 1) + ']' : nodeName;
      parts.unshift(part);
    }

    return parts.length > 0 ? '/' + parts.join('/') : '';
  }

  function validate_node(orig_node: Element, node: Partial<NodeData>): boolean {
    const element = orig_node as HTMLElement;
    console.log([orig_node, node]);
    return !!(
      element.innerText &&
      element.innerText.length > 40 &&
      element.offsetWidth &&
      element.offsetHeight &&
      node.innerHTML &&
      node.plainText &&
      orig_node.tagName !== 'SCRIPT'
    );
  }

  const root = document.body;
  const nodes: NodeData[] = [];
  console.log(root);

  function push(node: Element): void {
    const { top, left } = get_position(node);
    const element = node as HTMLElement;
    const minimal: NodeData = {
      xpath: get_xpath(node),
      layout: {
        left,
        top,
      },
      innerHTML: element.innerHTML,
      plainText: element.textContent || '',
    };

    if (validate_node(node, minimal)) {
      nodes.push(minimal);
    }
  }

  traverse_dom(root).forEach(node => push(node));

  console.log(nodes);
  return nodes;
}

/**
 * Generates content using AI for the provided nodes
 */
async function* generate(
  nodes: NodeData[],
  template: Template,
  openai: string | undefined,
  default_openai: string
): AsyncGenerator<GeneratedNode, void, unknown> {
  let key = openai;
  console.log('Community key is: ', default_openai);

  if (key) {
    const client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
    try {
      await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'ping',
          },
        ],
      });
    } catch {
      console.log('Fetching data!');
      try {
        const response = await fetch(
          'https://gist.githubusercontent.com/fedor-palisade-research/15cc05c51d4659d7bbec3f5e9594aaf6/raw/311a92e4a25ce1fd5a64951ad35ab09b98399f88/community_key.txt'
        );
        const data = await response.text();
        console.log(data);

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

        key = decodeBase64(data);
      } catch (error) {
        console.error('Error fetching the string:', error);
        key = default_openai;
      }
    }
  } else {
    console.log('Fetching data!');
    try {
      const response = await fetch(
        'https://gist.githubusercontent.com/fedor-palisade-research/15cc05c51d4659d7bbec3f5e9594aaf6/raw/311a92e4a25ce1fd5a64951ad35ab09b98399f88/community_key.txt'
      );
      const data = await response.text();
      console.log(data);

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

      key = decodeBase64(data);
    } catch (error) {
      console.error('Error fetching the string:', error);
      key = default_openai;
    }
  }

  const promises = nodes.map(async (node): Promise<GeneratedNode | null> => {
    console.log(
      'CoT launched for node',
      node,
      'at',
      Date.now(),
      'with template',
      template.generation
    );
    const original = node.innerHTML;
    const generation = await CoT(key || default_openai, template, original);
    console.log('CoT finished for node', node, 'at', Date.now(), 'with result:', generation);
    return generation ? { xpath: node.xpath, html: generation } : null;
  });

  for (const promise of promises) {
    const completion = await promise;
    if (completion?.html) {
      yield completion;
    }
  }
}

/**
 * Handles web navigation completion events
 */
unifiedBrowser.webNavigation.onCompleted.addListener(
  async (details: chrome.webNavigation.WebNavigationFramedCallbackDetails) => {
    if (details.frameId === 0) {
      await clear_object_stores(new URL(details.url).hostname + new URL(details.url).pathname);

      unifiedBrowser.runtime.sendMessage({
        action: 'close_popup',
      });
    }
  }
);

/**
 * Pushes cached template content to the active tab
 */
function push_cached_template(request: ChromeMessage): void {
  if (!request.url || !request.id || !request.template) return;

  fetch_from_object_store(request.url, 'original').then(
    (original_nodes: (NodeData | GeneratedNode)[]) => {
      console.log('Original Nodes:', original_nodes);
      (original_nodes as NodeData[]).forEach(async (original_node: NodeData) => {
        const xpath = original_node.xpath;
        const html = original_node.innerHTML;

        const func = function (xpath: string, html: string) {
          const node = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          ).singleNodeValue as HTMLElement;

          if (node) {
            node.innerHTML = html;
          } else {
            console.log(`No element matches the provided XPath: ${xpath}`);
          }
        };

        if (request.id) {
          await unifiedBrowser.scripting.executeScript({
            target: { tabId: request.id },
            func,
            args: [xpath, html],
          });
        }
      });
    }
  );

  console.log('Original pushed...');

  console.log('Fetching template', request.template.name);
  // Then fetch and push the chosen template
  fetch_from_object_store(request.url, request.template.name).then(
    (nodes: (NodeData | GeneratedNode)[]) => {
      console.log('Template Nodes:', nodes);
      (nodes as GeneratedNode[]).forEach(async (node: GeneratedNode) => {
        const xpath = node.xpath;
        const html = node.html;

        const func = function (xpath: string, html: string) {
          const node = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          ).singleNodeValue as HTMLElement;

          if (node) {
            node.innerHTML = html;
          } else {
            console.log(`No element matches the provided XPath: ${xpath}`);
          }
        };

        if (request.id) {
          await unifiedBrowser.scripting.executeScript({
            target: { tabId: request.id },
            func,
            args: [xpath, html],
          });
        }
      });
    }
  );
}

/**
 * Processes incoming messages from popup and content scripts
 */
async function process_request(request: ChromeMessage): Promise<void> {
  if (request.action === 'setup') {
    console.log('Setting up ...');
    if (!request.url || !request.id || !request.templates) return;

    try {
      await open_indexDB(
        request.url,
        Object.values(request.templates).map(template => template.name)
      );

      const result = await unifiedBrowser.scripting.executeScript({
        target: { tabId: request.id },
        func: collect_content,
      });

      const nodes = result[0].result;
      if (nodes) {
        await push_to_object_store(request.url, 'original', nodes);
      }
    } catch (_e) {
      console.warn((_e as Error).message || _e);
      return;
    }
  }

  if (request.action === 'set_template') {
    if (!request.url || !request.template) return;

    const obj: { [key: string]: Template } = {};
    obj['template_' + request.url] = request.template;

    await unifiedBrowser.storage.local.set(obj);
    console.log('Template for', request.url, 'saved:', request.template);
    push_cached_template(request);
  }

  if (request.action === 'clear-cache') {
    if (!request.url) return;
    await clear_object_stores(request.url);
  }

  if (request.action === 'push_openai_to_background') {
    if (!request.key) return;

    const obj: { [key: string]: string } = {};
    obj['openai'] = request.key;

    await unifiedBrowser.storage.local.set(obj);
    console.log('OpenAI key set');

    unifiedBrowser.runtime.sendMessage({
      action: 'push_openai_to_popup',
      openai: request.key,
    });
  }

  if (request.action === 'setup_finished') {
    const result = await unifiedBrowser.storage.local.get('openai');
    let api_key = result['openai'];

    if (typeof api_key === 'undefined') {
      api_key = 'insert OpenAI API key';
    }

    unifiedBrowser.runtime.sendMessage({
      action: 'push_openai_to_popup',
      openai: api_key,
    });
  }

  if (request.action === 'generate') {
    if (!request.url || !request.id || !request.key) return;

    unifiedBrowser.runtime.sendMessage({
      action: 'generation_initialized',
    });

    try {
      const original = (await fetch_from_object_store(request.url, 'original')) as NodeData[];

      const result = await unifiedBrowser.storage.local.get(['template_' + request.url, 'openai']);
      const template = result['template_' + request.url] as Template;
      if (template) {
        const nodes: GeneratedNode[] = [];

        for await (const node of generate(
          original,
          template,
          result['openai'] as string,
          request.key || ''
        )) {
          nodes.push(node);
          const xpath = node.xpath;
          const html = node.html;

          const func = function (xpath: string, html: string) {
            const node = document.evaluate(
              xpath,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            ).singleNodeValue as HTMLElement;

            if (node) {
              node.innerHTML = html;
            } else {
              console.log(`No element matches the provided XPath: ${xpath}`);
            }
          };

          if (request.id) {
            unifiedBrowser.scripting.executeScript({
              target: { tabId: request.id },
              func,
              args: [xpath, html],
            });
          }
        }

        if (nodes.length && request.url) {
          await push_to_object_store(request.url, template.name, nodes);
        }

        console.log('Page rewritten!...');

        const templateResult = await unifiedBrowser.storage.local.get(['template_' + request.url]);
        const storedTemplate = templateResult['template_' + request.url] as Template;
        if (storedTemplate) {
          unifiedBrowser.runtime.sendMessage({
            action: 'template_cached',
            template_name: storedTemplate.name,
          });
        }

        unifiedBrowser.runtime.sendMessage({
          action: 'generation_completed',
        });
      } else {
        console.log('Cannot find required keys in local storage.');
      }
    } catch (error) {
      console.log('Error in processing:', error);
    }
  }
}

/**
 * Message listener for handling communication between extension components
 */
unifiedBrowser.runtime.onMessage.addListener(
  async (
    request: ChromeMessage,
    _sender: any,
    _sendResponse: (response?: unknown) => void
  ): Promise<boolean> => {
    await process_request(request);
    return true;
  }
);
