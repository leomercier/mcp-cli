#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { spawn } from "child_process";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { createReadStream, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import dotenv from "dotenv";
import localtunnel from "localtunnel";
import express from "express";

dotenv.config();

// Schemas for our tools
const shellCommandSchema = z.object({
  command: z.string().describe("Shell command to execute on the VM")
});

const tunnelConfigSchema = z.object({
  port: z.number().default(8080).describe("Port to tunnel to the web"),
  subdomain: z.string().optional().describe("Optional subdomain for the tunnel")
});

class VmMcpServer {
  private server: Server;
  private webServer: any;
  private wss!: WebSocketServer;
  private tunnel: any;
  private tunnelUrl: string | undefined;
  private serverPort = 8080;
  private __dirname = dirname(fileURLToPath(import.meta.url));
  private noTunnel = process.argv.includes("--no-tunnel");
  private app: any;
  private transport: any;

  constructor() {
    this.server = new Server(
      {
        name: "vm-mcp-server",
        version: "0.1.0"
      },
      {
        capabilities: {
          resources: {},
          tools: {}
        }
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
    this.setupWebServer();
  }

  private setupWebServer() {
    this.app = express();
    const distPath = join(this.__dirname, "/");
    const devPath = join(this.__dirname, "frontend", "src");

    // Check if we're in production (using built files) or development
    const isProduction = existsSync(distPath);
    const staticPath = isProduction ? distPath : devPath;

    // Serve static files
    this.app.use(express.static(staticPath));

    // Fallback route for SPA
    this.app.get("/", (req: any, res: any) => {
      res.sendFile(join(staticPath, "index.html"));
    });

    // Create HTTP server from Express app
    this.webServer = createServer(this.app);

    // Create WebSocket server for real-time communication
    this.wss = new WebSocketServer({
      server: this.webServer,
      path: "/ws"
    });

    this.wss.on("connection", (ws) => {
      console.error("Client connected to WebSocket");

      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === "command") {
            this.executeCommand(data.command, (output) => {
              ws.send(JSON.stringify({ type: "output", content: output }));
            });
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      });
    });
  }

  private executeCommand(command: string, callback: (output: string) => void) {
    console.error(`Executing command: ${command}`);

    const process = spawn("bash", ["-c", command]);

    process.stdout.on("data", (data: Buffer) => {
      callback(data.toString());
    });

    process.stderr.on("data", (data: Buffer) => {
      callback(data.toString());
    });

    process.on("error", (error: Error) => {
      callback(`Error: ${error.message}`);
    });

    process.on("close", (code: number | null) => {
      callback(`Command exited with code ${code}`);
    });
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      if (this.tunnel) {
        this.tunnel.close();
      }
      await this.server.close();
      this.webServer.close();
      process.exit(0);
    });
  }

  private setupHandlers() {
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "execute_command",
          description: "Execute a shell command on the VM",
          inputSchema: zodToJsonSchema(shellCommandSchema)
        },
        {
          name: "start_tunnel",
          description: "Start a web tunnel to access the VM interface",
          inputSchema: zodToJsonSchema(tunnelConfigSchema)
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case "execute_command":
          return this.handleExecuteCommand(request);
        case "start_tunnel":
          return this.handleStartTunnel(request);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleExecuteCommand(request: any) {
    const parsed = shellCommandSchema.safeParse(request.params.arguments);
    if (!parsed.success) {
      throw new McpError(ErrorCode.InvalidParams, "Invalid command arguments");
    }

    const { command } = parsed.data;

    return new Promise<any>((resolve) => {
      let output = "";

      this.executeCommand(command, (data) => {
        output += data;
      });

      // Simple timeout to collect output
      setTimeout(() => {
        resolve({
          content: [
            {
              type: "text",
              text:
                output ||
                "Command executed (no output or still running in background)"
            }
          ]
        });
      }, 2000);
    });
  }

  private async handleStartTunnel(request: any) {
    const parsed = tunnelConfigSchema.safeParse(request.params.arguments);
    if (!parsed.success) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Invalid tunnel configuration"
      );
    }

    const { port, subdomain } = parsed.data;
    this.serverPort = port;

    // Close existing tunnel if any
    if (this.tunnel) {
      this.tunnel.close();
    }

    try {
      // Create the tunnel
      const tunnelOptions: any = {
        port: this.serverPort
      };

      if (subdomain) {
        tunnelOptions.subdomain = subdomain;
      }

      this.tunnel = await localtunnel(tunnelOptions);
      this.tunnelUrl = this.tunnel.url;

      return {
        content: [
          {
            type: "text",
            text: `Tunnel created successfully. VM interface available at: ${this.tunnelUrl}`
          }
        ]
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create tunnel: ${error.message || String(error)}`
      );
    }
  }

  mcpTransportStart = async () => {
    this.app.get("/sse", async (req: any, res: any) => {
      this.transport = new SSEServerTransport("/messages", res);
      await this.server.connect(this.transport);
    });

    this.app.post("/messages", async (req: any, res: any) => {
      // Note: to support multiple simultaneous connections, these messages will
      // need to be routed to a specific matching transport. (This logic isn't
      // implemented here, for simplicity.)
      await this.transport.handlePostMessage(req, res);
    });
  };

  async run() {
    // Start the MCP server
    await this.mcpTransportStart();
    // Start the web server
    this.webServer.listen(this.serverPort, async () => {
      console.log(
        `Web server running on port http://localhost:${this.serverPort}`
      );

      // Auto-start tunnel unless --no-tunnel flag is provided
      if (!this.noTunnel) {
        await this.startTunnelOnBoot().catch((err) => {
          console.error("Failed to start tunnel on boot:", err.message);
        });
      }
    });

    console.error("VM MCP server running on stdio");
  }

  private async startTunnelOnBoot() {
    try {
      // Create the tunnel
      const tunnelOptions: any = {
        port: this.serverPort
      };

      // Optional subdomain from environment variable
      const subdomain = process.env.LOCALTUNNEL_SUBDOMAIN;
      if (subdomain) {
        tunnelOptions.subdomain = subdomain;
      }

      this.tunnel = await localtunnel(tunnelOptions);
      this.tunnelUrl = this.tunnel.url;

      console.error(
        `Tunnel created automatically. VM interface available at: ${this.tunnelUrl}`
      );

      return this.tunnelUrl;
    } catch (error: any) {
      console.error(
        `Failed to create tunnel: ${error.message || String(error)}`
      );
      throw error;
    }
  }
}

const server = new VmMcpServer();
server.run().catch(console.error);
