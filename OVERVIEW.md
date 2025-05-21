# Bibble - CLI Chatbot with MCP Support

Bibble is a command-line interface (CLI) chatbot application that integrates with language models and supports the Model Context Protocol (MCP) for enhanced functionality through external tools.

*Last updated: May 21, 2025*

## Project Overview

Bibble provides a terminal-based interface for interacting with AI language models, with support for:

- Chat sessions with OpenAI models (GPT-4.1, o4-mini, etc)
- Tool use through the Model Context Protocol (MCP)
- Configuration management with dot-notation access
- Chat history tracking, export, and import
- Markdown rendering in the terminal
- Colored text output with customizable settings
- Real-time response streaming
- Contextual multi-turn conversations
- Multiple model support with model-specific parameters
- User guidelines for customizing AI behavior
- Built-in control flow tools (task_complete, ask_question)

## Architecture

Bibble follows a modular architecture with clear separation of concerns:

- **Command Pattern**: Uses Commander.js to define and handle CLI commands
- **Singleton Pattern**: For configuration and service management (Config class)
- **Factory Pattern**: For creating and managing instances
- **Stream Processing**: For handling real-time responses from LLMs
- **Adapter Pattern**: For converting between different message formats

## Project Structure

```
/
├── src/                  # Main source code directory
│   ├── commands/         # CLI command handlers
│   │   ├── chat.ts       # Chat command implementation
│   │   ├── config.ts     # Configuration command implementation
│   │   └── history.ts    # History command implementation
│   ├── config/           # Configuration management
│   │   ├── config.ts     # Config class for managing settings
│   │   └── storage.ts    # Configuration storage utilities
│   ├── mcp/              # MCP client implementation
│   │   ├── agent.ts      # Agent class for managing conversations with tools
│   │   └── client.ts     # MCP client for connecting to servers
│   ├── llm/              # LLM integration
│   │   └── client.ts     # LLM client for OpenAI API
│   ├── ui/               # Terminal UI components
│   │   ├── chat.ts       # Chat UI for interactive sessions
│   │   ├── colors.ts     # Terminal color utilities
│   │   └── markdown.ts   # Markdown rendering for terminal
│   ├── utils/            # Utility functions
│   │   └── history.ts    # Chat history management
│   ├── index.ts          # Main entry point
│   └── types.ts          # TypeScript type definitions
├── bin/                  # Binary executable
│   └── bibble.js         # Entry script
├── reference/            # Reference documentation
├── package.json          # NPM package definition
└── tsconfig.json         # TypeScript configuration
```

## Key Components

### CLI Interface

Bibble uses Commander.js to create a command-line interface with several commands:

- `bibble chat` - Start a chat session with an AI model
- `bibble config` - Manage configuration settings
- `bibble history` - Manage chat history

### Configuration Management

Configuration is stored in a `.bibble` directory in the user's home directory, managed by the `Config` class which provides a singleton interface for accessing and modifying settings. The configuration includes:

- API keys for LLM providers
- Default model settings
- UI preferences (color output, markdown rendering)
- MCP server configurations
- User guidelines
- Model definitions with specific parameters

The configuration system supports:
- Dot-notation access to nested properties
- Default values for missing properties
- Secure storage of API keys
- JSON serialization and deserialization
- Command-line management via `bibble config` commands

### LLM Integration

Bibble integrates with OpenAI's API to provide chat functionality, supporting different models like GPT-4.1 and o4-mini. The `LlmClient` class handles:

- Chat completion requests
- Streaming responses
- Message format conversion
- Tool integration
- Model-specific parameters

The application supports both traditional OpenAI models and the newer o-series models (o1, o1-pro, o3, o3-mini, o4-mini), automatically adjusting parameters based on the model type:
- Traditional models use `temperature` and `maxTokens` parameters
- O-series models use `reasoningEffort` and `maxCompletionTokens` parameters

### Agent Implementation

The `Agent` class is the core component that manages conversations and tool usage:

- Extends the `McpClient` class to inherit tool management capabilities
- Uses a hardcoded `DEFAULT_SYSTEM_PROMPT` for consistent behavior
- Supports configurable user guidelines as additional instructions
- Implements a conversation loop with a maximum number of turns
- Handles tool calls and responses
- Provides built-in control flow tools:
  - `task_complete`: Called when the task is complete
  - `ask_question`: Called when the agent needs more information

### MCP Client

Bibble functions as an MCP client, allowing it to connect to MCP-compatible servers and use their tools. The MCP implementation includes:

- `McpClient` class for connecting to MCP servers
  - Manages connections to multiple MCP servers
  - Handles tool discovery and registration
  - Routes tool calls to appropriate servers
- Tool handling for passing to LLM and processing responses
  - Formats tool definitions for LLM context
  - Processes tool calls from LLM responses
  - Routes tool calls to appropriate servers
  - Formats tool results for LLM context

### Terminal UI

The application provides a terminal-based UI for chat interactions, including:

- Colored text output using Chalk
- Markdown rendering with markdown-it
- Interactive chat interface with commands:
  - `/help` - Display help information
  - `/exit` or `/quit` - Exit the chat
  - `/clear` - Clear the screen
  - `/save` - Save the current chat to history
  - `/reset` - Reset the current conversation

### Chat History

The application can save, load, and manage chat history, allowing users to:

- List previous chats
- Continue previous conversations
- Export and import chat history
- Delete individual chats or clear all history

## Application Flow

1. User starts the application with `bibble` or `bibble chat`
2. The application initializes:
   - Loads configuration from the `.bibble` directory
   - Checks for API keys, prompting the user if needed
   - Sets up the chat UI and agent
   - Initializes MCP client and connects to configured servers

3. The chat loop begins:
   - User enters a message or command
   - If it's a command (starts with `/`), it's processed by the ChatUI
   - If it's a message, it's sent to the Agent

4. The Agent processes the message:
   - Adds the user message to the conversation
   - Sends the conversation to the LLM with available tools
   - Processes the streaming response
   - Handles any tool calls by sending them to the appropriate MCP server
   - Returns the final response to the ChatUI

5. The ChatUI displays the response:
   - Formats the text with colors
   - Renders markdown if enabled
   - Waits for the next user input

## MCP Integration

MCP (Model Context Protocol) allows language models to use external tools. The protocol standardizes how language models interact with external tools and services, extending their capabilities beyond text generation.

### How MCP Works in Bibble

1. **Server Configuration**: Users can configure MCP servers using `bibble config mcp-servers`
2. **Tool Discovery**: When Bibble starts, it connects to configured MCP servers and discovers available tools
3. **Tool Registration**: Available tools are registered with the Agent and made available to the language model
4. **Tool Calling Process**:
   - The language model decides to call a tool based on the user's request
   - Bibble identifies the appropriate MCP server for the requested tool
   - The tool call is sent to the server with the necessary arguments
   - The server processes the request and returns a response
   - Bibble adds the tool response to the conversation
   - The conversation continues with the LLM, which can now use the tool's response

### MCP Server Implementation

Bibble uses the `@modelcontextprotocol/sdk` package to connect to MCP servers via the `StdioClientTransport` interface. This allows it to communicate with servers that implement the MCP protocol, regardless of the programming language they're written in.

## Build System

Bibble uses:

- TypeScript with strict typing
- ESM modules
- tsup for bundling
- Node.js v18+ compatibility

## Getting Started

### Installation

#### From NPM

```bash
# Install globally
npm install -g @pinkpixel/bibble

# Or use with npx
npx @pinkpixel/bibble
```

#### From Source

```bash
git clone https://github.com/pinkpixel-dev/bibble.git
cd bibble
npm install
npm run build
npm link  # Optional: to make the command available globally
```

The package is published on npm as `@pinkpixel/bibble` and includes all necessary dependencies. It's compatible with Node.js v18 and later.

### Configuration

Set up your OpenAI API key:

```bash
bibble config api-key
```

Configure MCP servers (optional):

```bash
bibble config mcp-servers
```

### Basic Usage

Start a chat session:

```bash
# Default command (starts chat)
bibble

# Explicitly use the chat command
bibble chat

# Use a specific model
bibble chat --model gpt-4

# Continue the most recent chat
bibble chat --continue

# Load a specific chat history
bibble chat --history <history-id>
```

### Chat Commands

During a chat session, you can use these commands:

- `/help` - Display help information
- `/exit` or `/quit` - Exit the chat
- `/clear` - Clear the screen
- `/save` - Save the current chat to history
- `/reset` - Reset the current conversation

### Managing Chat History

```bash
# List all saved chats
bibble history list

# View a specific chat
bibble history show <id>

# Export a chat to a file
bibble history export <id> <filename>

# Import a chat from a file
bibble history import <filename>

# Delete a chat
bibble history delete <id>

# Clear all chat history
bibble history clear
```

## Development

### Building the Project

```bash
# Build the project
npm run build

# Development mode with watch
npm run dev
```

### Adding New Commands

To add a new command, create a new file in the `src/commands/` directory and implement the command using Commander.js. Then import and register the command in `src/index.ts`.

### Entry Points and Binary Files

The `bin` directory contains the entry point scripts for the CLI:

- `bibble.js` - Main ESM entry script
- `bibble-cli.js` - ESM compatibility wrapper
- `bibble-cli.cjs` - CommonJS compatibility wrapper
- `bibble.cmd` - Windows command file

The package.json defines the binary entry point:

```json
"bin": {
  "bibble": "./bin/bibble-cli.cjs"
}
```

This structure ensures compatibility across different Node.js environments and operating systems.

## License

ISC
