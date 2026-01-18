import type {
  CMSFrame,
  ICMSStream,
  NoteOn,
  NoteOff,
  MusicalEvent,
  PartId,
  PitchClass,
  Provenance,
  Ms,
} from "@synesthetica/contracts";

import type { MidiSource, MidiMessage } from "./MidiSource";

/**
 * Configuration for the MIDI adapter.
 */
export interface MidiAdapterConfig {
  /**
   * How to derive PartId from MIDI input.
   * - "input": Each MIDI input becomes a separate part
   * - "channel": Each MIDI channel becomes a separate part
   * - "single": All input goes to a single part
   */
  partStrategy: "input" | "channel" | "single";

  /**
   * Part ID to use when partStrategy is "single".
   * @default "midi"
   */
  singlePartId?: PartId;

  /**
   * Session start time (performance.now() at session start).
   * All event timestamps will be relative to this.
   */
  sessionStart: number;
}

const DEFAULT_CONFIG: Partial<MidiAdapterConfig> = {
  partStrategy: "input",
  singlePartId: "midi",
};

/**
 * MIDI Adapter: Converts Web MIDI events into CMSFrame data.
 *
 * Implements the push-to-pull reconciliation pattern:
 * - MIDI events arrive asynchronously and update internal state
 * - nextFrame() returns accumulated events since last call
 *
 * For Phase 0, only note_on and note_off are supported.
 */
export class MidiAdapter implements ICMSStream {
  private config: MidiAdapterConfig;
  private source: MidiSource;
  private unsubscribe: (() => void) | null = null;

  /** Events accumulated since last nextFrame() call */
  private pendingEvents: MusicalEvent[] = [];

  /** Track which notes are currently held (for note_off matching) */
  private activeNotes: Map<string, NoteOn> = new Map();

  private provenance: Provenance = {
    source: "midi",
    stream: "web-midi",
    version: "0.1.0",
  };

  constructor(source: MidiSource, config: Partial<MidiAdapterConfig> & Pick<MidiAdapterConfig, "sessionStart">) {
    this.source = source;
    this.config = { ...DEFAULT_CONFIG, ...config } as MidiAdapterConfig;
  }

  /**
   * Start listening to MIDI events.
   */
  start(): void {
    if (this.unsubscribe) return; // Already started

    this.unsubscribe = this.source.onMessage((msg) => this.handleMessage(msg));
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
   * Get the next frame of CMS data.
   * Returns null if no events have accumulated since last call.
   */
  nextFrame(): CMSFrame | null {
    if (this.pendingEvents.length === 0) {
      return null;
    }

    // Drain pending events
    const events = this.pendingEvents;
    this.pendingEvents = [];

    // Use the timestamp of the last event as the frame time
    const lastEvent = events[events.length - 1];
    const t = lastEvent.type === "note_on" || lastEvent.type === "note_off"
      ? lastEvent.t
      : 0;

    return {
      t,
      events,
      controls: [], // No control signals for Phase 0
    };
  }

  /**
   * Get currently active (held) notes.
   */
  getActiveNotes(): ReadonlyMap<string, NoteOn> {
    return this.activeNotes;
  }

  /**
   * Clear all state. Useful for session reset.
   */
  reset(): void {
    this.pendingEvents = [];
    this.activeNotes.clear();
  }

  private handleMessage(msg: MidiMessage): void {
    const [status, data1, data2] = msg.data;
    const command = status >> 4;
    const channel = status & 0x0f;

    const t = this.toSessionMs(msg.timestamp);
    const partId = this.derivePartId(msg.inputId, channel);

    // Note On (0x9) with velocity > 0
    if (command === 0x9 && data2 > 0) {
      const noteOn = this.createNoteOn(t, partId, data1, data2, channel);
      this.pendingEvents.push(noteOn);
      this.activeNotes.set(this.noteKey(partId, data1, channel), noteOn);
    }
    // Note Off (0x8) or Note On with velocity 0
    else if (command === 0x8 || (command === 0x9 && data2 === 0)) {
      const noteOff = this.createNoteOff(t, partId, data1, channel);
      this.pendingEvents.push(noteOff);
      this.activeNotes.delete(this.noteKey(partId, data1, channel));
    }
    // Other MIDI messages ignored for Phase 0
  }

  private toSessionMs(timestamp: number): Ms {
    return timestamp - this.config.sessionStart;
  }

  private derivePartId(inputId: string, channel: number): PartId {
    switch (this.config.partStrategy) {
      case "single":
        return this.config.singlePartId!;
      case "channel":
        return `midi-ch${channel + 1}`;
      case "input":
      default:
        return `midi-${inputId}`;
    }
  }

  private noteKey(partId: PartId, note: number, channel: number): string {
    return `${partId}:${note}:${channel}`;
  }

  private createNoteOn(t: Ms, part: PartId, note: number, velocity: number, channel: number): NoteOn {
    return {
      type: "note_on",
      t,
      part,
      note,
      velocity,
      channel,
      pc: (note % 12) as PitchClass,
      octave: Math.floor(note / 12) - 1, // MIDI octave convention
      provenance: this.provenance,
    };
  }

  private createNoteOff(t: Ms, part: PartId, note: number, channel: number): NoteOff {
    return {
      type: "note_off",
      t,
      part,
      note,
      channel,
      provenance: this.provenance,
    };
  }
}
