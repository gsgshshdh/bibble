/**
 * Anthropic API client implementation
 */

import Anthropic from "@anthropic-ai/sdk";
import { Config } from "../config/config.js";
import { ChatMessage, MessageRole, StreamChunk } from "../types.js";

// Anthropic API types
interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContent[];
}

type AnthropicContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: any }
  | { type: "tool_result"; tool_use_id: string; content: string };

// Anthropic API request parameters
interface AnthropicRequestParams {
  model: string;
  messages: AnthropicMessage[];
  max_tokens?: number;
  temperature?: number;
  system?: string;
  tools?: AnthropicTool[];
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  thinking?: {
    type: "enabled";
    budget_tokens: number;
  };
}

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: any;
}

interface AnthropicChatCompletionResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicContent[];
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamChunk {
  type: string; // message_start, message_delta, message_stop, content_block_start, content_block_delta, content_block_stop
  delta?: {
    type?: string;
    text?: string;
    content?: Array<{
      type: string;
      text?: string;
      tool_use?: {
        id: string;
        name: string;
        input: any;
      };
    }>;
  };
  content_block?: {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    tool_use?: {
      id: string;
      name: string;
      input: any;
    };
  };
}

/**
 * Anthropic API client
 */
export class AnthropicClient {
  private client: Anthropic;
  private config = Config.getInstance();

  constructor(options: { apiKey?: string; baseUrl?: string } = {}) {
    // Get API key from options or config
    const apiKey = options.apiKey || this.config.getApiKey("anthropic") || "";

    if (!apiKey) {
      throw new Error("Anthropic API key is required. Please set it in the configuration or provide it in the options.");
    }

    // Get base URL from options or config
    const baseURL = options.baseUrl || this.config.get("apis.anthropic.baseUrl");

    // Create Anthropic client
    this.client = new Anthropic({
      apiKey,
      baseURL
    });
  }

  /**
   * Convert Bibble messages to Anthropic messages
   */
  private convertToAnthropicMessages(messages: ChatMessage[]): AnthropicMessage[] {
    const result: AnthropicMessage[] = [];

    // Process messages
    for (const message of messages) {
      // Skip system messages as they are handled separately
      if (message.role === MessageRole.System) {
        continue;
      }

      // Handle tool responses
      if (message.role === MessageRole.Tool && message.toolName && message.toolCallId) {
        // Add tool results as user messages
        result.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: message.toolCallId,
              content: message.content
            }
          ]
        });
        continue;
      }

      // Handle assistant messages with tool calls
      if (message.role === MessageRole.Assistant && message.toolCalls && message.toolCalls.length > 0) {
        const content: AnthropicContent[] = [];

        // Add text content if any
        if (message.content) {
          content.push({ type: "text", text: message.content });
        }

        // Add tool calls
        for (const toolCall of message.toolCalls) {
          content.push({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.args
          });
        }

        result.push({ role: "assistant", content });
        continue;
      }

      // Handle regular user or assistant messages
      result.push({
        role: message.role === MessageRole.User ? "user" : "assistant",
        content: [{ type: "text", text: message.content }]
      });
    }

    return result;
  }

  // No need for convertFromAnthropicResponse as we're using streaming

  /**
   * Process Anthropic stream chunks into Bibble StreamChunk format
   */
  private processAnthropicStreamChunk(chunk: AnthropicStreamChunk): StreamChunk | null {
    // Handle text content
    if (chunk.type === "content_block_delta" && chunk.delta?.text) {
      return {
        type: "text",
        text: chunk.delta.text
      };
    }

    // Handle tool calls in content blocks
    if (chunk.type === "content_block_start" && chunk.content_block?.type === "tool_use") {
      const toolUse = chunk.content_block;
      const toolCall = {
        id: toolUse.id || Math.random().toString(36).substring(2, 15),
        name: toolUse.name || "",
        args: toolUse.tool_use?.input || {}
      };

      return {
        type: "tool_call",
        toolCall
      };
    }

    // Handle tool calls in message delta
    if (chunk.type === "message_delta" &&
        chunk.delta?.content &&
        Array.isArray(chunk.delta.content)) {

      for (const content of chunk.delta.content) {
        if (content.type === "tool_use" && content.tool_use) {
          const toolCall = {
            id: content.tool_use.id || Math.random().toString(36).substring(2, 15),
            name: content.tool_use.name || "",
            args: content.tool_use.input || {}
          };

          return {
            type: "tool_call",
            toolCall
          };
        }
      }
    }

    return null;
  }

  /**
   * Send a chat completion request to Anthropic and return a streaming response
   * @param params Chat completion parameters
   * @returns Async generator of stream chunks
   */
  async chatCompletion(params: {
    model: string;
    messages: ChatMessage[];
    tools?: any[];
    temperature?: number;
    maxTokens?: number;
    abortSignal?: AbortSignal;
    stream?: boolean;
    thinking?: boolean;
    thinkingBudgetTokens?: number;
    topP?: number;
    topK?: number;
    stopSequences?: string[];
  }): Promise<AsyncGenerator<StreamChunk>> {
    // Enhance messages with additional tool usage guidance for Claude
    let enhancedMessages = params.messages;
    if (params.tools && params.tools.length > 0) {
      enhancedMessages = (params.messages);
    }

    // Convert messages to Anthropic format
    const anthropicMessages = this.convertToAnthropicMessages(enhancedMessages);

    // Extract system message if present
    let systemMessage = "";
    enhancedMessages.forEach(msg => {
      if (msg.role === MessageRole.System) {
        systemMessage += msg.content + "\n";
      }
    });

    // Prepare request parameters
    const requestParams: any = {
      model: params.model,
      messages: anthropicMessages,
      max_tokens: params.maxTokens || 4096,
      temperature: params.temperature || 0.7,
      stream: true,
      system: systemMessage.trim() || undefined
    };

    // Add optional parameters
    if (params.topP !== undefined) {
      requestParams.top_p = params.topP;
    }

    if (params.topK !== undefined) {
      requestParams.top_k = params.topK;
    }

    if (params.stopSequences) {
      requestParams.stop_sequences = params.stopSequences;
    }

    // Add tools if provided
    if (params.tools && params.tools.length > 0) {
      requestParams.tools = params.tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters
      }));
    }

    // Add thinking parameter for Claude 3.7 Sonnet
    if (params.model.includes("claude-3-7") && params.thinking) {
      requestParams.thinking = {
        type: "enabled",
        budget_tokens: params.thinkingBudgetTokens || 16000
      };
    }

    // Send request to Anthropic with retry logic for overloaded errors
    const maxRetries = 3;
    let retryCount = 0;
    let response;

    while (retryCount < maxRetries) {
      try {
        response = await this.client.messages.create(requestParams, {
          signal: params.abortSignal
        });
        break; // Success, exit the retry loop
      } catch (error) {
        if (error instanceof Error && error.message.includes("overloaded")) {
          retryCount++;
          if (retryCount < maxRetries) {
            // Exponential backoff: wait longer between each retry
            const waitTime = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
            console.log(`Anthropic API overloaded. Retrying in ${waitTime/1000} seconds... (Attempt ${retryCount} of ${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            console.error("Anthropic API is still overloaded after maximum retry attempts.");
            throw error;
          }
        } else {
          // Not an overloaded error, just throw it
          throw error;
        }
      }
    }

    // Create and return async generator
    return this.processStreamResponse(response);
  }

  /**
   * Process streaming response from Anthropic
   * @param response Anthropic streaming response
   * @returns Async generator of stream chunks
   */
  private async *processStreamResponse(response: any): AsyncGenerator<StreamChunk> {
    try {
      for await (const chunk of response) {
        // Process the chunk for streaming
        const processedChunk = this.processAnthropicStreamChunk(chunk);
        if (processedChunk) {
          yield processedChunk;
        }
      }
    } catch (error) {
      // Handle overloaded error
      if (error instanceof Error) {
        const errorMessage = error.message;
        if (errorMessage.includes("overloaded")) {
          console.error("Anthropic API is currently overloaded. Please try again in a few moments.");
          yield {
            type: "text",
            text: "\n\nError: Anthropic API is currently overloaded. Please try again in a few moments or try using a different model."
          };
        } else {
          console.error("Error from Anthropic API:", errorMessage);
          yield {
            type: "text",
            text: `\n\nError from Anthropic API: ${errorMessage}`
          };
        }
      } else {
        console.error("Unknown error from Anthropic API:", error);
        yield {
          type: "text",
          text: "\n\nUnknown error from Anthropic API. Please try again or try using a different model."
        };
      }
    }
  }
}
