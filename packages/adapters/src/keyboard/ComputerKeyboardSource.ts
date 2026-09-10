/**
 * ComputerKeyboardSource — a MidiSource that turns document
 * keydown/keyup events into MIDI Note On / Note Off messages.
 *
 * Wraps in a RawMidiAdapter the same way WebMidiSource does, so
 * the pipeline treats keyboard input identically to a real MIDI
 * controller — no bespoke "keyboard adapter" path downstream.
 *
 * Also exposes helpers the on-screen keyboard UI needs:
 *   - onPressChange(cb)   — fires whenever the pressed-key set changes
 *   - getPressedKeys()    — current set of held physical key codes
 *
 * Design notes:
 * - Listens to KeyboardEvent.code (physical key) rather than .key
 *   (produced character) so mapping is stable across shift, caps
 *   lock, and non-US layouts. `KeyZ` is `KeyZ` no matter what.
 * - Suppresses OS auto-repeat (event.repeat) — we want one note-on
 *   per physical press.
 * - Fixed mid-range velocity (see KEYBOARD_VELOCITY in keyMap).
 * - Does NOT intercept when the user is typing into an input /
 *   textarea / contenteditable — the About panel search boxes and
 *   any future text fields must not swallow letters as piano notes.
 */

import type {
  MidiInputInfo,
  MidiMessage,
  MidiSource,
} from "../midi/MidiSource";
import { KEY_MAP, KEYBOARD_VELOCITY } from "./keyMap";

const KEYBOARD_INPUT_ID = "keyboard";
const KEYBOARD_INPUT_NAME = "On-screen keyboard";

export class ComputerKeyboardSource implements MidiSource {
  private messageSubscribers: Array<(msg: MidiMessage) => void> = [];
  private pressSubscribers: Array<() => void> = [];
  private pressedKeys: Set<string> = new Set();
  private attached = false;

  private readonly keydownHandler = (event: KeyboardEvent) => {
    if (event.repeat) return;
    if (this.isTypingContext(event)) return;
    const mapping = KEY_MAP[event.code];
    if (!mapping) return;
    if (this.pressedKeys.has(event.code)) return;
    // Prevent the browser's default (e.g. quick-find / spacebar
    // scroll) only for keys we own. Leaves everything else alone.
    event.preventDefault();
    this.pressedKeys.add(event.code);
    this.emitNoteOn(mapping.midiNote);
    this.notifyPressChange();
  };

  private readonly keyupHandler = (event: KeyboardEvent) => {
    const mapping = KEY_MAP[event.code];
    if (!mapping) return;
    if (!this.pressedKeys.has(event.code)) return;
    this.pressedKeys.delete(event.code);
    this.emitNoteOff(mapping.midiNote);
    this.notifyPressChange();
  };

  private readonly blurHandler = () => {
    // Window lost focus — release any held keys so the visualiser
    // doesn't stay stuck on a phantom held note.
    if (this.pressedKeys.size === 0) return;
    for (const code of this.pressedKeys) {
      const mapping = KEY_MAP[code];
      if (mapping) this.emitNoteOff(mapping.midiNote);
    }
    this.pressedKeys.clear();
    this.notifyPressChange();
  };

  /** Start listening to document key events. Idempotent. */
  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener("keydown", this.keydownHandler);
    window.addEventListener("keyup", this.keyupHandler);
    window.addEventListener("blur", this.blurHandler);
  }

  /** Stop listening; release any held notes. */
  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.blurHandler();
    window.removeEventListener("keydown", this.keydownHandler);
    window.removeEventListener("keyup", this.keyupHandler);
    window.removeEventListener("blur", this.blurHandler);
  }

  // ----- MidiSource -----

  getInputs(): MidiInputInfo[] {
    return [{ id: KEYBOARD_INPUT_ID, name: KEYBOARD_INPUT_NAME }];
  }

  onMessage(callback: (msg: MidiMessage) => void): () => void {
    this.messageSubscribers.push(callback);
    return () => {
      const idx = this.messageSubscribers.indexOf(callback);
      if (idx >= 0) this.messageSubscribers.splice(idx, 1);
    };
  }

  dispose(): void {
    this.detach();
    this.messageSubscribers = [];
    this.pressSubscribers = [];
  }

  // ----- UI helpers -----

  onPressChange(callback: () => void): () => void {
    this.pressSubscribers.push(callback);
    return () => {
      const idx = this.pressSubscribers.indexOf(callback);
      if (idx >= 0) this.pressSubscribers.splice(idx, 1);
    };
  }

  getPressedKeys(): ReadonlySet<string> {
    return this.pressedKeys;
  }

  // ----- internals -----

  private emitNoteOn(note: number): void {
    const msg: MidiMessage = {
      data: new Uint8Array([0x90, note, KEYBOARD_VELOCITY]),
      timestamp: performance.now(),
      inputId: KEYBOARD_INPUT_ID,
    };
    for (const sub of this.messageSubscribers) sub(msg);
  }

  private emitNoteOff(note: number): void {
    const msg: MidiMessage = {
      data: new Uint8Array([0x80, note, 0]),
      timestamp: performance.now(),
      inputId: KEYBOARD_INPUT_ID,
    };
    for (const sub of this.messageSubscribers) sub(msg);
  }

  private notifyPressChange(): void {
    for (const sub of this.pressSubscribers) sub();
  }

  private isTypingContext(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    return false;
  }
}
