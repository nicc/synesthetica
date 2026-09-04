/**
 * MCP resource backed by the engine's live input enumeration.
 *
 *   inputs://    — array of AvailableInput { kind, name, id, sourceString }
 *
 * The value the LLM should pass to set_input(source) is right there
 * as `sourceString` on each entry — no wheel-reconstruction needed.
 *
 * Pull-only for now. Device connect/disconnect notifications are
 * planned (SPEC 013 marks the resource subscribable in principle),
 * but require plumbing state-changed notifications for a specific
 * URI through the WS bridge, so v1 is on-demand reads.
 */

import type { EngineHandle } from "../engine/engineHandle.js";
import type { AsyncResourceEntry } from "../state/stateResources.js";

export function buildInputResources(engine: EngineHandle): AsyncResourceEntry[] {
  return [
    {
      uri: "inputs://",
      name: "Available inputs",
      description:
        "Currently-connected MIDI devices + audio inputs. Each entry carries a sourceString ready to pass to set_input(source). Read on demand — hot-plug notifications aren't wired yet.",
      mimeType: "application/json",
      subscribable: false,
      async read() {
        const inputs = await engine.getAvailableInputs();
        return JSON.stringify(inputs, null, 2);
      },
    },
  ];
}
