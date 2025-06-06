﻿
import { Config } from "../config/config.js"; // Adjust the path if needed
import OpenAI from "openai"; // Add this import for OpenAI

// Import ChatMessage and other related types
import type { ChatMessage, StreamChunk, ChatCompletionParams } from "../types.js";
import { MessageRole } from "../types.js";

// LLM client options
interface LlmClientOptions {
  apiKey?: string;
  baseURL?: string;
  provider?: string;
}

import { AnthropicClient } from "./anthropic.js";

/**
 * LLM Client for interacting with language models
 */
export class LlmClient {
  private config = Config.getInstance();
  private openaiClient: OpenAI | null = null;
  private anthropicClient: AnthropicClient | null = null;
  private provider: string = "openai";

  constructor(options: LlmClientOptions = {}) {
    // Get the default provider or use the one specified in options
    this.provider = options.provider || this.config.getDefaultProvider();

    // Initialize the appropriate client based on the provider
    if (this.provider === "anthropic") {
      // Get API key from options or config
      const apiKey = options.apiKey || this.config.getApiKey("anthropic");

      if (!apiKey) {
        throw new Error("Anthropic API key is required. Please set it in the configuration or provide it in the options.");
      }

      // Get base URL from options or config
      const baseURL = options.baseURL || this.config.get("apis.anthropic.baseUrl");

      // Create Anthropic client
      this.anthropicClient = new AnthropicClient({
        apiKey,
        baseUrl: baseURL,
      });
    } else if (this.provider === "openaiCompatible") {
      // Get base URL from options or config
      const baseURL = options.baseURL || this.config.get("apis.openaiCompatible.baseUrl", "");
      const requiresApiKey = this.config.get("apis.openaiCompatible.requiresApiKey", true);

      if (!baseURL) {
        throw new Error("Base URL for OpenAI-compatible endpoint is required. Please configure it using 'bibble config openai-compatible'.");
      }

      if (requiresApiKey) {
        // Get API key from options or config
        const apiKey = options.apiKey || this.config.get("apis.openaiCompatible.apiKey");

        if (!apiKey) {
          throw new Error("API key for OpenAI-compatible endpoint is required. Please configure it using 'bibble config openai-compatible'.");
        }

        // Create OpenAI client with API key
        this.openaiClient = new OpenAI({
          apiKey,
          baseURL,
        });
      } else {
        // Create OpenAI client without API key
        this.openaiClient = new OpenAI({
          apiKey: "dummy-key", // OpenAI client requires a non-empty string
          baseURL,
          dangerouslyAllowBrowser: true
        });
      }
    } else {
      // Use standard OpenAI provider
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
    // Use the appropriate client based on the provider
    if (this.provider === "anthropic" && this.anthropicClient) {
      // Get model config
      const modelConfig = this.config.getModelConfig(params.model);

      // Prepare Anthropic request parameters
      const requestParams: any = {
        model: params.model,
        messages: params.messages,
        tools: params.tools,
        maxTokens: params.maxTokens || modelConfig?.maxTokens || 4096,
        temperature: params.temperature || modelConfig?.temperature || 0.7,
        abortSignal: params.abortSignal,
        stream: true
      };

      // Add Anthropic-specific parameters
      if (params.topP !== undefined || modelConfig?.topP !== undefined) {
        requestParams.topP = params.topP || modelConfig?.topP;
      }

      if (params.topK !== undefined || modelConfig?.topK !== undefined) {
        requestParams.topK = params.topK || modelConfig?.topK;
      }

      // Add thinking parameter for Claude 3.7 Sonnet
      if (params.model.includes("claude-3-7")) {
        if (params.thinking !== undefined || modelConfig?.thinking !== undefined) {
          requestParams.thinking = params.thinking || modelConfig?.thinking;
        }
      }

      if (params.stopSequences) {
        requestParams.stopSequences = params.stopSequences;
      }

      // Call Anthropic client's chatCompletion method
      return this.anthropicClient.chatCompletion(requestParams);
    } else if (this.openaiClient) {
      // Convert messages to OpenAI format
      const openaiMessages = this.convertMessagesToOpenAIFormat(params.messages);

      // Check if this is a reasoning model (o-series)
      const isReasoningModel = this.isReasoningModel(params.model);

      // Prepare request parameters based on model type
      const requestParams: any = {
        model: params.model,
        messages: openaiMessages,
        stream: true,
        tools: params.tools,
        tool_choice: "auto",
      };

      // Add parameters based on model type
      if (isReasoningModel) {
        // For o-series models, use reasoning_effort and max_completion_tokens
        if (params.reasoningEffort) {
          requestParams.reasoning_effort = params.reasoningEffort;
        } else {
          requestParams.reasoning_effort = "medium"; // Default to medium if not specified
        }

        if (params.maxCompletionTokens) {
          requestParams.max_completion_tokens = params.maxCompletionTokens;
        }
      } else {
        // For GPT models, use temperature and max_tokens
        if (params.temperature !== undefined) {
          requestParams.temperature = params.temperature;
        }

        if (params.maxTokens !== undefined) {
          requestParams.max_tokens = params.maxTokens;
        }
      }

      // Send request to OpenAI
      const response = await this.openaiClient.chat.completions.create(requestParams, {
        signal: params.abortSignal,
      });

      // Create and return async generator
      return this.processStreamResponse(response);
    } else {
      throw new Error("No LLM client initialized");
    }
  }

  /**
   * Check if a model is a reasoning model (o-series)
   * @param modelId Model ID to check
   * @returns True if the model is a reasoning model
   */
  private isReasoningModel(modelId: string): boolean {
    // Normalize model ID to lowercase for consistent comparison
    const normalizedModelId = modelId.toLowerCase();

    // Check if the model ID starts with 'o' followed by a number or is explicitly marked as a reasoning model
    const isOSeries = /^o\d/.test(normalizedModelId);

    // Also check the model configuration
    const models = this.config.get("models", []) as Array<{ id: string; isReasoningModel?: boolean }>;
    const modelConfig = models.find((m) => m.id.toLowerCase() === normalizedModelId);

    return isOSeries || (modelConfig?.isReasoningModel === true);
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
