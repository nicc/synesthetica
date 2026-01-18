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

  /**
   * Initialize the Web MIDI source.
   * Must be called before using other methods.
   * @returns Promise that resolves when MIDI access is granted.
   */
  async init(): Promise<void> {
    if (!navigator.requestMIDIAccess) {
      throw new Error("Web MIDI API not supported in this browser");
    }

    this.access = await navigator.requestMIDIAccess({ sysex: false });

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
