import { describe, it, expect, vi } from "vitest";
import { bindPanelToPipeline } from "../src/panel/bindPanel.js";

// Minimal VisualPipeline shape: we test dispatch → method-call
// forwarding, not any pipeline internals.
function fakePipeline() {
  return {
    setKey: vi.fn(),
    setTempo: vi.fn(),
    setMeter: vi.fn(),
    setChordInterpretation: vi.fn(),
  };
}

function fakeMetronome() {
  return {
    setTempo: vi.fn(),
    setMeter: vi.fn(),
    isRunning: () => false,
  };
}

describe("bindPanelToPipeline — session controls", () => {
  it("session:tempo → pipeline.setTempo + metronome.setTempo", () => {
    const pipeline = fakePipeline();
    const met = fakeMetronome();
    const dispatch = bindPanelToPipeline({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getPipeline: () => pipeline as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getMetronome: () => met as any,
    });
    dispatch("session:tempo", 120);
    expect(pipeline.setTempo).toHaveBeenCalledWith(120);
    expect(met.setTempo).toHaveBeenCalledWith(120);
  });

  it("session:tempo null clears tempo", () => {
    const pipeline = fakePipeline();
    const met = fakeMetronome();
    const dispatch = bindPanelToPipeline({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getPipeline: () => pipeline as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getMetronome: () => met as any,
    });
    dispatch("session:tempo", null);
    expect(pipeline.setTempo).toHaveBeenCalledWith(null);
    expect(met.setTempo).toHaveBeenCalledWith(null);
  });

  it("tonic + mode set together → pipeline.setKey({root, mode})", () => {
    const pipeline = fakePipeline();
    const dispatch = bindPanelToPipeline({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getPipeline: () => pipeline as any,
      getMetronome: () => null,
    });
    dispatch("session:tonic", 2);
    dispatch("session:mode", "dorian");
    // Both dispatches call setKey; the second is the useful one.
    expect(pipeline.setKey).toHaveBeenLastCalledWith({ root: 2, mode: "dorian" });
  });

  it("tonic without mode → setKey(null) (key incomplete)", () => {
    const pipeline = fakePipeline();
    const dispatch = bindPanelToPipeline({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getPipeline: () => pipeline as any,
      getMetronome: () => null,
    });
    dispatch("session:tonic", 5);
    expect(pipeline.setKey).toHaveBeenCalledWith(null);
  });

  it("chord-mode toggles interpretation", () => {
    const pipeline = fakePipeline();
    const dispatch = bindPanelToPipeline({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getPipeline: () => pipeline as any,
      getMetronome: () => null,
    });
    dispatch("session:chord-mode", "bass-led");
    expect(pipeline.setChordInterpretation).toHaveBeenCalledWith("bass-led");
  });

  it("metronome toggle calls onMetronomeToggle callback", () => {
    const onToggle = vi.fn();
    const dispatch = bindPanelToPipeline({
      getPipeline: () => null,
      getMetronome: () => null,
      onMetronomeToggle: onToggle,
    });
    dispatch("session:metronome", true);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("dispatch is safe when pipeline is null (pre-session)", () => {
    const dispatch = bindPanelToPipeline({
      getPipeline: () => null,
      getMetronome: () => null,
    });
    expect(() => dispatch("session:tempo", 100)).not.toThrow();
    expect(() => dispatch("session:tonic", 0)).not.toThrow();
  });

  it("unknown ids are logged, not thrown", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const dispatch = bindPanelToPipeline({
      getPipeline: () => null,
      getMetronome: () => null,
    });
    dispatch("harmony:linger", 5);
    expect(infoSpy).toHaveBeenCalled();
    expect(infoSpy.mock.calls[0][0]).toContain("harmony:linger");
    infoSpy.mockRestore();
  });
});
