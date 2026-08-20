import { describe, it, expect, vi } from "vitest";
import { bindPanelToEngine } from "../src/panel/bindPanel.js";

describe("bindPanelToEngine — session control translation", () => {
  it("session:tempo → setTempo(bpm)", () => {
    const onEngineOp = vi.fn();
    const dispatch = bindPanelToEngine({ onEngineOp });
    dispatch("session:tempo", 120);
    expect(onEngineOp).toHaveBeenCalledWith("setTempo", [120]);
  });

  it("session:tempo null → setTempo(null)", () => {
    const onEngineOp = vi.fn();
    const dispatch = bindPanelToEngine({ onEngineOp });
    dispatch("session:tempo", null);
    expect(onEngineOp).toHaveBeenCalledWith("setTempo", [null]);
  });

  it("tonic + mode set together → setKey([root, mode])", () => {
    const onEngineOp = vi.fn();
    const dispatch = bindPanelToEngine({ onEngineOp });
    dispatch("session:tonic", 2);
    dispatch("session:mode", "dorian");
    expect(onEngineOp).toHaveBeenLastCalledWith("setKey", [2, "dorian"]);
  });

  it("tonic without mode → setKey([root, null])", () => {
    const onEngineOp = vi.fn();
    const dispatch = bindPanelToEngine({ onEngineOp });
    dispatch("session:tonic", 5);
    expect(onEngineOp).toHaveBeenCalledWith("setKey", [5, null]);
  });

  it("bpb + beat-value set together → setMeter", () => {
    const onEngineOp = vi.fn();
    const dispatch = bindPanelToEngine({ onEngineOp });
    dispatch("session:beats-per-bar", 6);
    dispatch("session:beat-value", 8);
    expect(onEngineOp).toHaveBeenLastCalledWith("setMeter", [6, 8]);
  });

  it("chord-mode → setChordMode(harmonic|bass-led)", () => {
    const onEngineOp = vi.fn();
    const dispatch = bindPanelToEngine({ onEngineOp });
    dispatch("session:chord-mode", "bass-led");
    expect(onEngineOp).toHaveBeenCalledWith("setChordMode", ["bass-led"]);
  });

  it("chord-mode ignores unknown values", () => {
    const onEngineOp = vi.fn();
    const dispatch = bindPanelToEngine({ onEngineOp });
    dispatch("session:chord-mode", "unknown-mode");
    expect(onEngineOp).not.toHaveBeenCalled();
  });

  it("metronome → setMetronome(boolean)", () => {
    const onEngineOp = vi.fn();
    const dispatch = bindPanelToEngine({ onEngineOp });
    dispatch("session:metronome", true);
    expect(onEngineOp).toHaveBeenCalledWith("setMetronome", [true]);
  });

  it("input:source with non-empty string → setInput", () => {
    const onEngineOp = vi.fn();
    const dispatch = bindPanelToEngine({ onEngineOp });
    dispatch("input:source", "midi:12345");
    expect(onEngineOp).toHaveBeenCalledWith("setInput", ["midi:12345"]);
  });

  it("input:source with empty string is a no-op", () => {
    const onEngineOp = vi.fn();
    const dispatch = bindPanelToEngine({ onEngineOp });
    dispatch("input:source", "");
    expect(onEngineOp).not.toHaveBeenCalled();
  });
});

describe("bindPanelToEngine — macros", () => {
  it("unknown scoped id → setMacro(name, value)", () => {
    const onEngineOp = vi.fn();
    const dispatch = bindPanelToEngine({ onEngineOp });
    dispatch("harmony:linger", 5);
    expect(onEngineOp).toHaveBeenCalledWith("setMacro", ["harmony:linger", 5]);
  });

  it("bare compound macro id → setMacro (contains no colon but not session:*)", () => {
    const onEngineOp = vi.fn();
    const dispatch = bindPanelToEngine({ onEngineOp });
    dispatch("time-horizon", 0.7);
    expect(onEngineOp).toHaveBeenCalledWith("setMacro", ["time-horizon", 0.7]);
  });
});
