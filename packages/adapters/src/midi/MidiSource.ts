/**
 * Abstraction over MIDI input sources for dependency injection.
 * Allows testing the adapter without browser APIs.
 */

export interface MidiInputInfo {
  id: string;
  name: string;
  manufacturer?: string;
}

export interface MidiMessage {
  /** Raw MIDI data: [status, data1, data2] */
  data: Uint8Array;
  /** Timestamp in milliseconds (performance.now() or equivalent) */
  timestamp: number;
  /** Which input this came from */
  inputId: string;
}

export interface MidiSource {
  /**
   * Get available MIDI inputs.
   */
  getInputs(): MidiInputInfo[];

  /**
   * Subscribe to MIDI messages from all inputs.
   * Returns an unsubscribe function.
   */
  onMessage(callback: (msg: MidiMessage) => void): () => void;

  /**
   * Subscribe to connection state changes.
   * Returns an unsubscribe function.
   */
  onStateChange?(callback: (input: MidiInputInfo, state: "connected" | "disconnected") => void): () => void;

  /**
   * Clean up resources.
   */
  dispose?(): void;
}
