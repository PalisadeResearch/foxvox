import OpenAI from 'openai';
import { Template, UserSettings } from './types';

/**
 * Determines if a model uses the new parameter structure
 */
function isNewGenerationModel(model: string): boolean {
  const newModels = ['o3', 'o4-mini', 'o1-preview', 'o1-mini'];
  return newModels.includes(model);
}

/**
 * Determines if a model is a reasoning model
 */
function isReasoningModel(model: string): boolean {
  return model.startsWith('o3') || model.startsWith('o1') || model.startsWith('o4');
}

/**
 * Creates a completion request with proper function calling support for all models
 */
async function completion(
  openai: OpenAI,
  context: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  userSettings: UserSettings
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const isNewModel = isNewGenerationModel(userSettings.model);

  // Base configuration with function calling (supported by all models including reasoning models)
  const baseConfig: any = {
    model: userSettings.model,
    messages: context,
    tools: [
      {
        type: 'function',
        function: {
          name: 'output_rewritten_content',
          description: 'Output the rewritten HTML content according to the template instructions',
          parameters: {
            type: 'object',
            properties: {
              html: {
                type: 'string',
                description: 'The rewritten HTML content',
              },
            },
            required: ['html'],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: 'required',
  };

  // Handle token limits based on model type
  if (isNewModel) {
    // New models use max_completion_tokens
    baseConfig.max_completion_tokens = userSettings.maxTokens;
  } else {
    // Legacy models use max_tokens
    baseConfig.max_tokens = userSettings.maxTokens;
  }

  // For reasoning models, add reasoning configuration if available
  if (isReasoningModel(userSettings.model)) {
    // Note: reasoning configuration might be available in future API versions
    // baseConfig.reasoning = { effort: "medium", summary: "auto" };
    console.log('Using reasoning model with function calling:', userSettings.model);
  }

  console.log('API request config:', {
    model: baseConfig.model,
    hasTools: !!baseConfig.tools,
    tokenParam: isNewModel ? 'max_completion_tokens' : 'max_tokens',
    isReasoning: isReasoningModel(userSettings.model),
  });

  return openai.chat.completions.create(baseConfig);
}

/**
 * Chain of Thought algorithm for content generation
 * @param userSettings - User settings including API key, model, and custom prompt
 * @param template - Template configuration for generation
 * @param original - Original HTML content to transform
 * @returns Generated HTML content or null if error
 */
export async function CoT(
  userSettings: UserSettings,
  template: Template,
  original: string
): Promise<string | null> {
  try {
    console.log('Initializing OpenAI with user settings...');
    const openai = new OpenAI({ apiKey: userSettings.apiKey, dangerouslyAllowBrowser: true });

    console.log('OpenAI initialized.');
    console.log('Starting chain of thought algorithm...');

    // Combine template generation with custom prompt if provided
    let systemContent = template.generation;
    if (userSettings.customPrompt.trim()) {
      systemContent += `\n\nAdditional custom instructions: ${userSettings.customPrompt}`;
    }

    const system_message: OpenAI.Chat.Completions.ChatCompletionSystemMessageParam = {
      role: 'system',
      content: systemContent,
    };
    const original_message: OpenAI.Chat.Completions.ChatCompletionUserMessageParam = {
      role: 'user',
      content: original,
    };

    const isReasoning = isReasoningModel(userSettings.model);

    if (isReasoning) {
      // For reasoning models, use a more direct approach
      // They will reason internally and then call the function when ready
      console.log('Using reasoning model - single completion with internal reasoning');

      const enhanced_message: OpenAI.Chat.Completions.ChatCompletionUserMessageParam = {
        role: 'user',
        content: `${original}\n\nPlease rewrite this content according to the template instructions provided in the system message. Think through your approach carefully and call the output_rewritten_content function when you're ready with the final result.`,
      };

      const completion_response = await completion(
        openai,
        [system_message, enhanced_message],
        userSettings
      );

      const tool_call = completion_response.choices[0]?.message?.tool_calls?.[0];
      if (!tool_call?.function?.arguments) {
        throw new Error('No tool call arguments received from reasoning model');
      }

      const parsed = JSON.parse(tool_call.function.arguments);
      return parsed.html;
    } else {
      // For traditional models, use Chain of Thought with two-step refinement
      console.log('Using traditional model - Chain of Thought approach');

      const first_completion = await completion(
        openai,
        [system_message, original_message],
        userSettings
      );

      const tool_call = first_completion.choices[0]?.message?.tool_calls?.[0];
      if (!tool_call?.function?.arguments) {
        throw new Error('No tool call arguments received from first completion');
      }

      const first_completion_message: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam =
        {
          role: 'assistant',
          content: first_completion.choices[0]?.message?.content || '',
          tool_calls: first_completion.choices[0]?.message?.tool_calls,
        };

      const function_result_message: OpenAI.Chat.Completions.ChatCompletionToolMessageParam = {
        role: 'tool',
        content: tool_call.function.arguments,
        tool_call_id: tool_call.id,
      };

      const final_user_message: OpenAI.Chat.Completions.ChatCompletionUserMessageParam = {
        role: 'user',
        content:
          "Carefully review your result. Make sure it adheres to all requirements, fix any issues, and improve the quality. When you're satisfied with the result, call the output_rewritten_content function again with your final version.",
      };

      const final_completion = await completion(
        openai,
        [
          system_message,
          original_message,
          first_completion_message,
          function_result_message,
          final_user_message,
        ],
        userSettings
      );

      const final_tool_call = final_completion.choices[0]?.message?.tool_calls?.[0];
      if (!final_tool_call?.function?.arguments) {
        throw new Error('No tool call arguments received from final completion');
      }

      const final = JSON.parse(final_tool_call.function.arguments);
      return final.html;
    }
  } catch (error) {
    console.error('Error occurred during CoT: ', error);
    return null;
  }
}
