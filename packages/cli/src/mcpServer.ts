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
  CallToolRequestSchema,
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
import { buildToolRegistry, type ToolSpec } from "./tools/registry.js";
import type { EngineHandle } from "./engine/engineHandle.js";

export interface McpServerConfig {
  serverName: string;
  serverVersion: string;
  /**
   * Engine lookup for tool dispatch. Given an optional `instance`
   * arg from the tool call, return the corresponding EngineHandle
   * (or an error). Chunk C accepts a single engine; multi-instance
   * routing lands in Phase 3.
   */
  resolveEngine: (instance?: string) => EngineHandle | { error: { code: string; message: string; details?: unknown } };
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
  // Tools (Chunk C: session + input; Chunk D adds macros)
  // -----------------------------------------------------------------
  const toolRegistry: Map<string, ToolSpec> = buildToolRegistry();

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Array.from(toolRegistry.values()).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as { type: "object" } & Record<string, unknown>,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolRegistry.get(request.params.name);
    if (!tool) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { ok: false, error: { code: "TOOL_UNKNOWN", message: `no such tool: ${request.params.name}` } },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const instance = typeof args.instance === "string" ? args.instance : undefined;
    const engineOrErr = config.resolveEngine(instance);
    if ("error" in engineOrErr) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ok: false, error: engineOrErr.error }, null, 2),
          },
        ],
        isError: true,
      };
    }
    const result = await tool.handle(args, engineOrErr);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: !result.ok,
    };
  });

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
