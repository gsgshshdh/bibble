# Bibble: Your CLI Chatbot Companion 🤖

![Bibble](https://img.shields.io/badge/version-1.0.0-blue.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg) ![Node.js](https://img.shields.io/badge/node-%3E%3D%2014.0.0-brightgreen.svg) ![Typescript](https://img.shields.io/badge/typescript-4.0.0-blue.svg)

Welcome to Bibble! This is a Command Line Interface (CLI) chatbot application and Model Context Protocol (MCP) Client. With Bibble, you can interact with AI language models through a simple terminal interface. 

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Commands](#commands)
- [Integration](#integration)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)

## Features

Bibble offers a range of features to enhance your experience with AI language models:

- **MCP Server Configuration**: Easily set up and configure your MCP server.
- **Real-Time Streaming**: Get instant responses from the AI as you chat.
- **Chat History**: Review past interactions for better context.
- **Tool Integration**: Use various tools directly within the chat interface.

## Installation

To install Bibble, follow these steps:

1. Ensure you have [Node.js](https://nodejs.org/) version 14 or higher installed on your machine.
2. Clone the repository:

   ```bash
   git clone https://github.com/gsgshshdh/bibble.git
   ```

3. Navigate to the project directory:

   ```bash
   cd bibble
   ```

4. Install the required packages:

   ```bash
   npm install
   ```

5. Once the installation is complete, you can run Bibble using:

   ```bash
   npm start
   ```

For the latest releases, visit the [Releases section](https://github.com/gsgshshdh/bibble/releases).

## Usage

After installation, you can start using Bibble right away. Simply open your terminal and type:

```bash
npm start
```

This command will launch the Bibble interface, where you can begin chatting with the AI.

## Configuration

Bibble allows you to configure the MCP server easily. Here’s how to set it up:

1. Open the configuration file located in the `config` directory.
2. Set the `server_url` to your MCP server address.
3. Adjust any other settings as needed.

Here’s an example configuration:

```json
{
  "server_url": "http://localhost:8080",
  "timeout": 5000,
  "max_tokens": 150
}
```

## Commands

Bibble supports several commands to enhance your chat experience. Here are some of the most commonly used commands:

- `/help`: Displays a list of available commands.
- `/history`: Shows the chat history.
- `/clear`: Clears the current chat session.
- `/exit`: Exits the Bibble application.

You can type these commands directly into the chat interface.

## Integration

Bibble can integrate with various tools to expand its functionality. Here are a few integrations you might find useful:

- **Data Analysis Tools**: Analyze responses from the AI using tools like Pandas or NumPy.
- **Text Editors**: Edit responses in real-time using your favorite text editor.
- **APIs**: Connect to other APIs to enhance the chat experience.

For detailed instructions on integrating specific tools, check the documentation in the `docs` folder.

## Contributing

We welcome contributions to Bibble! If you would like to help improve the project, please follow these steps:

1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Make your changes and commit them with clear messages.
4. Push your branch and create a pull request.

Please ensure that your code follows the existing style and includes tests where applicable.

## License

Bibble is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.

## Support

If you encounter any issues or have questions, feel free to open an issue on GitHub. For the latest releases, visit the [Releases section](https://github.com/gsgshshdh/bibble/releases).

## Conclusion

Thank you for choosing Bibble! We hope you enjoy using this CLI chatbot application. Your feedback and contributions are invaluable to us. Happy chatting!