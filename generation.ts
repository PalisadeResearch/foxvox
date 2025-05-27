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
 * Tool mapping for function calls
 */
const toolMapping = {
  output_rewritten_content: (args: { html: string }) => {
    return args.html;
  },
};

/**
 * Execute function calls and return outputs
 */
function executeFunctionCalls(functionCalls: any[]): any[] {
  return functionCalls.map(functionCall => {
    const toolFunction = toolMapping[functionCall.name as keyof typeof toolMapping];
    if (!toolFunction) {
      throw new Error(`No tool found for function call: ${functionCall.name}`);
    }

    const arguments_ = JSON.parse(functionCall.arguments);
    const toolOutput = toolFunction(arguments_);

    return {
      type: 'function_call_output',
      call_id: functionCall.call_id,
      output: toolOutput,
    };
  });
}

/**
 * Content generation using Responses API with proper function calling support
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

    console.log('Starting Responses API generation with function calling...');

    // Combine template generation with custom prompt if provided
    let systemContent = template.generation;
    if (userSettings.customPrompt.trim()) {
      systemContent += `\n\nAdditional custom instructions: ${userSettings.customPrompt}`;
    }

    // Prepare model configuration with proper token parameter
    const isNewModel = isNewGenerationModel(userSettings.model);
    const modelConfig: any = {
      model: userSettings.model,
      tools: [
        {
          type: 'function',
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
      ],
    };

    // Handle token limits based on model type
    if (isNewModel) {
      modelConfig.max_completion_tokens = userSettings.maxTokens;
    } else {
      modelConfig.max_tokens = userSettings.maxTokens;
    }

    console.log('Model config:', {
      model: modelConfig.model,
      hasTools: !!modelConfig.tools,
      tokenParam: isNewModel ? 'max_completion_tokens' : 'max_tokens',
      maxTokens: userSettings.maxTokens,
    });

    // Initialize conversation with system and user messages
    const conversationInput = [
      {
        role: 'system',
        content: systemContent,
      },
      {
        role: 'user',
        content: `${original}\n\nPlease rewrite this content according to the template instructions provided in the system message. Think through your approach carefully and call the output_rewritten_content function when you're ready with the final result.`,
      },
    ];

    let totalTokensUsed = 0;
    let finalResult: string | null = null;
    const conversationHistory = [...conversationInput];

    // Main response loop - continue until we get a final message
    while (true) {
      console.log('Making Responses API call...');

      const response = await openai.responses.create({
        input: conversationHistory,
        ...modelConfig,
      });

      totalTokensUsed += response.usage?.total_tokens || 0;

      // Extract different response types
      const reasoning = response.output?.filter((rx: any) => rx.type === 'reasoning') || [];
      const functionCalls = response.output?.filter((rx: any) => rx.type === 'function_call') || [];
      const messages = response.output?.filter((rx: any) => rx.type === 'message') || [];

      console.log('Response breakdown:', {
        reasoning: reasoning.length,
        functionCalls: functionCalls.length,
        messages: messages.length,
        totalTokens: totalTokensUsed,
        hasOutputText: !!response.output_text,
      });

      // If we have output_text directly, use it (for simpler cases)
      if (response.output_text && !finalResult) {
        console.log('Got direct output_text from response');
        finalResult = response.output_text;
      }

      // Add reasoning steps to conversation history (preserve chain of thought)
      if (reasoning.length > 0) {
        console.log('Adding reasoning steps to conversation...');
        conversationHistory.push(...reasoning.map((r: any) => r));
      }

      // Handle function calls
      if (functionCalls.length > 0) {
        console.log(`Executing ${functionCalls.length} function call(s)...`);

        // Add function calls to conversation
        conversationHistory.push(...functionCalls.map((fc: any) => fc));

        // Execute functions and get outputs
        const functionOutputs = executeFunctionCalls(functionCalls);

        // Add function outputs to conversation
        conversationHistory.push(...functionOutputs);

        // Check if any function call was for our target function
        for (const functionCall of functionCalls) {
          const fc = functionCall as any; // Cast to access properties
          if (fc.name === 'output_rewritten_content') {
            const args = JSON.parse(fc.arguments);
            finalResult = args.html;
            console.log('Received final HTML result from function call');
          }
        }

        // Continue the loop to let the model process the function outputs
        continue;
      }

      // Handle final messages
      if (messages.length > 0) {
        console.log('Received final message(s), ending conversation...');
        conversationHistory.push(...messages.map((m: any) => m));

        // If we have a result from function calls, use that
        if (finalResult) {
          break;
        }

        // Otherwise, try to extract result from message content
        const messageContent = (messages[0] as any)?.content;
        if (messageContent && typeof messageContent === 'string') {
          finalResult = messageContent;
        }
        break;
      }

      // If no function calls and no messages, something went wrong
      if (functionCalls.length === 0 && messages.length === 0) {
        console.warn('No function calls or messages in response, ending loop...');
        break;
      }
    }

    console.log(`Generation completed. Total tokens used: ${totalTokensUsed}`);

    if (!finalResult) {
      throw new Error('No valid result received from the model');
    }

    return finalResult;
  } catch (error) {
    console.error('Error occurred during Responses API generation:', error);
    return null;
  }
}
