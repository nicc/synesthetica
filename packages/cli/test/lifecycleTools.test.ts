import { describe, it, expect, vi } from "vitest";
import { buildLifecycleTools } from "../src/tools/lifecycleTools.js";
import { SessionManager } from "../src/session/sessionManager.js";
import { StubEngineHandle } from "../src/engine/stubEngineHandle.js";

function makeSession(instanceLabel: string): SessionManager {
  return new SessionManager({ instanceLabel, openBrowser: false, browser: "chrome" });
}

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

  const summary = {
    instanceLabel: "test-instance",
    wsPort: 8765,
    webAppUrl: "http://localhost:5173?ws-port=8765&instance=test-instance",
    openedInBrowser: false,
  };

  function startedSession() {
    const session = makeSession("test-instance");
    vi.spyOn(session, "start").mockResolvedValue(summary);
    return session;
  }

  it("returns the live engine's state and the start summary when the engine is up", async () => {
    const session = startedSession();
    const engine = new StubEngineHandle({ label: "test-instance" });
    await engine.setTempo(97);
    vi.spyOn(session, "getEngine").mockReturnValue(engine);
    const [startTool] = buildLifecycleTools(session);
    const r = await startTool.handle({}, {} as never);
    expect(r).toEqual({ ok: true, state: await engine.getStateSnapshot(), data: summary });
  });

  it("falls back to a placeholder state labelled with the instance when there is no engine", async () => {
    const session = startedSession();
    vi.spyOn(session, "getEngine").mockReturnValue(null);
    const [startTool] = buildLifecycleTools(session);
    const r = await startTool.handle({}, {} as never);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.instance).toBe("test-instance");
    expect(r.data).toEqual(summary);
  });

  it("falls back to the placeholder state when reading engine state throws", async () => {
    const session = startedSession();
    const engine = new StubEngineHandle({ label: "test-instance" });
    vi.spyOn(engine, "getStateSnapshot").mockRejectedValue(new Error("not ready"));
    vi.spyOn(session, "getEngine").mockReturnValue(engine);
    const [startTool] = buildLifecycleTools(session);
    const r = await startTool.handle({}, {} as never);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.instance).toBe("test-instance");
    expect(r.data).toEqual(summary);
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

  it("returns ENGINE_ERROR when stop throws", async () => {
    const session = makeSession("default");
    vi.spyOn(session, "stop").mockRejectedValue(new Error("subprocess stuck"));
    const [, stopTool] = buildLifecycleTools(session);
    const r = await stopTool.handle({}, {} as never);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("ENGINE_ERROR");
    expect(r.error.message).toMatch(/subprocess stuck/);
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
