import OpenAI from "openai";
import { Config } from "../config/config.js";
import { ChatCompletionParams, StreamChunk, ChatMessage, MessageRole } from "../types.js";

// OpenAI client options
interface OpenAIClientOptions {
  apiKey?: string;
  baseURL?: string;
}

/**
 * LLM Client for interacting with language models
 */
export class LlmClient {
  private config = Config.getInstance();
  private openaiClient: OpenAI;

  constructor(options: OpenAIClientOptions = {}) {
    // Get API key from options or config
    const apiKey = options.apiKey || this.config.getApiKey("openai");

    if (!apiKey) {
      throw new Error("OpenAI API key is required. Please set it in the configuration or provide it in the options.");
    }

    // Get base URL from options or config
    const baseURL = options.baseURL || this.config.get("apis.openai.baseUrl");

    // Create OpenAI client
    this.openaiClient = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  /**
   * Convert internal message format to OpenAI message format
   * @param messages Internal messages
   * @returns OpenAI format messages
   */
  private convertMessagesToOpenAIFormat(messages: ChatMessage[]): any[] {
    return messages.map(message => {
      const baseMessage = {
        role: message.role,
        content: message.content,
      };

      // Add tool call information if available
      if (message.role === MessageRole.Assistant && message.toolCalls) {
        return {
          ...baseMessage,
          tool_calls: message.toolCalls.map(tc => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          })),
        };
      }

      // Add tool response information if available
      if (message.role === MessageRole.Tool) {
        return {
          ...baseMessage,
          tool_call_id: message.toolCallId,
          name: message.toolName,
        };
      }

      return baseMessage;
    });
  }

  /**
   * Send a chat completion request and return a streaming response
   * @param params Chat completion parameters
   * @returns Async generator of stream chunks
   */
  async chatCompletion(params: ChatCompletionParams): Promise<AsyncGenerator<StreamChunk>> {
    // Convert messages to OpenAI format
    const openaiMessages = this.convertMessagesToOpenAIFormat(params.messages);

    // Send request to OpenAI
    const response = await this.openaiClient.chat.completions.create({
      model: params.model,
      messages: openaiMessages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      stream: true,
      tools: params.tools,
      tool_choice: "auto",
    }, {
      signal: params.abortSignal,
    });

    // Create and return async generator
    return this.processStreamResponse(response);
  }

  /**
   * Process streaming response from OpenAI
   * @param response OpenAI streaming response
   * @returns Async generator of stream chunks
   */
  private async *processStreamResponse(response: any): AsyncGenerator<StreamChunk> {
    let activeToolCall: {
      id: string;
      name: string;
      args: string;
    } | null = null;

    // Process each chunk
    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta;

      // No delta content, skip
      if (!delta) continue;

      // Handle text content
      if (delta.content) {
        yield {
          type: "text",
          text: delta.content,
        };
      }

      // Handle tool calls
      if (delta.tool_calls && delta.tool_calls.length > 0) {
        const toolCall = delta.tool_calls[0];

        // Initialize new tool call
        if (toolCall.index === 0 && toolCall.id) {
          activeToolCall = {
            id: toolCall.id,
            name: toolCall.function?.name || "",
            args: toolCall.function?.arguments || "",
          };
        }

        // Update active tool call
        if (activeToolCall) {
          if (toolCall.function?.name) {
            activeToolCall.name = toolCall.function.name;
          }
          if (toolCall.function?.arguments) {
            activeToolCall.args += toolCall.function.arguments;
          }
        }
      }

      // Check if this is the last chunk for the current tool call
      if (chunk.choices[0]?.finish_reason === "tool_calls" && activeToolCall) {
        try {
          // Parse arguments - ensure we have valid JSON
          let args;
          try {
            args = JSON.parse(activeToolCall.args);
          } catch (parseError) {
            console.error("Error parsing tool call arguments:", parseError);
            // If parsing fails, use the raw string as args
            args = activeToolCall.args;
          }

          // Yield tool call
          yield {
            type: "tool_call",
            toolCall: {
              id: activeToolCall.id,
              name: activeToolCall.name,
              args,
            },
          };
        } catch (error) {
          console.error("Error processing tool call:", error);

          // Yield error information
          yield {
            type: "text",
            text: `Error processing tool call: ${error instanceof Error ? error.message : String(error)}`,
          };
        }

        // Reset active tool call
        activeToolCall = null;
      }
    }
  }
}
