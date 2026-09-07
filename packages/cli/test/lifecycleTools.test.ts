import { describe, it, expect, vi } from "vitest";
import { buildLifecycleTools } from "../src/tools/lifecycleTools.js";
import { SessionManager } from "../src/session/sessionManager.js";

/**
 * Lifecycle-tool unit tests. Focus on the tool wrappers around
 * SessionManager, not the actual spawnWebApp path (unit-tested
 * separately + covered end-to-end in the runStart smoke).
 */

describe("start_session tool", () => {
  it("declares requiresSession = false so it runs before any session exists", () => {
    const session = new SessionManager({
      instanceLabel: "default",
      openBrowser: false,
      browser: "chrome",
    });
    const [startTool] = buildLifecycleTools(session);
    expect(startTool.name).toBe("start_session");
    expect(startTool.requiresSession).toBe(false);
  });

  it("returns a stub state with the session's instance label", async () => {
    const session = new SessionManager({
      instanceLabel: "test-instance",
      openBrowser: false,
      browser: "chrome",
    });
    // Skip real start by mocking; verify the handler wraps errors correctly.
    vi.spyOn(session, "start").mockImplementation(async () => ({
      instanceLabel: "test-instance",
      wsPort: 8765,
      webAppUrl: "http://localhost:5173?ws-port=8765&instance=test-instance",
      openedInBrowser: false,
    }));
    const [startTool] = buildLifecycleTools(session);
    const r = await startTool.handle({}, {} as never);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.instance).toBe("test-instance");
    expect(r.data).toMatchObject({
      instanceLabel: "test-instance",
      wsPort: 8765,
      openedInBrowser: false,
    });
  });

  it("returns ENGINE_ERROR when start throws", async () => {
    const session = new SessionManager({
      instanceLabel: "default",
      openBrowser: false,
      browser: "chrome",
    });
    vi.spyOn(session, "start").mockImplementation(async () => {
      throw new Error("port already in use");
    });
    const [startTool] = buildLifecycleTools(session);
    const r = await startTool.handle({}, {} as never);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("ENGINE_ERROR");
    expect(r.error.message).toMatch(/port already in use/);
  });
});

describe("stop_session tool", () => {
  it("declares requiresSession = false so it can be called any time (idempotent)", () => {
    const session = new SessionManager({
      instanceLabel: "default",
      openBrowser: false,
      browser: "chrome",
    });
    const [, stopTool] = buildLifecycleTools(session);
    expect(stopTool.name).toBe("stop_session");
    expect(stopTool.requiresSession).toBe(false);
  });

  it("returns ok even when no session is running (idempotent)", async () => {
    const session = new SessionManager({
      instanceLabel: "default",
      openBrowser: false,
      browser: "chrome",
    });
    const [, stopTool] = buildLifecycleTools(session);
    const r = await stopTool.handle({}, {} as never);
    expect(r.ok).toBe(true);
  });
});
