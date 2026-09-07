/**
 * SessionManager — owns the lifecycle of one Synesthetica session.
 *
 * A session in Route 1 (SPEC 014 §Lifecycle) is the state of having
 * a running web-app + WS bridge + browser tab. The MCP server is
 * always running (that's the "connect to Claude Desktop and stay
 * cheap" part); the session is what starts/stops around it.
 *
 * States:
 *   stopped   — no pipeline; no browser; no bridge. Default.
 *   starting  — start() in progress. Race guard.
 *   running   — bridge up, browser tab open (unless suppressed).
 *   stopping  — stop() in progress.
 *
 * Failure to start (bridge port taken, web-app spawn fails) leaves
 * the manager in `stopped` with the error re-thrown to the caller.
 * Partially-started resources are torn down before throwing.
 */

import type { EngineHandle } from "../engine/engineHandle.js";
import type { WebAppHandle } from "../webApp/spawnWebApp.js";
import type { WsBridgeHandle } from "../engine/wsBridge.js";
import { spawnWebApp } from "../webApp/spawnWebApp.js";
import { openBrowser } from "../webApp/openBrowser.js";
import { startWsBridge } from "../engine/wsBridge.js";

export type SessionState = "stopped" | "starting" | "running" | "stopping";

export interface SessionManagerOptions {
  instanceLabel: string;
  wsPort?: number;
  webAppPort?: number;
  openBrowser: boolean;
  browser: "default" | "chrome";
  log?: (line: string) => void;
}

export interface StartSessionSummary {
  instanceLabel: string;
  wsPort: number;
  webAppUrl: string;
  openedInBrowser: boolean;
}

export class SessionManager {
  private state: SessionState = "stopped";
  private webApp?: WebAppHandle;
  private bridge?: WsBridgeHandle;
  private engine?: EngineHandle;
  private log: (line: string) => void;

  constructor(private options: SessionManagerOptions) {
    this.log = options.log ?? (() => {});
  }

  getState(): SessionState {
    return this.state;
  }

  isRunning(): boolean {
    return this.state === "running";
  }

  /** The engine handle for the running session, or null if no
   *  session is active. Callers should check isRunning() first and
   *  return ENGINE_NOT_STARTED to the LLM when this is null. */
  getEngine(): EngineHandle | null {
    return this.state === "running" && this.engine ? this.engine : null;
  }

  /** Instance label the manager was constructed with — used to
   *  populate INSTANCE_NOT_FOUND errors. */
  get instanceLabel(): string {
    return this.options.instanceLabel;
  }

  async start(): Promise<StartSessionSummary> {
    if (this.state === "running") {
      return this.currentSummary();
    }
    if (this.state === "starting" || this.state === "stopping") {
      throw new Error(`session is ${this.state}; wait for it to settle before starting`);
    }
    this.state = "starting";
    try {
      this.bridge = await startWsBridge({
        port: this.options.wsPort ?? 0,
        log: this.log,
      });
      this.log(`engine bridge listening on ws://localhost:${this.bridge.port}`);
      this.engine = this.bridge.handleFor(this.options.instanceLabel);

      this.webApp = await spawnWebApp({
        port: this.options.webAppPort,
      });
      const openUrl =
        this.webApp.url +
        `?ws-port=${this.bridge.port}&instance=${encodeURIComponent(this.options.instanceLabel)}`;
      this.log(`web app ready at ${openUrl}`);

      let openedInBrowser = false;
      if (this.options.openBrowser) {
        openBrowser(openUrl, this.options.browser);
        openedInBrowser = true;
      }

      this.state = "running";
      return {
        instanceLabel: this.options.instanceLabel,
        wsPort: this.bridge.port,
        webAppUrl: openUrl,
        openedInBrowser,
      };
    } catch (err) {
      // Partial start: tear down anything we managed to bring up.
      await this.teardown();
      this.state = "stopped";
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.state === "stopped") return;
    if (this.state === "stopping") return;
    this.state = "stopping";
    await this.teardown();
    this.state = "stopped";
  }

  private async teardown(): Promise<void> {
    // Order: web-app first (Vite subprocess), then bridge (WS server).
    // Engine handle doesn't need explicit close — it's derived from
    // the bridge and dies with it.
    const tasks: Array<[string, () => Promise<void>]> = [];
    if (this.webApp) {
      const wa = this.webApp;
      tasks.push([`web app (${wa.mode})`, () => wa.close()]);
    }
    if (this.bridge) {
      const br = this.bridge;
      tasks.push(["engine bridge (WS)", () => br.close()]);
    }
    for (const [name, run] of tasks) {
      const t0 = Date.now();
      try {
        await run();
        this.log(`  ✓ ${name} (${Date.now() - t0}ms)`);
      } catch (e) {
        this.log(
          `  ✗ ${name} (${Date.now() - t0}ms): ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    this.webApp = undefined;
    this.bridge = undefined;
    this.engine = undefined;
  }

  private currentSummary(): StartSessionSummary {
    if (!this.bridge || !this.webApp) {
      throw new Error("currentSummary called on non-running session");
    }
    return {
      instanceLabel: this.options.instanceLabel,
      wsPort: this.bridge.port,
      webAppUrl:
        this.webApp.url +
        `?ws-port=${this.bridge.port}&instance=${encodeURIComponent(this.options.instanceLabel)}`,
      openedInBrowser: this.options.openBrowser,
    };
  }
}
