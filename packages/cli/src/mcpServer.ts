/**
 * MCP server foundation. Registers tools and resources; delegates the
 * actual handling to injected handlers so the transport concern stays
 * separate from the engine concern.
 *
 * Chunk A scope: server starts, handshakes, serves empty tool +
 * resource lists. No real tools or resources yet — those come in
 * chunks B (resources) and C/D (tools).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export interface McpServerConfig {
  serverName: string;
  serverVersion: string;
}

export async function startMcpServer(
  config: McpServerConfig,
  transport: "stdio" | "tcp",
  port: number | null,
): Promise<{ close(): Promise<void> }> {
  const server = new Server(
    {
      name: config.serverName,
      version: config.serverVersion,
    },
    {
      capabilities: {
        tools: {},
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
      },
    },
  );

  // Chunk A: empty handlers. Real registrations land in later chunks.
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [] }));
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [] }));

  if (transport === "stdio") {
    const stdio = new StdioServerTransport();
    await server.connect(stdio);
  } else {
    // TCP transport not implemented in Chunk A. The MCP SDK requires
    // a separate SSE/streamable-http transport; we'll add that when a
    // user actually needs it. For now, reject cleanly.
    void port;
    throw new Error(
      "TCP transport not yet implemented — use --transport stdio (the default)",
    );
  }

  return {
    async close() {
      await server.close();
    },
  };
}
