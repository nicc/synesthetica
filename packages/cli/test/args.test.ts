import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/args.js";

describe("parseArgs — help + defaults", () => {
  it("no args → help", () => {
    expect(parseArgs([]).kind).toBe("help");
  });

  it("--help / -h → help", () => {
    expect(parseArgs(["--help"]).kind).toBe("help");
    expect(parseArgs(["-h"]).kind).toBe("help");
  });

  it("unknown subcommand → error", () => {
    const cmd = parseArgs(["frobnicate"]);
    expect(cmd.kind).toBe("error");
    if (cmd.kind === "error") expect(cmd.message).toContain("unknown command");
  });
});

describe("parseArgs — start", () => {
  it("start with no flags → defaults", () => {
    const cmd = parseArgs(["start"]);
    expect(cmd.kind).toBe("start");
    if (cmd.kind !== "start") return;
    expect(cmd.options.instance).toBeNull();
    expect(cmd.options.transport).toBe("stdio");
    expect(cmd.options.mcpEnabled).toBe(true);
    expect(cmd.options.recentEventsBufferSize).toBe(1000);
    expect(cmd.options.logRetentionDays).toBe(7);
    expect(cmd.options.openBrowser).toBe(true);
    expect(cmd.options.webAppPort).toBeNull();
  });

  it("--instance requires a value", () => {
    const cmd = parseArgs(["start", "--instance"]);
    expect(cmd.kind).toBe("error");
  });

  it("--instance rejects invalid labels", () => {
    // spaces, path chars, too long — all rejected
    expect(parseArgs(["start", "--instance", "has space"]).kind).toBe("error");
    expect(parseArgs(["start", "--instance", "has/slash"]).kind).toBe("error");
    expect(parseArgs(["start", "--instance", "a".repeat(33)]).kind).toBe("error");
  });

  it("--instance accepts alphanumeric + hyphens", () => {
    const cmd = parseArgs(["start", "--instance", "piano-2"]);
    expect(cmd.kind).toBe("start");
    if (cmd.kind === "start") expect(cmd.options.instance).toBe("piano-2");
  });

  it("--port validates integer range", () => {
    expect(parseArgs(["start", "--port", "0"]).kind).toBe("error");
    expect(parseArgs(["start", "--port", "70000"]).kind).toBe("error");
    expect(parseArgs(["start", "--port", "abc"]).kind).toBe("error");
    const cmd = parseArgs(["start", "--port", "3001"]);
    expect(cmd.kind).toBe("start");
    if (cmd.kind === "start") expect(cmd.options.port).toBe(3001);
  });

  it("--transport validates enum", () => {
    expect(parseArgs(["start", "--transport", "websocket"]).kind).toBe("error");
    const cmd = parseArgs(["start", "--transport", "tcp"]);
    expect(cmd.kind).toBe("start");
    if (cmd.kind === "start") expect(cmd.options.transport).toBe("tcp");
  });

  it("--no-mcp toggles standalone", () => {
    const cmd = parseArgs(["start", "--no-mcp"]);
    expect(cmd.kind).toBe("start");
    if (cmd.kind === "start") expect(cmd.options.mcpEnabled).toBe(false);
  });

  it("--recent-events-buffer requires positive int", () => {
    expect(parseArgs(["start", "--recent-events-buffer", "0"]).kind).toBe("error");
    expect(parseArgs(["start", "--recent-events-buffer", "-5"]).kind).toBe("error");
    const cmd = parseArgs(["start", "--recent-events-buffer", "5000"]);
    expect(cmd.kind).toBe("start");
    if (cmd.kind === "start") expect(cmd.options.recentEventsBufferSize).toBe(5000);
  });

  it("--log-retention-days allows 0 (no retention)", () => {
    const cmd = parseArgs(["start", "--log-retention-days", "0"]);
    expect(cmd.kind).toBe("start");
    if (cmd.kind === "start") expect(cmd.options.logRetentionDays).toBe(0);
  });

  it("--no-open disables browser autolaunch", () => {
    const cmd = parseArgs(["start", "--no-open"]);
    expect(cmd.kind).toBe("start");
    if (cmd.kind === "start") expect(cmd.options.openBrowser).toBe(false);
  });

  it("--web-app-port validates integer range", () => {
    expect(parseArgs(["start", "--web-app-port", "0"]).kind).toBe("error");
    expect(parseArgs(["start", "--web-app-port", "abc"]).kind).toBe("error");
    const cmd = parseArgs(["start", "--web-app-port", "5555"]);
    expect(cmd.kind).toBe("start");
    if (cmd.kind === "start") expect(cmd.options.webAppPort).toBe(5555);
  });

  it("--ws-port accepts 0 (auto) through 65535", () => {
    const cmd0 = parseArgs(["start", "--ws-port", "0"]);
    expect(cmd0.kind).toBe("start");
    if (cmd0.kind === "start") expect(cmd0.options.wsPort).toBe(0);
    const cmd = parseArgs(["start", "--ws-port", "8765"]);
    expect(cmd.kind).toBe("start");
    if (cmd.kind === "start") expect(cmd.options.wsPort).toBe(8765);
    expect(parseArgs(["start", "--ws-port", "-1"]).kind).toBe("error");
    expect(parseArgs(["start", "--ws-port", "abc"]).kind).toBe("error");
  });

  it("unknown flag → error", () => {
    expect(parseArgs(["start", "--frobnicate"]).kind).toBe("error");
  });

  it("mixed flags parse together", () => {
    const cmd = parseArgs([
      "start",
      "--instance", "piano",
      "--transport", "tcp",
      "--port", "3002",
      "--recent-events-buffer", "500",
    ]);
    expect(cmd.kind).toBe("start");
    if (cmd.kind !== "start") return;
    expect(cmd.options.instance).toBe("piano");
    expect(cmd.options.transport).toBe("tcp");
    expect(cmd.options.port).toBe(3002);
    expect(cmd.options.recentEventsBufferSize).toBe(500);
  });
});

describe("parseArgs — stop / status", () => {
  it("stop with no args → stop all", () => {
    const cmd = parseArgs(["stop"]);
    expect(cmd.kind).toBe("stop");
    if (cmd.kind === "stop") expect(cmd.instance).toBeNull();
  });

  it("stop --instance targets one", () => {
    const cmd = parseArgs(["stop", "--instance", "guitar"]);
    expect(cmd.kind).toBe("stop");
    if (cmd.kind === "stop") expect(cmd.instance).toBe("guitar");
  });

  it("status takes no args", () => {
    expect(parseArgs(["status"]).kind).toBe("status");
    expect(parseArgs(["status", "extra"]).kind).toBe("error");
  });
});
