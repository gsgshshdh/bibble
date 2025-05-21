import { McpClient, ChatCompletionInputTool } from "./client.js";
import { Config } from "../config/config.js";
import { BibbleConfig } from "../config/storage.js";
import { LlmClient } from "../llm/client.js";
import { ChatMessage, MessageRole } from "../types.js";

// Default system prompt - hardcoded and non-configurable
export const DEFAULT_SYSTEM_PROMPT = `
You are an agent - please keep going until the user's query is completely resolved, before ending your turn and yielding back to the user. Only terminate your turn when you are sure that the problem is solved, or if you need more info from the user to solve the problem.

If you are not sure about anything pertaining to the user's request, use your tools to read files and gather the relevant information: do NOT guess or make up an answer.

You MUST plan extensively before each function call, and reflect extensively on the outcomes of the previous function calls. DO NOT do this entire process by making function calls only, as this can impair your ability to solve the problem and think insightfully.
`;

// Agent configuration options
export interface AgentOptions {
  model?: string;
  userGuidelines?: string;
  servers?: BibbleConfig["mcpServers"];
}

// Agent chat options
export interface ChatOptions {
  abortSignal?: AbortSignal;
  model?: string;
}

// Control flow tools
const taskCompletionTool: ChatCompletionInputTool = {
  type: "function",
  function: {
    name: "task_complete",
    description: "Call this tool when the task given by the user is complete",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};

const askQuestionTool: ChatCompletionInputTool = {
  type: "function",
  function: {
    name: "ask_question",
    description: "Ask a question to the user to get more info required to solve or clarify their problem.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};

// Maximum number of turns before ending conversation
const MAX_NUM_TURNS = 10;

/**
 * Agent class implementing the chat loop on top of McpClient
 */
export class Agent extends McpClient {
  private llmClient: LlmClient;
  // Use protected to avoid conflict with McpClient's private config
  protected configInstance = Config.getInstance();
  private messages: ChatMessage[] = [];
  private model: string;
  private exitLoopTools = [taskCompletionTool, askQuestionTool];

  constructor(options: AgentOptions = {}) {
    super(options);

    // Initialize LLM client
    this.llmClient = new LlmClient();

    // Set model
    this.model = options.model || this.configInstance.getDefaultModel();

    // Initialize messages with hardcoded system prompt
    this.messages = [
      {
        role: MessageRole.System,
        content: DEFAULT_SYSTEM_PROMPT,
      },
    ];

    // Add user guidelines if available
    const userGuidelines = options.userGuidelines || this.configInstance.getUserGuidelines();
    if (userGuidelines) {
      this.messages.push({
        role: MessageRole.System,
        content: `Additional user guidelines: ${userGuidelines}`,
      });
    }
  }

  /**
   * Initialize the agent by loading tools
   */
  async initialize(): Promise<void> {
    await this.loadTools();
  }

  /**
   * Chat with the agent
   * @param input User input
   * @param options Chat options
   */
  async chat(input: string, options: ChatOptions = {}): Promise<AsyncGenerator<string>> {
    // Add user message
    this.messages.push({
      role: MessageRole.User,
      content: input,
    });

    // Use provided model or default model
    const model = options.model || this.model;

    // Start conversation loop
    return this.conversationLoop(model, options.abortSignal);
  }

  /**
   * The main agent conversation loop
   * @param model Model to use
   * @param abortSignal Optional abort signal
   */
  private async *conversationLoop(
    model: string,
    abortSignal?: AbortSignal
  ): AsyncGenerator<string> {
    let numOfTurns = 0;
    let nextTurnShouldCallTools = true;

    while (true) {
      try {
        // Process a single turn
        yield* this.processTurn({
          exitLoopTools: this.exitLoopTools,
          exitIfFirstChunkNoTool: numOfTurns > 0 && nextTurnShouldCallTools,
          abortSignal,
          model,
        });
      } catch (err) {
        if (err instanceof Error && err.message === "AbortError") {
          return;
        }
        throw err;
      }

      numOfTurns++;

      // Get the last message
      const currentLast = this.messages[this.messages.length - 1];

      // Exit loop if an exit loop tool was called
      if (
        currentLast.role === MessageRole.Tool &&
        currentLast.toolName &&
        this.exitLoopTools.map((t) => t.function.name).includes(currentLast.toolName)
      ) {
        return;
      }

      // Exit if exceeding max turns
      if (currentLast.role !== MessageRole.Tool && numOfTurns > MAX_NUM_TURNS) {
        return;
      }

      // Exit if should call tools but didn't
      if (currentLast.role !== MessageRole.Tool && nextTurnShouldCallTools) {
        return;
      }

      // Toggle tool call expectation
      if (currentLast.role === MessageRole.Tool) {
        nextTurnShouldCallTools = false;
      } else {
        nextTurnShouldCallTools = true;
      }
    }
  }

  /**
   * Process a single turn in the conversation
   * @param options Processing options
   */
  private async *processTurn(options: {
    exitLoopTools: ChatCompletionInputTool[];
    exitIfFirstChunkNoTool: boolean;
    abortSignal?: AbortSignal;
    model: string;
  }): AsyncGenerator<string> {
    // Create combined tools list with exit loop tools
    const tools = [...this.availableTools, ...options.exitLoopTools];

    // Get model configuration
    const models = this.configInstance.get<Array<{
      id: string;
      provider: string;
      name: string;
      maxTokens?: number;
      temperature?: number;
      maxCompletionTokens?: number;
      reasoningEffort?: "low" | "medium" | "high";
      isReasoningModel?: boolean;
    }>>("models", []);

    const modelConfig = models.find(m => m.id.toLowerCase() === options.model.toLowerCase());

    // Prepare chat completion parameters
    const chatParams = {
      model: options.model,
      messages: this.messages,
      tools,
      abortSignal: options.abortSignal,
    } as any;

    // Add model-specific parameters
    if (modelConfig) {
      if (modelConfig.isReasoningModel) {
        chatParams.reasoningEffort = modelConfig.reasoningEffort || "medium";
        chatParams.maxCompletionTokens = modelConfig.maxCompletionTokens;
      } else {
        chatParams.temperature = modelConfig.temperature;
        chatParams.maxTokens = modelConfig.maxTokens;
      }
    }

    // Stream response from LLM
    const stream = await this.llmClient.chatCompletion(chatParams);

    let responseText = "";
    let firstChunk = true;
    let hasToolCall = false;

    // Process stream chunks
    for await (const chunk of stream) {
      // Check for tool call
      if (chunk.type === "tool_call") {
        hasToolCall = true;

        try {
          // Call the tool
          const { name, args } = chunk.toolCall;
          const toolResult = await this.callTool(name, args);

          // Add assistant message with tool call
          this.messages.push({
            role: MessageRole.Assistant,
            content: responseText,
            toolCalls: [{
              id: chunk.toolCall.id,
              name,
              args,
            }],
          });

          // Add tool message with result
          this.messages.push({
            role: MessageRole.Tool,
            content: toolResult.content,
            toolName: name,
            toolCallId: chunk.toolCall.id,
          });

          // Format args for display - handle both objects and strings
          let displayArgs;
          try {
            // If args is already an object, stringify it
            // If it's a string that can be parsed as JSON, parse and then stringify it for formatting
            displayArgs = typeof args === 'string' ? args : JSON.stringify(args);
          } catch (error) {
            // If there's any error, just use the args as is
            displayArgs = String(args);
          }

          // Yield tool call information
          yield `\n[Tool Call] ${name}(${displayArgs})\n${toolResult.content}\n`;
        } catch (error) {
          console.error("Error handling tool call:", error);
          yield `\nError handling tool call: ${error instanceof Error ? error.message : String(error)}\n`;
        }
      } else if (chunk.type === "text") {
        responseText += chunk.text;
        yield chunk.text;

        // Exit on first chunk with no tool if specified
        if (firstChunk && options.exitIfFirstChunkNoTool) {
          firstChunk = false;
        }
      }
    }

    // If no tool call was made, add assistant message
    if (!hasToolCall) {
      this.messages.push({
        role: MessageRole.Assistant,
        content: responseText,
      });
    }
  }

  /**
   * Reset conversation history
   */
  resetConversation(): void {
    const userGuidelines = this.configInstance.getUserGuidelines();

    this.messages = [
      {
        role: MessageRole.System,
        content: DEFAULT_SYSTEM_PROMPT,
      },
    ];

    if (userGuidelines) {
      this.messages.push({
        role: MessageRole.System,
        content: `Additional user guidelines: ${userGuidelines}`,
      });
    }
  }

  /**
   * Get conversation history
   */
  getConversation(): ChatMessage[] {
    return this.messages;
  }

  /**
   * Set model to use
   */
  setModel(model: string): void {
    this.model = model;
  }
}
