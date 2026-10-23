/**
 * Tool result shapes and error helpers shared by every MCP tool.
 * SPEC 013 §Tool results, SPEC 015 error codes.
 */

import type { EngineStateSnapshot } from "@synesthetica/contracts";
import { EngineDisconnectedError } from "../engine/engineHandle.js";

export interface ToolError {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

/** Success carries the post-op state; reads may add `data`. */
export type ToolResult = { ok: true; state: EngineStateSnapshot; data?: unknown } | ToolError;

export function err(code: string, message: string, details?: unknown): ToolError {
  return { ok: false, error: { code, message, ...(details ? { details } : {}) } };
}

/**
 * An engine call failed. A tab that disconnected mid-call keeps its
 * ENGINE_DISCONNECTED code (the LLM's cue to call start_session);
 * anything else is ENGINE_ERROR.
 */
export function engineError(e: unknown, context?: string): ToolError {
  const message = e instanceof Error ? e.message : String(e);
  const code = e instanceof EngineDisconnectedError ? e.code : "ENGINE_ERROR";
  return err(code, context ? `${context}: ${message}` : message);
}
