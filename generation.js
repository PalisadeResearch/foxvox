import OpenAI from "openai";
import Hjson from "hjson";

async function completion(openai, context) {
    return openai.chat.completions.create({
        model: 'gpt-4.1',
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

export async function CoT(OpenAI_API_KEY, template, original) {
    try {
        console.log('Initializing OpenAI... :', OpenAI_API_KEY);
        let openai = new OpenAI({ apiKey: OpenAI_API_KEY, dangerouslyAllowBrowser: true });

        console.log('OpenAI initialized.');
        console.log('Starting chain of thought algorithm...');

        const system_message = { "role": "system", "content": template.generation };
        const original_message = { "role": "user", "content": original };

        const first_completion = await completion(openai, [system_message, original_message]);

        const first_completion_message = { "role": "assistant", "content": first_completion.choices[0].message.tool_calls[0].function.arguments }
        const final_user_message = { "role": "user", "content": "Carefully go over your result one last time. Make sure that it adheres to all given requirements, edit minor details or rewrite bad parts of the text. Do it carefully, step by step, outlining your thought process, possibly doing different versions of the text. When you think that the quality of it is good enough and doesn't need anymore edits, output it using 'output' tool." };
        const final_completion = await completion(openai,[system_message, original_message, first_completion_message, final_user_message]);

        const final = Hjson.parse(final_completion.choices[0].message.tool_calls[0].function.arguments);

        return final.html
    } catch (error) {
        console.error('Error occurred during CoT: ', error);
        return null
    }
}