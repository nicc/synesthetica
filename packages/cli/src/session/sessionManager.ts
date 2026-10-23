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

/**
 * Time SessionManager.start() waits for the browser to signal
 * `pipeline-ready` before failing. Generous — accommodates Chrome
 * cold start + Vite first-request + pipeline init.
 */
const PIPELINE_READY_TIMEOUT_MS = 15_000;

export interface SessionManagerOptions {
  instanceLabel: string;
  wsPort?: number;
  webAppPort?: number | undefined;
  openBrowser: boolean;
  browser: "default" | "chrome";
  /**
   * Max events retained in the browser's recent-events buffer.
   * Passed through to the tab via ?buffer-size=N so the browser
   * sizes its ring buffer accordingly.
   */
  recentEventsBufferSize?: number;
  log?: (line: string) => void;
  /** Override the bridge's reconnect grace period (tests). */
  reconnectGraceMs?: number;
}

/** Side-effecting collaborators, injectable so tests can run a session
 *  without a real web-app server or browser. */
export interface SessionManagerDeps {
  startWsBridge: typeof startWsBridge;
  spawnWebApp: typeof spawnWebApp;
  openBrowser: typeof openBrowser;
}

const DEFAULT_DEPS: SessionManagerDeps = { startWsBridge, spawnWebApp, openBrowser };

export interface StartSessionSummary {
  instanceLabel: string;
  wsPort: number;
  webAppUrl: string;
  openedInBrowser: boolean;
}

export class SessionManager {
  private state: SessionState = "stopped";
  private webApp: WebAppHandle | undefined;
  private bridge: WsBridgeHandle | undefined;
  private engine: EngineHandle | undefined;
  private log: (line: string) => void;

  constructor(
    private options: SessionManagerOptions,
    private readonly deps: SessionManagerDeps = DEFAULT_DEPS,
  ) {
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
      // Idempotent while the tab is connected. If the tab was closed or
      // crashed, reopen it: start_session is how the LLM recovers from
      // ENGINE_DISCONNECTED.
      if (await this.engine?.awaitConnected()) return this.currentSummary(false);
      return this.reopenTab();
    }
    if (this.state === "starting" || this.state === "stopping") {
      throw new Error(`session is ${this.state}; wait for it to settle before starting`);
    }
    this.state = "starting";
    try {
      this.bridge = await this.deps.startWsBridge({
        port: this.options.wsPort ?? 0,
        log: this.log,
        ...(this.options.reconnectGraceMs !== undefined && { reconnectGraceMs: this.options.reconnectGraceMs }),
      });
      this.log(`engine bridge listening on ws://localhost:${this.bridge.port}`);
      this.engine = this.bridge.handleFor(this.options.instanceLabel);

      this.webApp = await this.deps.spawnWebApp({
        port: this.options.webAppPort,
      });
      const openUrl = this.buildOpenUrl();
      this.log(`web app ready at ${openUrl}`);

      let openedInBrowser = false;
      if (this.options.openBrowser) {
        this.deps.openBrowser(openUrl, this.options.browser);
        openedInBrowser = true;
      }

      // Wait for the browser to finish wiring the pipeline before
      // returning ok:true. Prevents the "start_session succeeded but
      // the next set_macro silent-writes into a null pipeline" race.
      // 15 seconds is generous — enough for Chrome cold-start + Vite
      // dev server first-request + our own pipeline init.
      try {
        await this.bridge.awaitPipelineReady(
          this.options.instanceLabel,
          PIPELINE_READY_TIMEOUT_MS,
        );
      } catch (e) {
        this.log(
          `pipeline-ready wait failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        throw e;
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
          `  ✗ ${name} (${Date.now() - t0}ms): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    this.webApp = undefined;
    this.bridge = undefined;
    this.engine = undefined;
  }

  private currentSummary(openedInBrowser: boolean): StartSessionSummary {
    if (!this.bridge || !this.webApp) {
      throw new Error("currentSummary called on non-running session");
    }
    return {
      instanceLabel: this.options.instanceLabel,
      wsPort: this.bridge.port,
      webAppUrl: this.buildOpenUrl(),
      openedInBrowser,
    };
  }

  /** Reopen the visualiser for a running session whose tab is gone, and
   *  wait until the new tab's pipeline is ready. */
  private async reopenTab(): Promise<StartSessionSummary> {
    if (!this.bridge) throw new Error("reopenTab called on non-running session");
    const openUrl = this.buildOpenUrl();
    this.log(`tab for '${this.options.instanceLabel}' is disconnected; reopening ${openUrl}`);
    if (this.options.openBrowser) this.deps.openBrowser(openUrl, this.options.browser);
    await this.bridge.awaitPipelineReady(this.options.instanceLabel, PIPELINE_READY_TIMEOUT_MS);
    return this.currentSummary(this.options.openBrowser);
  }

  /**
   * Assemble the browser-facing URL with all runtime parameters the
   * tab needs — WS port, instance label, recent-events buffer size.
   * Kept in one place so future parameters get plumbed uniformly.
   */
  private buildOpenUrl(): string {
    if (!this.bridge || !this.webApp) {
      throw new Error("buildOpenUrl called on non-running session");
    }
    const params = new URLSearchParams({
      "ws-port": String(this.bridge.port),
      instance: this.options.instanceLabel,
    });
    if (this.options.recentEventsBufferSize !== undefined) {
      params.set("buffer-size", String(this.options.recentEventsBufferSize));
    }
    return `${this.webApp.url}?${params.toString()}`;
  }
}
