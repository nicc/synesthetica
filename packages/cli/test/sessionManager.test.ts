import { describe, it, expect } from "vitest";
import { SessionManager } from "../src/session/sessionManager.js";

/**
 * SessionManager unit tests. The state machine + null-when-stopped
 * getEngine() semantics are what the ENGINE_NOT_STARTED behaviour
 * downstream depends on. Actual start / stop hits the real
 * spawnWebApp + startWsBridge and is exercised end-to-end through
 * runStart smoke — not in unit tests.
 */

describe("SessionManager — initial state", () => {
  it("starts in stopped state with no engine", () => {
    const s = new SessionManager({
      instanceLabel: "default",
      openBrowser: false,
      browser: "chrome",
    });
    expect(s.getState()).toBe("stopped");
    expect(s.isRunning()).toBe(false);
    expect(s.getEngine()).toBeNull();
    expect(s.instanceLabel).toBe("default");
  });

  it("stop is a no-op when already stopped", async () => {
    const s = new SessionManager({
      instanceLabel: "default",
      openBrowser: false,
      browser: "chrome",
    });
    await expect(s.stop()).resolves.toBeUndefined();
    expect(s.getState()).toBe("stopped");
  });
});
