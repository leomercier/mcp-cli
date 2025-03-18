# MCP Tunnel

A simple MCP (Model Context Protocol) server that allows accessing the command line of a VM machine. When started, it also tunnels the host to the web so it can be accessed via MCP.

## Features

- Execute shell commands on a VM through MCP
- Web-based terminal interface for VM interaction
- Automatic tunneling to make the VM accessible from anywhere
- WebSocket-based real-time communication

## Prerequisites

- Node.js (v18 or newer)

## Installation and Usage

### Running with npx (no installation)

```bash
npx mcp-cli
```

### Global Installation

```bash
npm install -g mcp-cli
mcp-cli
```

### Local Development

```bash
# Clone repository
git clone [repository-url]
cd mcp-cli

# Install dependencies
npm install
```

## Development

Run the development server with hot-reloading for both backend and frontend:

```bash
npm run dev
```

## Building

Build both the frontend and backend for production:

```bash
npm run build-all
```

## Usage

1. Start the MCP server:

```bash
# Start with automatic tunneling
npm start

# Start without automatic tunneling
npm start -- --no-tunnel
```

This will build the project and start the server. By default, a tunnel will be created automatically. Use the `--no-tunnel` flag to disable automatic tunneling.

2. The server will start and provide output on stderr (to avoid interfering with MCP communication on stdout)

3. Use MCP to interact with the server using the following tools:

### Available MCP Tools

- `execute_command`: Run a shell command on the VM
  - Parameters: `{ "command": "your shell command" }`
- `start_tunnel`: Create a web tunnel to access the VM interface
  - Parameters: `{ "port": 8080, "subdomain": "optional-subdomain" }`

## Web Interface

After starting the tunnel, you can access the web-based terminal interface at the URL provided by the tunnel. This interface allows you to:

- Execute commands directly in the VM
- See command outputs in real-time
- Interact with the VM from any device with web access

## Environment Variables

Create a `.env` file to configure the server:

```
# Server configuration
PORT=8080

# Localtunnel configuration
LOCALTUNNEL_SUBDOMAIN=your-preferred-subdomain
```

## Security Considerations

This tool provides direct access to your VM's command line. Consider these security practices:

- Use strong authentication mechanisms before exposing the tunnel
- Limit the commands that can be executed through proper validation
- Consider running in a restricted environment
- Do not expose sensitive information through the tunnel
