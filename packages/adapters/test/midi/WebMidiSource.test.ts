import { describe, it, expect, afterEach, vi } from "vitest";
import { WebMidiSource } from "../../src/midi/WebMidiSource";

/**
 * WebMidiSource depends on navigator.requestMIDIAccess. Stub the
 * whole navigator via vi.stubGlobal so we can exercise the SysEx
 * opt-in + fallback path deterministically. Node's real navigator
 * is a read-only getter — vi.stubGlobal handles the property
 * descriptor.
 */

function fakeAccess(): { inputs: Map<string, unknown>; onstatechange: unknown } {
  return { inputs: new Map(), onstatechange: null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubNavigator(requestMIDIAccess: any): void {
  vi.stubGlobal("navigator", { requestMIDIAccess, userAgent: "test" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WebMidiSource.init — SysEx opportunistic access", () => {
  it("uses SysEx when the browser grants it", async () => {
    const calls: Array<{ sysex: boolean }> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stubNavigator(vi.fn(async (opts: any) => {
      calls.push(opts);
      return fakeAccess();
    }));

    const src = new WebMidiSource();
    await src.init();

    expect(calls).toEqual([{ sysex: true }]);
    expect(src.hasSysExAccess()).toBe(true);
    src.dispose();
  });

  it("falls back to non-SysEx when SysEx is denied", async () => {
    const calls: Array<{ sysex: boolean }> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stubNavigator(vi.fn(async (opts: any) => {
      calls.push(opts);
      if (opts.sysex) throw new DOMException("denied", "SecurityError");
      return fakeAccess();
    }));

    const src = new WebMidiSource();
    await src.init();

    expect(calls).toEqual([{ sysex: true }, { sysex: false }]);
    expect(src.hasSysExAccess()).toBe(false);
    src.dispose();
  });

  it("throws when Web MIDI is entirely absent (Safari, etc.)", async () => {
    stubNavigator(undefined);
    const src = new WebMidiSource();
    await expect(src.init()).rejects.toThrow(/Web MIDI API not supported/);
  });

  it("propagates non-SysEx-related failures without retry beyond the fallback", async () => {
    let calls = 0;
    stubNavigator(vi.fn(async () => {
      calls++;
      throw new DOMException("not allowed", "SecurityError");
    }));

    const src = new WebMidiSource();
    await expect(src.init()).rejects.toThrow(/not allowed/);
    // First call = sysex:true (thrown), second = sysex:false (thrown). No third.
    expect(calls).toBe(2);
  });
});
