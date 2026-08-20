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
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
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
import {
  buildStateResources,
  type AsyncResourceEntry,
} from "./state/stateResources.js";
import type { PresetStore } from "./presets/presetStore.js";

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
  /** Every running engine at server-start, for state resource seeding. */
  engines: EngineHandle[];
  /** Filesystem preset store. */
  presetStore: PresetStore;
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
  // Resources — annotations (Chunk B) + state (Chunk E)
  // -----------------------------------------------------------------
  const annotationEntries: ResourceEntry[] = buildAnnotationResources(productionManifest);
  const stateEntries: AsyncResourceEntry[] = config.engines.flatMap((e) =>
    buildStateResources(e),
  );

  // Two indices — annotations are sync, state is async. ReadResource
  // dispatches based on which map the URI hits.
  const syncIndex = new Map<string, ResourceEntry>();
  for (const e of annotationEntries) syncIndex.set(e.uri, e);
  const asyncIndex = new Map<string, AsyncResourceEntry>();
  // For state URIs, register the exact URI without query params;
  // the query is parsed in read().
  for (const e of stateEntries) asyncIndex.set(e.uri, e);

  // Track state-changed subscriptions per URI so we know who to notify.
  const stateSubscribers = new Map<string, number>(); // uri → count
  const engineUnsubs = new Map<string, () => void>(); // uri → unsub fn

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      ...annotationEntries.map((e) => ({
        uri: e.uri,
        name: e.name,
        description: e.description,
        mimeType: e.mimeType,
      })),
      ...stateEntries.map((e) => ({
        uri: e.uri,
        name: e.name,
        description: e.description,
        mimeType: e.mimeType,
      })),
    ],
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

    // Try sync (annotation) index first.
    const sync = syncIndex.get(uri);
    if (sync) {
      return {
        contents: [
          { uri: sync.uri, mimeType: sync.mimeType, text: sync.read() },
        ],
      };
    }

    // Try async (state) index. Strip query string for lookup; pass
    // the full URI through so the resource can parse ?limit=, ?since=.
    const bareUri = uri.split("?")[0];
    const async = asyncIndex.get(bareUri);
    if (async) {
      const text = await async.read(uri);
      return {
        contents: [
          { uri, mimeType: async.mimeType, text },
        ],
      };
    }

    throw new Error(`resource not found: ${uri}`);
  });

  // Subscribe / unsubscribe for state://<label>/current only.
  // recent-events is pull-only per SPEC 013 §I30 — reject subscriptions.
  server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    const uri = request.params.uri;
    const entry = asyncIndex.get(uri);
    if (!entry) {
      throw new Error(`no such resource to subscribe to: ${uri}`);
    }
    if (!entry.subscribable) {
      throw new Error(
        `${uri} is pull-only (SPEC 013 §I30). Read the resource on demand instead of subscribing.`,
      );
    }
    // Increment sub count; on first subscriber, attach engine listener.
    const prev = stateSubscribers.get(uri) ?? 0;
    stateSubscribers.set(uri, prev + 1);
    if (prev === 0) {
      // Find the engine that owns this URI (state://<label>/current).
      const label = uri.replace(/^state:\/\//, "").split("/")[0];
      const engine = config.engines.find((e) => e.label === label);
      if (engine) {
        const unsub = engine.subscribe("state-changed", () => {
          void server.notification({
            method: "notifications/resources/updated",
            params: { uri },
          });
        });
        engineUnsubs.set(uri, unsub);
      }
    }
    return {};
  });

  server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    const uri = request.params.uri;
    const prev = stateSubscribers.get(uri) ?? 0;
    const next = Math.max(0, prev - 1);
    stateSubscribers.set(uri, next);
    if (next === 0) {
      const unsub = engineUnsubs.get(uri);
      if (unsub) {
        unsub();
        engineUnsubs.delete(uri);
      }
    }
    return {};
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
  const toolRegistry: Map<string, ToolSpec> = buildToolRegistry(config.presetStore);

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
