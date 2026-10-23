import { describe, it, expect } from "vitest";
import { engineError } from "../src/tools/toolResult.js";
import { EngineDisconnectedError } from "../src/engine/engineHandle.js";

describe("engineError", () => {
  it("keeps ENGINE_DISCONNECTED for a tab that went away mid-call", () => {
    expect(engineError(new EngineDisconnectedError("default")).error.code).toBe("ENGINE_DISCONNECTED");
  });

  it("reports any other failure as ENGINE_ERROR, with optional context", () => {
    expect(engineError(new Error("boom"), "failed to start session").error).toEqual({
      code: "ENGINE_ERROR",
      message: "failed to start session: boom",
    });
  });
});
