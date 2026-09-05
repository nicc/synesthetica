import { describe, it, expect } from "vitest";
import { StubEngineHandle } from "../src/engine/stubEngineHandle.js";
import { buildStateResources } from "../src/state/stateResources.js";

describe("state resources — construction", () => {
  it("builds two resources per engine (current + recent-events)", () => {
    const engine = new StubEngineHandle({ label: "piano" });
    const entries = buildStateResources(engine);
    expect(entries).toHaveLength(2);
    expect(entries[0].uri).toBe("state://piano/current");
    expect(entries[1].uri).toBe("state://piano/recent-events");
  });

  it("current is subscribable; recent-events is not (SPEC 013 §I30)", () => {
    const entries = buildStateResources(new StubEngineHandle({ label: "x" }));
    const current = entries.find((e) => e.uri.endsWith("/current"))!;
    const recent = entries.find((e) => e.uri.endsWith("/recent-events"))!;
    expect(current.subscribable).toBe(true);
    expect(recent.subscribable).toBe(false);
  });
});

describe("state://<label>/current — reads live state", () => {
  it("returns the current state snapshot as JSON", async () => {
    const engine = new StubEngineHandle({ label: "default" });
    await engine.setTempo(85);
    await engine.setMacro("harmony:linger", 4);
    const [current] = buildStateResources(engine);
    const json = JSON.parse(await current.read());
    expect(json.session.tempo).toBe(85);
    expect(json.macros.intents["harmony:linger"]).toBe(4);
    expect(json.macros.effective["harmony:linger"]).toBe(4);
  });
});

describe("state://<label>/recent-events — envelope + pull-only query", () => {
  it("returns events up to limit (default 100) wrapped in temporal envelope", async () => {
    const engine = new StubEngineHandle();
    for (let i = 0; i < 5; i++) engine.injectEvent("note-on", { pitch: 60 + i });
    const recent = buildStateResources(engine)[1];
    const envelope = JSON.parse(await recent.read());
    expect(envelope.events).toHaveLength(5);
    expect(envelope.events[0].kind).toBe("note-on");
    // Temporal frame present (null when no session marked started).
    expect(envelope).toHaveProperty("startedAt");
    expect(envelope).toHaveProperty("now");
  });

  it("honours ?limit=<N>", async () => {
    const engine = new StubEngineHandle();
    for (let i = 0; i < 20; i++) engine.injectEvent("note-on");
    const recent = buildStateResources(engine)[1];
    const envelope = JSON.parse(await recent.read("state://default/recent-events?limit=3"));
    expect(envelope.events).toHaveLength(3);
  });

  it("honours ?since=<id>", async () => {
    const engine = new StubEngineHandle();
    for (let i = 0; i < 10; i++) engine.injectEvent("note-on");
    const recent = buildStateResources(engine)[1];
    const envelope = JSON.parse(await recent.read("state://default/recent-events?since=5"));
    // events with id > 5 → ids 6, 7, 8, 9
    expect(envelope.events.every((e: { id: number }) => e.id > 5)).toBe(true);
    expect(envelope.events).toHaveLength(4);
  });

  it("caps limit at 1000 even if larger is requested", async () => {
    const engine = new StubEngineHandle();
    for (let i = 0; i < 1500; i++) engine.injectEvent("note-on");
    const recent = buildStateResources(engine)[1];
    const envelope = JSON.parse(await recent.read("state://default/recent-events?limit=9999"));
    expect(envelope.events).toHaveLength(1000);
  });

  it("envelope populates startedAt + now once a session is marked started", async () => {
    const engine = new StubEngineHandle();
    engine.startSession(1_700_000_000_000);
    engine.injectEvent("note-on", { pitch: 60 });
    const recent = buildStateResources(engine)[1];
    const envelope = JSON.parse(await recent.read());
    expect(envelope.startedAt).toBe(new Date(1_700_000_000_000).toISOString());
    expect(envelope.now).toBeGreaterThanOrEqual(0);
  });
});
