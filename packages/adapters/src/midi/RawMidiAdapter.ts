/**
 * Raw MIDI Adapter
 *
 * Converts Web MIDI events into RawInputFrame data.
 * Emits protocol-level events (MidiNoteOn, MidiNoteOff) without
 * musical interpretation.
 *
 * See RFC 005 for the frame type architecture.
 */

import type {
  IRawSourceAdapter,
  RawInputFrame,
  RawInput,
  MidiNoteOn,
  MidiNoteOff,
  MidiCC,
  SourceId,
  StreamId,
  Ms,
} from "@synesthetica/contracts";

import type { MidiSource, MidiMessage } from "./MidiSource";

/**
 * Configuration for the Raw MIDI adapter.
 */
export interface RawMidiAdapterConfig {
  /**
   * Source identifier for provenance.
   * @default "midi"
   */
  sourceId?: SourceId;

  /**
   * Stream identifier for provenance.
   * @default "web-midi"
   */
  streamId?: StreamId;

  /**
   * Session start time (performance.now() at session start).
   * All event timestamps will be relative to this.
   */
  sessionStart: number;
}

const DEFAULT_CONFIG: Partial<RawMidiAdapterConfig> = {
  sourceId: "midi",
  streamId: "web-midi",
};

/**
 * Raw MIDI Adapter: Converts Web MIDI events into RawInputFrame.
 *
 * Implements the push-to-pull reconciliation pattern:
 * - MIDI events arrive asynchronously and update internal state
 * - nextFrame() returns accumulated events since last call
 *
 * This adapter emits raw protocol-level events without musical interpretation.
 * Part assignment and musical abstraction happen downstream in stabilizers.
 */
export class RawMidiAdapter implements IRawSourceAdapter {
  readonly source: SourceId;
  readonly stream: StreamId;

  private config: RawMidiAdapterConfig;
  private midiSource: MidiSource;
  private unsubscribe: (() => void) | null = null;

  /** Events accumulated since last nextFrame() call */
  private pendingInputs: RawInput[] = [];

  /** Timestamp of most recent input */
  private lastInputTime: Ms = 0;

  constructor(
    midiSource: MidiSource,
    config: Partial<RawMidiAdapterConfig> &
      Pick<RawMidiAdapterConfig, "sessionStart">
  ) {
    this.midiSource = midiSource;
    this.config = { ...DEFAULT_CONFIG, ...config } as RawMidiAdapterConfig;
    this.source = this.config.sourceId!;
    this.stream = this.config.streamId!;
  }

  /**
   * Start listening to MIDI events.
   */
  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.midiSource.onMessage((msg) =>
      this.handleMessage(msg)
    );
  }

  /**
   * Stop listening to MIDI events.
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Get the next frame of raw input data.
   * Returns null if no events have accumulated since last call.
   */
  nextFrame(): RawInputFrame | null {
    if (this.pendingInputs.length === 0) {
      return null;
    }

    const inputs = this.pendingInputs;
    this.pendingInputs = [];

    return {
      t: this.lastInputTime,
      source: this.source,
      stream: this.stream,
      inputs,
    };
  }

  /**
   * Clear all state. Useful for session reset.
   */
  reset(): void {
    this.pendingInputs = [];
    this.lastInputTime = 0;
  }

  private handleMessage(msg: MidiMessage): void {
    const [status, data1, data2] = msg.data;
    const command = status >> 4;
    const channel = status & 0x0f;

    const t = this.toSessionMs(msg.timestamp);
    this.lastInputTime = t;

    // Note On (0x9) with velocity > 0
    if (command === 0x9 && data2 > 0) {
      const noteOn: MidiNoteOn = {
        type: "midi_note_on",
        t,
        note: data1,
        velocity: data2,
        channel,
      };
      this.pendingInputs.push(noteOn);
    }
    // Note Off (0x8) or Note On with velocity 0
    else if (command === 0x8 || (command === 0x9 && data2 === 0)) {
      const noteOff: MidiNoteOff = {
        type: "midi_note_off",
        t,
        note: data1,
        channel,
      };
      this.pendingInputs.push(noteOff);
    }
    // Control Change (0xB)
    else if (command === 0xb) {
      const cc: MidiCC = {
        type: "midi_cc",
        t,
        controller: data1,
        value: data2,
        channel,
      };
      this.pendingInputs.push(cc);
    }
    // Other MIDI messages ignored for now
  }

  private toSessionMs(timestamp: number): Ms {
    return timestamp - this.config.sessionStart;
  }
}
