import { describe, it, expect, afterEach, vi } from "vitest";
import WebSocket from "ws";
import { ENGINE_BRIDGE_PROTOCOL, type BrowserToCli } from "@synesthetica/contracts";
import { SessionManager } from "../src/session/sessionManager.js";
import { startWsBridge } from "../src/engine/wsBridge.js";

/**
 * SessionManager unit tests. The state machine + null-when-stopped
 * getEngine() semantics are what the ENGINE_NOT_STARTED behaviour
 * downstream depends on. The lifecycle tests inject a fake web app and
 * a fake browser (a WebSocket client that plays the tab's handshake)
 * around a real bridge.
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

describe("SessionManager — the visualiser tab", () => {
  /** The pretend tab opened by the fake browser, most recent last. */
  let tabs: WebSocket[] = [];
  let session: SessionManager | null = null;

  afterEach(async () => {
    for (const t of tabs) t.close();
    tabs = [];
    await session?.stop();
    session = null;
  });

  /** A browser that, when asked to open the visualiser, connects to the
   *  bridge port in the URL and signals hello + pipeline-ready. */
  function fakeOpenBrowser(url: string): void {
    const port = new URL(url).searchParams.get("ws-port");
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.once("open", () => {
      const hello: BrowserToCli = { type: "hello", label: "default", protocol: ENGINE_BRIDGE_PROTOCOL };
      ws.send(JSON.stringify(hello));
      const ready: BrowserToCli = { type: "pipeline-ready", label: "default" };
      ws.send(JSON.stringify(ready));
    });
    tabs.push(ws);
  }

  function makeSession(): SessionManager {
    return new SessionManager(
      { instanceLabel: "default", openBrowser: true, browser: "chrome", reconnectGraceMs: 50 },
      {
        startWsBridge,
        spawnWebApp: async () => ({ url: "http://localhost:1/", mode: "static", close: async () => {} }),
        openBrowser: fakeOpenBrowser,
      },
    );
  }

  it("start_session on a running, connected session doesn't open another tab", async () => {
    session = makeSession();
    await session.start();
    const again = await session.start();

    expect(tabs).toHaveLength(1);
    expect(again.openedInBrowser).toBe(false);
  });

  it("start_session reopens the tab when the session's tab was closed", async () => {
    session = makeSession();
    await session.start();
    const engine = session.getEngine()!;
    tabs[0].close();
    // The bridge sees the close a moment after the client does.
    await vi.waitFor(async () => expect(await engine.awaitConnected(0)).toBe(false));

    const summary = await session.start();

    expect(tabs).toHaveLength(2);
    expect(summary.openedInBrowser).toBe(true);
    expect(await engine.awaitConnected(0)).toBe(true);
  });
});
