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

import { productionManifest } from "@synesthetica/contracts";
import {
  buildAnnotationResources,
  type ResourceEntry,
} from "./resources/annotationResources.js";
import {
  buildPromptResources,
  composeSystemOverview,
  computePrimerToken,
  type PromptEntry,
} from "./resources/promptResources.js";
import {
  buildToolRegistry,
  PRIMER_EXEMPT,
  type ToolSpec,
} from "./tools/registry.js";
import type { EngineHandle, StateSnapshot } from "./engine/engineHandle.js";
import {
  buildStateResources,
  type AsyncResourceEntry,
} from "./state/stateResources.js";
import type { PresetStore } from "./presets/presetStore.js";
import { buildPresetResources } from "./presets/presetResources.js";
import { buildInputResources } from "./inputs/inputResources.js";
import type { SessionManager } from "./session/sessionManager.js";
import { StubEngineHandle } from "./engine/stubEngineHandle.js";

export interface McpServerConfig {
  serverName: string;
  serverVersion: string;
  /**
   * Session lifecycle owner. Tools with requiresSession !== false
   * check session.isRunning() before dispatch; the LLM sees
   * ENGINE_NOT_STARTED when it tries to touch the engine before
   * calling start_session.
   */
  session: SessionManager;
  /** Filesystem preset store. */
  presetStore: PresetStore;
  /** Server-level primer text; set as MCP initialize `instructions`. */
  serverInstructions?: string;
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
      // Server-level primer surfaced by clients that honour the
      // MCP `initialize.instructions` field (Claude Desktop /
      // Claude Code). Kept intentionally short — the LLM is
      // pointed at `get_started` for the full primer, so idle
      // conversations that never touch music don't pay the full
      // token cost.
      instructions: config.serverInstructions,
    },
  );

  // -----------------------------------------------------------------
  // Resources — annotations (always) + state/input (session-scoped)
  // -----------------------------------------------------------------
  const annotationEntries: ResourceEntry[] = buildAnnotationResources(productionManifest);
  // State + input resources are always advertised but read live
  // against the session: when no session is running they surface
  // a not-started marker. Route 1: state:// and inputs:// are for
  // user-triggered attach; the LLM reaches equivalent content via
  // get_state / list_inputs tools which apply ENGINE_NOT_STARTED
  // gating at their own layer.
  const lazyEngineForResources = buildSessionEngineProxy(config.session);
  const stateEntries: AsyncResourceEntry[] = buildStateResources(lazyEngineForResources);
  const presetResources = buildPresetResources(config.presetStore);
  const inputEntries: AsyncResourceEntry[] = buildInputResources(lazyEngineForResources);

  // Two indices — annotations are sync, state + presets index are
  // async. ReadResource dispatches based on which map the URI hits.
  const syncIndex = new Map<string, ResourceEntry>();
  for (const e of annotationEntries) syncIndex.set(e.uri, e);
  const asyncIndex = new Map<string, AsyncResourceEntry>();
  // For state URIs, register the exact URI without query params;
  // the query is parsed in read().
  for (const e of stateEntries) asyncIndex.set(e.uri, e);
  for (const e of presetResources.entries) asyncIndex.set(e.uri, e);
  for (const e of inputEntries) asyncIndex.set(e.uri, e);

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
      ...presetResources.entries.map((e) => ({
        uri: e.uri,
        name: e.name,
        description: e.description,
        mimeType: e.mimeType,
      })),
      ...inputEntries.map((e) => ({
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
      {
        uriTemplate: "presets://{name}",
        name: "Preset — one entry",
        description:
          "Full stored content of one preset (macros, session, input). Enumerate names at presets://.",
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

    // Try async (state / presets index) map. Strip query string for
    // lookup; pass the full URI through so the resource can parse
    // ?limit=, ?since=.
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

    // Template-routed preset items — presets://<name>.
    if (presetResources.matchesItemUri(bareUri)) {
      const { mimeType, text } = await presetResources.readItemUri(bareUri);
      return {
        contents: [
          { uri, mimeType, text },
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
      // Find the engine that owns this URI. Only one instance today,
      // so match against the SessionManager's label. When no session
      // is running the subscribe is a no-op — reactivated on next
      // start_session by the resource proxy.
      const label = uri.replace(/^state:\/\//, "").split("/")[0];
      const engine =
        label === config.session.instanceLabel ? config.session.getEngine() : null;
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
  // Tools — session/setter/reader/lifecycle
  //
  // Route 1 (SPEC 014): the MCP server is always-on; the pipeline
  // sits behind start_session. Tools with requiresSession !== false
  // fail fast with ENGINE_NOT_STARTED when no session is running,
  // pointing the LLM at start_session. Lifecycle tools (start_session,
  // stop_session) and content tools (get_started) run regardless.
  // -----------------------------------------------------------------
  const toolRegistry: Map<string, ToolSpec> = buildToolRegistry(
    config.presetStore,
    config.session,
  );

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

    // Primer gate: every non-get_started tool requires a valid primer
    // token. A missing or stale token is refused; the response body
    // carries the current primer text + fresh token so the LLM can
    // resync in a single round-trip (read the primer, retry with the
    // new token — no manual get_started call needed to recover).
    // The token is a SHA-256 fingerprint of the primer text truncated
    // to 16 hex chars — changes whenever the primer content changes,
    // which invalidates outstanding tokens automatically.
    if (!PRIMER_EXEMPT.has(tool.name)) {
      const currentPrimer = composeSystemOverview();
      const currentToken = computePrimerToken(currentPrimer);
      const provided = typeof args.primer === "string" ? args.primer : "";
      if (provided !== currentToken) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: false,
                  error: {
                    code: "PRIMER_INVALID",
                    message: provided.length === 0
                      ? "Missing `primer` argument. Every tool except get_started requires a `primer` token (from get_started's response). The current primer + token are attached to this error's details — read the primer and retry with the new token."
                      : "Stale `primer` token — the primer has changed since you last called get_started. Read the primer text attached to this error's details and retry with the new token.",
                    details: {
                      primer: currentPrimer,
                      token: currentToken,
                    },
                  },
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
      // Strip primer from args so downstream handlers don't need to
      // know about the gate — they see the same schema as before.
      delete args.primer;
    }

    const instance = typeof args.instance === "string" ? args.instance : undefined;
    if (instance !== undefined && instance !== config.session.instanceLabel) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ok: false,
                error: {
                  code: "INSTANCE_NOT_FOUND",
                  message: `no instance labelled '${instance}' (only '${config.session.instanceLabel}' is configured)`,
                },
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const requiresSession = tool.requiresSession !== false;
    let engineForTool: EngineHandle;
    if (requiresSession) {
      const engine = config.session.getEngine();
      if (!engine) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: false,
                  error: {
                    code: "ENGINE_NOT_STARTED",
                    message: `no session running for '${config.session.instanceLabel}'. Call start_session first.`,
                  },
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
      engineForTool = engine;
    } else {
      // Lifecycle + content tools get a stub. They don't touch it.
      engineForTool = lazyEngineForResources;
    }

    const result = await tool.handle(args, engineForTool);
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

/**
 * A live-lookup EngineHandle that reads from SessionManager at call
 * time. When no session is running, each engine method throws with
 * a NOT_STARTED marker the caller (tools / resource reads) can
 * convert into ENGINE_NOT_STARTED. Used to advertise state:// and
 * inputs:// resources even before start_session — user-triggered
 * attach at that point shows the not-started state.
 */
function buildSessionEngineProxy(session: SessionManager): EngineHandle {
  const notStarted = (): never => {
    throw new Error(
      "no session is running — call start_session before using this resource",
    );
  };
  return {
    get label() {
      return session.instanceLabel;
    },
    get status() {
      switch (session.getState()) {
        case "running":
          return "running" as const;
        case "starting":
          return "starting" as const;
        case "stopping":
          return "stopping" as const;
        case "stopped":
          return "starting" as const;
      }
    },
    setMacro: async () => notStarted(),
    setKey: async () => notStarted(),
    setTempo: async () => notStarted(),
    setMeter: async () => notStarted(),
    setChordMode: async () => notStarted(),
    setMetronome: async () => notStarted(),
    setInput: async () => notStarted(),
    setHueForPitch: async () => notStarted(),
    switchPreset: async () => notStarted(),
    savePreset: async () => notStarted(),
    getStateSnapshot: async () => {
      const engine = session.getEngine();
      if (!engine) return emptyStubSnapshot(session.instanceLabel);
      return engine.getStateSnapshot();
    },
    getRecentEvents: async (limit, since) => {
      const engine = session.getEngine();
      if (!engine) return { startedAt: null, now: null, events: [] };
      return engine.getRecentEvents(limit, since);
    },
    getAvailableInputs: async () => {
      const engine = session.getEngine();
      if (!engine) return [];
      return engine.getAvailableInputs();
    },
    subscribe: (event, callback) => {
      const engine = session.getEngine();
      if (!engine) return () => {};
      return engine.subscribe(event, callback);
    },
    close: async () => {},
  };
}

function emptyStubSnapshot(label: string): StateSnapshot {
  return {
    instance: label,
    macros: { intents: {}, effective: {} },
    permissions: { midi: "prompt", audio: "prompt" },
    session: {
      tonic: null,
      mode: null,
      tempo: null,
      beatsPerBar: null,
      beatValue: null,
      chordMode: "harmonic",
      metronome: false,
      phase: "no-session",
    },
    input: null,
    activePreset: null,
    startedAt: null,
    now: null,
  };
}

// Retained import used by the proxy helper's return type inference above.
void StubEngineHandle;
