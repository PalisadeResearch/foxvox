import OpenAI from "openai";
import { Template } from "./types.js";

/**
 * Creates a completion request to OpenAI API
 */
async function completion(openai: OpenAI, context: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    return openai.chat.completions.create({
        model: 'gpt-4o',
        messages: context,
        tools: [
            {
                "type": "function",
                "function": {
                    "name": "output",
                    "description": "Output your rewritten input here",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "html": {
                                "type": "string"
                            },
                        },
                    }
                }
            }
        ],
        tool_choice: "required"
    });
}

/**
 * Chain of Thought algorithm for content generation
 * @param OpenAI_API_KEY - OpenAI API key
 * @param template - Template configuration for generation
 * @param original - Original HTML content to transform
 * @returns Generated HTML content or null if error
 */
export async function CoT(OpenAI_API_KEY: string, template: Template, original: string): Promise<string | null> {
    try {
        console.log('Initializing OpenAI... :', OpenAI_API_KEY);
        const openai = new OpenAI({ apiKey: OpenAI_API_KEY, dangerouslyAllowBrowser: true });

        console.log('OpenAI initialized.');
        console.log('Starting chain of thought algorithm...');

        const system_message: OpenAI.Chat.Completions.ChatCompletionSystemMessageParam = { 
            "role": "system", 
            "content": template.generation 
        };
        const original_message: OpenAI.Chat.Completions.ChatCompletionUserMessageParam = { 
            "role": "user", 
            "content": original 
        };

        const first_completion = await completion(openai, [system_message, original_message]);

        const tool_call = first_completion.choices[0]?.message?.tool_calls?.[0];
        if (!tool_call?.function?.arguments) {
            throw new Error('No tool call arguments received from first completion');
        }

        const first_completion_message: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = { 
            "role": "assistant", 
            "content": tool_call.function.arguments 
        };
        
        const final_user_message: OpenAI.Chat.Completions.ChatCompletionUserMessageParam = { 
            "role": "user", 
            "content": "Carefully go over your result one last time. Make sure that it adheres to all given requirements, edit minor details or rewrite bad parts of the text. Do it carefully, step by step, outlining your thought process, possibly doing different versions of the text. When you think that the quality of it is good enough and doesn't need anymore edits, output it using 'output' tool." 
        };
        
        const final_completion = await completion(openai, [system_message, original_message, first_completion_message, final_user_message]);

        const final_tool_call = final_completion.choices[0]?.message?.tool_calls?.[0];
        if (!final_tool_call?.function?.arguments) {
            throw new Error('No tool call arguments received from final completion');
        }

        const final = JSON.parse(final_tool_call.function.arguments);
        return final.html;
    } catch (error) {
        console.error('Error occurred during CoT: ', error);
        return null;
    }
} 