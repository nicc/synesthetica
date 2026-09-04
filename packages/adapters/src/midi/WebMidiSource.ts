import type { MidiSource, MidiMessage, MidiInputInfo } from "./MidiSource";

/**
 * Web MIDI API implementation of MidiSource.
 * For use in browser environments.
 */
export class WebMidiSource implements MidiSource {
  private access: MIDIAccess | null = null;
  private messageListeners: Array<(msg: MidiMessage) => void> = [];
  private stateListeners: Array<(input: MidiInputInfo, state: "connected" | "disconnected") => void> = [];
  private inputHandlers: Map<string, (event: MIDIMessageEvent) => void> = new Map();
  /** Whether SysEx access was granted at init. Chrome tends to allow;
   *  Firefox often prompts and users may deny. Some devices (MPE
   *  controllers, MIDI-clock sources, patch-dump-heavy hardware) don't
   *  fully enumerate without SysEx on Firefox specifically. */
  private sysexGranted = false;

  /**
   * Initialize the Web MIDI source.
   * Must be called before using other methods.
   *
   * Requests SysEx access opportunistically — a subset of devices
   * (notably on Firefox) don't fully enumerate without it. Falls
   * back to non-SysEx access if the user denies or the browser
   * rejects. Both paths are functional for note-on/note-off traffic.
   *
   * @returns Promise that resolves when MIDI access is granted.
   */
  async init(): Promise<void> {
    if (!navigator.requestMIDIAccess) {
      throw new Error("Web MIDI API not supported in this browser");
    }

    try {
      this.access = await navigator.requestMIDIAccess({ sysex: true });
      this.sysexGranted = true;
    } catch (err) {
      // Firefox rejects when the WebMIDI site-permission add-on isn't
      // installed — that's not a SysEx-specific denial, and the
      // {sysex:false} retry will fail with the same message. Detect
      // and re-throw so the caller shows the add-on hint immediately
      // instead of waiting for a second reject.
      const msg = err instanceof Error ? err.message : String(err);
      if (/site permission add-on|permission add-on/i.test(msg)) {
        throw err;
      }
      // Otherwise treat as SysEx denial and retry without. Non-SysEx
      // access is sufficient for the notes / velocity / channel data
      // the visualiser actually reads; SysEx just improves device
      // coverage on some browsers.
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.sysexGranted = false;
    }

    // Set up listeners on all current inputs
    for (const input of this.access.inputs.values()) {
      this.attachInputListener(input);
    }

    // Watch for connection changes
    this.access.onstatechange = (event) => {
      const port = event.port;
      if (!port) return;

      if (port.type === "input") {
        const info = this.inputToInfo(port as MIDIInput);
        if (port.state === "connected") {
          this.attachInputListener(port as MIDIInput);
          this.notifyStateChange(info, "connected");
        } else {
          this.detachInputListener(port as MIDIInput);
          this.notifyStateChange(info, "disconnected");
        }
      }
    };
  }

  /** True when the browser granted SysEx access at init. Diagnostic
   *  only — not needed for note-level MIDI. */
  hasSysExAccess(): boolean {
    return this.sysexGranted;
  }

  getInputs(): MidiInputInfo[] {
    if (!this.access) return [];

    const inputs: MidiInputInfo[] = [];
    for (const input of this.access.inputs.values()) {
      inputs.push(this.inputToInfo(input));
    }
    return inputs;
  }

  onMessage(callback: (msg: MidiMessage) => void): () => void {
    this.messageListeners.push(callback);
    return () => {
      const idx = this.messageListeners.indexOf(callback);
      if (idx >= 0) this.messageListeners.splice(idx, 1);
    };
  }

  onStateChange(callback: (input: MidiInputInfo, state: "connected" | "disconnected") => void): () => void {
    this.stateListeners.push(callback);
    return () => {
      const idx = this.stateListeners.indexOf(callback);
      if (idx >= 0) this.stateListeners.splice(idx, 1);
    };
  }

  dispose(): void {
    if (this.access) {
      // Remove all input listeners
      for (const input of this.access.inputs.values()) {
        this.detachInputListener(input);
      }
      this.access.onstatechange = null;
    }

    this.messageListeners = [];
    this.stateListeners = [];
    this.inputHandlers.clear();
    this.access = null;
  }

  private attachInputListener(input: MIDIInput): void {
    if (this.inputHandlers.has(input.id)) return;

    const handler = (event: MIDIMessageEvent) => {
      if (!event.data) return;

      const msg: MidiMessage = {
        data: event.data,
        timestamp: event.timeStamp,
        inputId: input.id,
      };

      for (const listener of this.messageListeners) {
        listener(msg);
      }
    };

    input.onmidimessage = handler;
    this.inputHandlers.set(input.id, handler);
  }

  private detachInputListener(input: MIDIInput): void {
    if (!this.inputHandlers.has(input.id)) return;

    input.onmidimessage = null;
    this.inputHandlers.delete(input.id);
  }

  private inputToInfo(input: MIDIInput): MidiInputInfo {
    return {
      id: input.id,
      name: input.name ?? "Unknown MIDI Device",
      manufacturer: input.manufacturer ?? undefined,
    };
  }

  private notifyStateChange(info: MidiInputInfo, state: "connected" | "disconnected"): void {
    for (const listener of this.stateListeners) {
      listener(info, state);
    }
  }
}
