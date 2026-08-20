/**
 * MCP server foundation. Registers resources and tools; delegates
 * actual handling to injected sources so the transport concern stays
 * separate from the engine concern.
 *
 * Chunk B scope: annotation + prompt resources are served. Tool
 * surface remains empty; those come in Chunks C/D.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { smokeTestManifest as productionManifest } from "./annotations/manifest.js";
import {
  buildAnnotationResources,
  type ResourceEntry,
} from "./resources/annotationResources.js";
import {
  buildPromptResources,
  type PromptEntry,
} from "./resources/promptResources.js";

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

  // -----------------------------------------------------------------
  // Resources (Chunk B)
  // -----------------------------------------------------------------
  const resourceEntries: ResourceEntry[] = buildAnnotationResources(productionManifest);
  const resourceIndex = new Map<string, ResourceEntry>();
  for (const entry of resourceEntries) resourceIndex.set(entry.uri, entry);

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: resourceEntries.map((e) => ({
      uri: e.uri,
      name: e.name,
      description: e.description,
      mimeType: e.mimeType,
    })),
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    // Templates let clients construct URIs for resources they haven't
    // seen yet. We expose one per category — the list is finite but
    // clients that cache templates instead of the full list get a
    // smaller payload.
    resourceTemplates: [
      {
        uriTemplate: "annotations://macros/{id}",
        name: "Macro annotation",
        description: "One macro annotation; see annotations://manifest for the id list",
        mimeType: "application/json",
      },
      {
        uriTemplate: "annotations://session-controls/{id}",
        name: "Session control annotation",
        description: "One session-control annotation",
        mimeType: "application/json",
      },
      {
        uriTemplate: "annotations://concepts/{term}",
        name: "System concept",
        description: "Terminology dictionary entry",
        mimeType: "application/json",
      },
      {
        uriTemplate: "concepts://{term}",
        name: "System concept (short URI)",
        description: "Alias for annotations://concepts/{term}",
        mimeType: "application/json",
      },
      {
        uriTemplate: "annotations://grammars/{id}",
        name: "Grammar annotation",
        description: "One grammar annotation",
        mimeType: "application/json",
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const entry = resourceIndex.get(uri);
    if (!entry) {
      throw new Error(`resource not found: ${uri}`);
    }
    return {
      contents: [
        {
          uri: entry.uri,
          mimeType: entry.mimeType,
          text: entry.read(),
        },
      ],
    };
  });

  // -----------------------------------------------------------------
  // Prompts (Chunk B)
  // -----------------------------------------------------------------
  const prompts: Record<string, PromptEntry> = buildPromptResources();

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: Object.entries(prompts).map(([name, entry]) => ({
      name,
      description: entry.description,
    })),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const name = request.params.name;
    const prompt = prompts[name];
    if (!prompt) {
      throw new Error(`prompt not found: ${name}`);
    }
    return {
      description: prompt.description,
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: prompt.content,
          },
        },
      ],
    };
  });

  // -----------------------------------------------------------------
  // Tools (empty for now — Chunks C/D)
  // -----------------------------------------------------------------
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));

  // -----------------------------------------------------------------
  // Transport
  // -----------------------------------------------------------------
  if (transport === "stdio") {
    const stdio = new StdioServerTransport();
    await server.connect(stdio);
  } else {
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
