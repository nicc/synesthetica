/**
 * State + recent-events resources per SPEC 013 §Resources.
 *
 *   state://<label>/current            — subscribable snapshot
 *   state://<label>/recent-events      — pull-only (SPEC 013 I30)
 *
 * `current` is subscribable — the URI fires an updated notification
 * whenever the engine's state changes (any set_* tool succeeded, a
 * preset loaded, input changed). Cadence is bounded by decision
 * events (safe to subscribe).
 *
 * `recent-events` is pull-only. Musical activity at pipeline cadence
 * would pump inference in some MCP clients. LLM reads when it wants
 * context. Query params supported:
 *   ?limit=<N>   — return at most N events (default 100, max 1000)
 *   ?since=<id>  — return events with id > this
 */

import type { EngineHandle } from "../engine/engineHandle.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * Build state resources for one instance. Returned entries have
 * async read (unlike annotation resources which are sync); the MCP
 * server handles both shapes via readResource.
 */
export interface AsyncResourceEntry {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  read(uri?: string): Promise<string>;
  subscribable: boolean;
}

export function buildStateResources(engine: EngineHandle): AsyncResourceEntry[] {
  const label = engine.label;
  return [
    {
      uri: `state://${label}/current`,
      name: `${label} — current state`,
      description:
        "Snapshot of current macro values, prescribed context, active preset, and input source. Subscribable.",
      mimeType: "application/json",
      subscribable: true,
      async read() {
        const snapshot = await engine.getStateSnapshot();
        return JSON.stringify(snapshot, null, 2);
      },
    },
    {
      uri: `state://${label}/recent-events`,
      name: `${label} — recent events`,
      description:
        "Recent musical activity (notes, chords, dynamics events). Pull-only — read on demand. Supports ?limit=N and ?since=<id> query params.",
      mimeType: "application/json",
      subscribable: false,
      async read(uri?: string) {
        const { limit, since } = parseRecentEventsQuery(uri);
        const events = await engine.getRecentEvents(limit, since);
        return JSON.stringify(events, null, 2);
      },
    },
  ];
}

function parseRecentEventsQuery(uri?: string): { limit: number; since: number | undefined } {
  if (!uri) return { limit: DEFAULT_LIMIT, since: undefined };
  const q = uri.split("?")[1];
  if (!q) return { limit: DEFAULT_LIMIT, since: undefined };
  const params = new URLSearchParams(q);
  const rawLimit = params.get("limit");
  const rawSince = params.get("since");
  let limit = rawLimit ? Number(rawLimit) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  const since = rawSince !== null ? Number(rawSince) : undefined;
  return { limit, since: since !== undefined && Number.isInteger(since) ? since : undefined };
}
