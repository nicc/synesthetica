/**
 * Session-lifecycle MCP tools:
 *   start_session — spawn the web-app + WS bridge + browser tab
 *   stop_session  — tear it all down
 *
 * These tools drive the SessionManager rather than an EngineHandle,
 * because they operate on the pipeline lifecycle itself. They don't
 * require a running session — start_session obviously not, and
 * stop_session is a no-op when nothing is running.
 *
 * See SPEC 014 §Lifecycle: MCP server is always-on and cheap; the
 * heavy pipeline runs only inside a session. The LLM calls
 * start_session when the user signals musical intent.
 */

import type { ToolSpec } from "./sessionTools.js";
import type { SessionManager } from "../session/sessionManager.js";

function err(code: string, message: string, details?: unknown) {
  return { ok: false as const, error: { code, message, ...(details ? { details } : {}) } };
}

function shape<T>(session: SessionManager, data?: T) {
  // Session-lifecycle tools return a stub-shaped `state` because the
  // real engine state is meaningless (or not yet present) at these
  // boundaries. The LLM calls get_state separately if it needs state.
  return {
    ok: true as const,
    state: {
      instance: session.instanceLabel,
      macros: { intents: {}, effective: {} },
      permissions: { midi: "prompt" as const, audio: "prompt" as const },
      session: {
        tonic: null,
        mode: null,
        tempo: null,
        beatsPerBar: null,
        beatValue: null,
        chordMode: "harmonic" as const,
        metronome: false,
        phase: "no-session" as const,
      },
      input: null,
      activePreset: null,
      startedAt: null,
      now: null,
    },
    data,
  };
}

export function buildLifecycleTools(session: SessionManager): ToolSpec[] {
  const startSessionTool: ToolSpec = {
    name: "start_session",
    description:
      "Spawn the visualiser: open the web-app in a browser tab, start the WS bridge, and connect the engine. Call this when the user signals musical intent (mentions playing, an instrument, tempo, rhythm, harmony, visualisation). Idempotent — a no-op if a session is already running. Every other engine tool (set_macro, set_key, etc.) requires a running session.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Instance label (optional when only one is running)." },
      },
      additionalProperties: false,
    },
    requiresSession: false,
    async handle(_args) {
      try {
        const summary = await session.start();
        // Prefer the real engine state (pipeline is ready by now,
        // permissions have been queried by the browser) over the
        // stub — the LLM sees permission status + phase + macro
        // state directly from the start_session return instead of
        // needing a follow-up get_state.
        const engine = session.getEngine();
        if (engine) {
          try {
            const state = await engine.getStateSnapshot();
            return { ok: true as const, state, data: summary };
          } catch {
            // Fall through to stub — shouldn't happen post-ready.
          }
        }
        return shape(session, summary);
      } catch (e) {
        return err(
          "ENGINE_ERROR",
          `failed to start session: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  };

  const stopSessionTool: ToolSpec = {
    name: "stop_session",
    description:
      "Tear the visualiser down: close the web-app subprocess and WS bridge. Call this when the user says they're done (thanks / that's it / stop / close). Idempotent — a no-op if no session is running. Preset saves remain valid across sessions.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string" },
      },
      additionalProperties: false,
    },
    requiresSession: false,
    async handle(_args) {
      try {
        await session.stop();
        return shape(session);
      } catch (e) {
        return err(
          "ENGINE_ERROR",
          `failed to stop session: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  };

  return [startSessionTool, stopSessionTool];
}
